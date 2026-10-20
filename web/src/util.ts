import type { Config, Room, RoomStatus } from "./api";

export function formatEther(wei: bigint): string {
  const neg = wei < 0n;
  const s = (neg ? -wei : wei).toString().padStart(19, "0");
  const frac = s.slice(-18).replace(/0+$/, "");
  return (neg ? "-" : "") + s.slice(0, -18) + (frac ? "." + frac : "");
}

export function parseEther(v: string): bigint {
  const [i, f = ""] = v.split(".");
  return BigInt(i || "0") * 10n ** 18n + BigInt((f + "0".repeat(18)).slice(0, 18));
}

export const toHex = (n: bigint | number) => "0x" + n.toString(16);

export const eth = (wei: bigint | string, max = 4) => {
  const n = Number(formatEther(BigInt(wei)));
  if (n === 0) return "0";
  const s = n >= 1 ? n.toFixed(Math.min(max, 3)) : n.toPrecision(Math.min(max, 3));
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
};

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// ipfs images go through our own server: public gateways block cross-origin embedding
export const ipfs = (u: string) => (u.startsWith("ipfs://") ? `/api/ipfs/${u.slice(7).split("/")[0]}` : u);

export const tokens = (raw: string | undefined) => {
  if (!raw) return "0";
  const n = Number(formatEther(BigInt(raw)));
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(2);
};

export const STATUS: Record<RoomStatus, { label: string; tone: "ember" | "bone" | "ash" | "red" }> = {
  open: { label: "sealed", tone: "bone" },
  launching: { label: "opening", tone: "ember" },
  distributing: { label: "rising", tone: "ember" },
  live: { label: "risen", tone: "ember" },
  expired: { label: "buried", tone: "ash" },
  failed: { label: "rotted", tone: "red" },
};

export function timeLeft(deadline?: number) {
  if (!deadline) return "No deadline";
  const ms = deadline - Date.now();
  if (ms <= 0) return "Deadline passed";
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  return h >= 48 ? `${Math.floor(h / 24)}d left` : h >= 1 ? `${h}h ${m}m left` : `${m}m left`;
}

export function ago(t: number) {
  const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Expected size of the buy: the seats' money minus the launch fee and the gas hold-back. */
export function buyAmount(cfg: Config, seats: number, seatPriceWei: bigint) {
  const pool = seatPriceWei * BigInt(seats);
  const reserve = (BigInt(cfg.gasLaunch) + BigInt(cfg.gasTransfer) * BigInt(seats)) * BigInt(cfg.gasPriceWei) * BigInt(cfg.gasBuffer);
  // the platform fee pays the launch and gas first, so what is held back is the larger of the two
  const costs = BigInt(cfg.launchFeeWei) + reserve;
  const fee = (pool * BigInt(cfg.feeBps ?? 0)) / 10_000n;
  const take = fee > costs ? fee : costs;
  const buy = pool - take;
  return { pool, reserve, fee, take, buy: buy > 0n ? buy : 0n };
}

export const roomBuy = (cfg: Config, r: Room) => buyAmount(cfg, r.target, BigInt(r.seatPriceWei));

export const hue = (addr: string) => parseInt(addr.slice(2, 8), 16) % 360;

export const GRAD_ETH = 4.2;

/** On image load: if the corners are light (a white tile behind the mark), flip it so it sits on the dark page. */
export function monoOnLoad(e: { currentTarget: HTMLImageElement }) {
  const img = e.currentTarget;
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 16;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, 16, 16);
    const lum = (x: number, y: number) => {
      const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
      return a < 40 ? 0 : (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    };
    const corners = (lum(0, 0) + lum(15, 0) + lum(0, 15) + lum(15, 15)) / 4;
    img.classList.toggle("inv", corners > 0.6);
  } catch {
    /* images from other sites cannot be read, leave them as they are */
  }
}
