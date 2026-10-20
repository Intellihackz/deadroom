import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { formatEther, type Hex } from "viem";
import { z } from "zod";
import { createChallenge, sessionAddress, verifyChallenge } from "./auth.js";
import { isAddr } from "./chain.js";
import {
  ADMIN_KEY,
  CHAIN_ID,
  CORS_ORIGIN,
  EXPLORER,
  FEE_BPS,
  FEE_ENABLED,
  FACTORY,
  GAS_BUFFER,
  GAS_LAUNCH,
  GAS_TRANSFER,
  MASTER_MNEMONIC,
  MAX_SEATS,
  MIN_SEATS,
  MIN_SEAT_WEI,
  ON_RAILWAY,
  PORT,
  ROUTER,
} from "./config.js";
import { burnNote, ledger, runBurns } from "./fees.js";
import { cachedChainConfig, expireRoom, fillRoom, retryRefunds, runBuyback, tick } from "./engine.js";
import {
  HttpError,
  createRoom,
  createSchema,
  duplicateOf,
  errMsg,
  joinRoom,
  leaveRoom,
  leaveSchema,
  toPublic,
  tokenInfo,
} from "./rooms.js";
import { allRooms, flush, getRoom, loadDb, storageInfo } from "./store.js";

if (!MASTER_MNEMONIC) {
  console.error("MASTER_MNEMONIC is not set. Run `npm run keygen` (local) or set it in the host env.");
  process.exit(1);
}
if (ON_RAILWAY && !process.env.RAILWAY_VOLUME_MOUNT_PATH && !process.env.DATA_DIR) {
  console.warn("WARNING: running on Railway without a Volume. Rooms and seats are lost on every deploy.");
}

loadDb();

const app = new Hono();
app.use("*", cors({ origin: CORS_ORIGIN }));
app.use(
  "*",
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // the app sets inline styles for sizes and colours
      imgSrc: ["'self'", "data:", "https:"], // token logos can be https links
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  }),
);

// Plain in-memory rate limits per address. One server instance only, which is how this app runs.
const hits = new Map<string, number[]>();
const clientIp = (c: { req: { header: (n: string) => string | undefined } }) => c.req.header("x-forwarded-for")?.split(",")[0].trim() || "local";
function limit(bucket: string, max: number, windowMs: number) {
  return async (c: any, next: () => Promise<void>) => {
    const key = `${bucket}:${clientIp(c)}`;
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) return c.json({ error: "too many requests, slow down" }, 429);
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 20_000) hits.clear();
    await next();
  };
}
app.use("/api/auth/*", limit("auth", 20, 60_000));
app.use("/api/rooms/*", async (c, next) => (c.req.method === "POST" ? limit("act", 40, 60_000)(c, next) : next()));
app.use("/api/token/*", limit("token", 60, 60_000));
app.use("/api/ipfs/*", limit("img", 300, 60_000));

app.onError((e, c) => {
  if (e instanceof HttpError) return c.json({ error: e.message }, e.status as 400);
  if (e instanceof z.ZodError) return c.json({ error: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, 400);
  console.error(e);
  return c.json({ error: errMsg(e) }, 500);
});

const admin = (c: { req: { header: (n: string) => string | undefined } }) => {
  if (!ADMIN_KEY || c.req.header("x-admin-key") !== ADMIN_KEY) throw new HttpError(403, "forbidden");
};

// simple in-memory limiter for room creation
const created = new Map<string, number[]>();
function limitCreate(ip: string) {
  const now = Date.now();
  const recent = (created.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (recent.length >= 10) throw new HttpError(429, "too many coffins from this address, try later");
  recent.push(now);
  created.set(ip, recent);
}

app.get("/health", async (c) =>
  c.json({ ok: true, chainId: CHAIN_ID, storage: storageInfo(), rooms: allRooms().length, persistent: !ON_RAILWAY || Boolean(process.env.RAILWAY_VOLUME_MOUNT_PATH) }),
);

app.get("/api/config", async (c) => {
  const { launchFee, gasPrice } = await cachedChainConfig();
  return c.json({
    chainId: CHAIN_ID,
    explorer: EXPLORER,
    factory: FACTORY,
    router: ROUTER,
    launchFeeWei: launchFee.toString(),
    gasPriceWei: gasPrice.toString(),
    gasLaunch: GAS_LAUNCH.toString(),
    gasTransfer: GAS_TRANSFER.toString(),
    gasBuffer: GAS_BUFFER,
    minSeats: MIN_SEATS,
    maxSeats: MAX_SEATS,
    minSeatWei: MIN_SEAT_WEI.toString(),
    feeBps: FEE_ENABLED ? FEE_BPS : 0,
  });
});

// Public: every fee taken, what it paid for, where it went, and every burn with its transactions.
app.get("/api/ledger", (c) => c.json(ledger()));

app.get("/api/token/:address", async (c) => {
  const a = c.req.param("address");
  if (!isAddr(a)) throw new HttpError(400, "bad address");
  return c.json({ ...(await tokenInfo(a)), openRooms: duplicateOf(a) });
});

// Logos on Pons are ipfs:// images. Public gateways block cross-origin embedding, so we fetch them once and serve them same-origin.
// Only IPFS content ids are accepted, from one fixed gateway, images only, 2 MB max.
const logoCache = new Map<string, { type: string; body: ArrayBuffer }>();
app.get("/api/ipfs/:cid", async (c) => {
  const cid = c.req.param("cid");
  if (!/^[a-zA-Z0-9]{40,120}$/.test(cid)) throw new HttpError(400, "bad content id");
  let hit = logoCache.get(cid);
  if (!hit) {
    // Pons's own image service first (public gateways like ipfs.io are rate limited and being sunset), a gateway as backup
    let r: Response | null = null;
    let type = "";
    for (const url of [`https://dbk-vercel.vercel.app/api/ipfs/content/${cid}?variant=card`, `https://ipfs.io/ipfs/${cid}`]) {
      r = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: "follow" }).catch(() => null);
      type = r?.headers.get("content-type") ?? "";
      if (r?.ok && type.startsWith("image/") && !type.includes("svg")) break;
      r = null;
    }
    if (!r) throw new HttpError(404, "image not available");
    const body = await r.arrayBuffer();
    if (body.byteLength > 2_000_000) throw new HttpError(413, "image too large");
    hit = { type, body };
    if (logoCache.size >= 100) logoCache.delete(logoCache.keys().next().value as string);
    logoCache.set(cid, hit);
  }
  return new Response(hit.body, { headers: { "content-type": hit.type, "cache-control": "public, max-age=604800, immutable", "x-content-type-options": "nosniff" } });
});

app.get("/api/rooms", (c) => {
  const status = c.req.query("status");
  const rooms = allRooms()
    .filter((r) => !r.pending) // coffins whose creator has not taken seat 1 yet are not listed
    .filter((r) => !status || r.status === status)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 100)
    .map(toPublic);
  return c.json({ rooms });
});

app.get("/api/rooms/:id", (c) => {
  const room = getRoom(c.req.param("id"));
  if (!room) throw new HttpError(404, "room not found");
  return c.json({ room: toPublic(room) });
});

app.post("/api/rooms", async (c) => {
  // Digging up a coffin needs a signed-in wallet. That wallet is the creator and must take the first seat.
  const creator = sessionAddress(c.req.header("authorization"));
  if (!creator) throw new HttpError(401, "connect your wallet and sign in to dig up a coffin");
  limitCreate(clientIp(c));
  const input = createSchema.parse(await c.req.json());
  const dupes = duplicateOf(input.tokenAddress);
  const room = createRoom(input, creator);
  return c.json({ room: toPublic(room), warning: dupes.length ? "This token is already being dug up in another coffin." : undefined, otherRooms: dupes });
});

app.post("/api/rooms/:id/join", async (c) => {
  const { txHash } = z.object({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) }).parse(await c.req.json());
  const result = await joinRoom(c.req.param("id"), txHash as Hex, (id) => void fillRoom(id));
  return c.json(result);
});

app.get("/api/auth/challenge", (c) => {
  const a = c.req.query("address");
  if (!isAddr(a)) throw new HttpError(400, "bad address");
  return c.json({ message: createChallenge(a) });
});

app.post("/api/auth/verify", async (c) => {
  const { address, signature } = z.object({ address: z.string().refine(isAddr), signature: z.string().regex(/^0x[0-9a-fA-F]+$/) }).parse(await c.req.json());
  const session = await verifyChallenge(address as `0x${string}`, signature as `0x${string}`);
  if (!session) throw new HttpError(401, "that signature did not check out, or the request expired. Try connecting again.");
  return c.json(session);
});

app.post("/api/rooms/:id/leave", async (c) => {
  const body = await c.req.json();
  const signedIn = sessionAddress(c.req.header("authorization"));
  // A valid session for the same address replaces the extra signature prompt.
  const viaSession = signedIn && typeof body?.address === "string" && body.address.toLowerCase() === signedIn;
  const input = leaveSchema.parse(viaSession ? { timestamp: Date.now(), signature: "0x00", ...body } : body);
  return c.json({ room: await leaveRoom(c.req.param("id"), input, Boolean(viaSession)) });
});

// ---- crawlers: robots and sitemap use SITE_URL, which is the public address (set it when you deploy) ----
// A missing scheme is the easy mistake ("my-app.up.railway.app"), so add https:// instead of publishing broken addresses.
const rawSite = (process.env.SITE_URL ?? "").trim().replace(/\/+$/, "");
const SITE = rawSite && !/^https?:\/\//i.test(rawSite) ? `https://${rawSite}` : rawSite;
app.get("/robots.txt", (c) => c.text(`User-agent: *\nAllow: /\n${SITE ? `Sitemap: ${SITE}/sitemap.xml\n` : ""}`));
app.get("/sitemap.xml", (c) => {
  if (!SITE) throw new HttpError(404, "SITE_URL is not set");
  const urls = ["/", ...allRooms().filter((r) => !r.pending && (r.status === "open" || r.status === "live")).map((r) => `/c/${r.id}`)];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE}${u}</loc></url>`).join("\n")}\n</urlset>\n`;
  return c.body(xml, 200, { "content-type": "application/xml" });
});

// ---- admin ----
app.post("/api/admin/rooms/:id/fill", (c) => (admin(c), fillRoom(c.req.param("id")).then(() => c.json({ ok: true }))));
app.post("/api/admin/rooms/:id/expire", (c) => (admin(c), expireRoom(c.req.param("id")).then(() => c.json({ ok: true }))));
app.post("/api/admin/rooms/:id/refunds", (c) => (admin(c), retryRefunds(c.req.param("id")).then(() => c.json({ ok: true }))));
app.post("/api/admin/burn", (c) => (admin(c), runBurns().then(() => c.json({ ok: true, note: burnNote }))));
app.post("/api/admin/rooms/:id/buyback", (c) => (admin(c), runBuyback(c.req.param("id")).then(() => c.json({ ok: true }))));

// ---- static web build (single deploy) ----
const webDist = resolve(process.cwd(), "../web/dist");
if (existsSync(webDist)) {
  // Single page app. index.html names hashed assets, so re-read it when a rebuild changes it (one stat per request).
  const indexPath = resolve(webDist, "index.html");
  let cached = { mtime: 0, ok: "", notFound: "" };
  const pages = () => {
    const mtime = statSync(indexPath).mtimeMs;
    if (mtime !== cached.mtime) {
      const html = readFileSync(indexPath, "utf8");
      cached = {
        mtime,
        ok: html,
        notFound: html
          .replace(/<!--boot-->[\s\S]*<!--\/boot-->/, '<main class="wrap" id="main"><div class="stage-text boot"><p class="eyebrow">404</p><h1>nothing is <em>buried</em> here.</h1><p class="lede">this plot is empty. the coffin you wanted was never dug up, or it was moved.</p><p><a href="/" class="btn">back to the coffins</a></p></div></main>')
          .replace(/<title>[^<]*<\/title>/, "<title>Nothing buried here · Deadroom</title>"),
      };
    }
    return cached;
  };
  // App routes get index.html; unknown paths get the same shell with a real 404 status.
  const servePage = (c: any) => {
    const p: string = c.req.path;
    const known = p === "/" || p === "/new" || p === "/ledger" || /^\/[cr]\/[a-z0-9]+\/?$/i.test(p);
    const page = pages();
    // the canonical link is added here because it needs the public address and the path of this very page
    const canonical = SITE && known ? `<link rel="canonical" href="${SITE}${p === "/new" ? "/" : p.replace(/^\/r\//, "/c/").replace(/\/$/, "") || "/"}" />` : "";
    return c.html((known ? page.ok : page.notFound).replace("<!--canonical-->", canonical), known ? 200 : 404);
  };
  app.get("/", servePage); // before the static handler, which would otherwise serve index.html for "/" untouched
  app.use("/*", serveStatic({ root: "../web/dist" }));
  app.get("*", servePage);
}

const server = serve({ fetch: app.fetch, port: PORT }, (i) => {
  console.log(`deadroom server on :${i.port} (chain ${CHAIN_ID}, ${allRooms().length} rooms)`);
});

setInterval(() => tick(), 15_000);
setTimeout(() => tick(), 2_000);

const stop = () => {
  flush();
  server.close();
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
void formatEther;
