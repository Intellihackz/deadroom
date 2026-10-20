// Builds every brand asset from code: mark, wordmark, favicons, X avatar and banner, link preview.
// Run from web/:  npx tsx scripts/brand.ts
// Text is turned into outlines with the real font, so no image depends on a font being installed.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";
import { Resvg } from "@resvg/resvg-js";
import { sceneStill } from "../src/motion/scene";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const out = resolve(root, "brand");
const pub = resolve(here, "../public");
for (const d of ["", "mark", "wordmark", "social", "icons"]) mkdirSync(resolve(out, d), { recursive: true });

// ---- palette (the only colours the brand uses) ----
const INK = "#000000";
const BONE = "#f2f2f2";
const ASH = "#858585";
const LINE = "#3a3a3a";
const EMBER = "#ff6a2b";

// ---- font ----
const ot: any = (opentype as any).default ?? opentype;
const loadFont = (weight: number) => {
  const buf = readFileSync(resolve(here, `../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-${weight}-normal.woff`));
  return ot.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
};
const F700 = loadFont(700);
const F500 = loadFont(500);
const F400 = loadFont(400);

const n = (v: number) => +v.toFixed(2);
/** opentype's toPathData can emit NaN for some glyphs, so serialise the commands by hand */
function pathData(cmds: any[]) {
  return cmds
    .map((c) => {
      switch (c.type) {
        case "M": return `M${n(c.x)} ${n(c.y)}`;
        case "L": return `L${n(c.x)} ${n(c.y)}`;
        case "C": return `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
        case "Q": return `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`;
        case "Z": return "Z";
        default: return "";
      }
    })
    .join("");
}

/** Lay text out glyph by glyph with tracking (in em), return path data and the advance width. */
function text(font: any, str: string, size: number, tracking = 0, x = 0, y = 0) {
  const scale = size / font.unitsPerEm;
  let cx = 0;
  let d = "";
  for (const ch of str) {
    const g = font.charToGlyph(ch);
    d += pathData(g.getPath(x + cx, y, size).commands);
    cx += g.advanceWidth * scale + tracking * size;
  }
  return { d, width: cx - tracking * size };
}
/** same, but centred on x = 0 (used for the stone lettering) */
const outline = (str: string, size: number) => {
  const w = text(F500, str, size, 0.02).width;
  return text(F500, str, size, 0.02, -w / 2, 0).d;
};

// ---- the mark: a coffin with one lit seat ----
// The mark: a tombstone that is also a door, with light under it. 32 x 32 box, centred.
const door = (arch: string, light: string) =>
  `<path d="M10 24.8V10.8A6 6 0 0 1 22 10.8V24.8" fill="none" stroke="${arch}" stroke-width="3" stroke-linejoin="round"/><rect x="6.5" y="24.8" width="19" height="2.8" fill="${light}"/>`;
const mark = (o: { tile?: boolean; body?: string; seat?: string; tileFill?: string } = {}) =>
  `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">${o.tile ? `<rect width="32" height="32" rx="3" fill="${o.tileFill ?? INK}"/>` : ""}${door(o.body ?? BONE, o.seat ?? EMBER)}</svg>`;

const save = (rel: string, data: string | Buffer) => writeFileSync(resolve(out, rel), data);
const png = (svg: string, width: number, bg?: string) => new Resvg(svg, { fitTo: { mode: "width", value: width }, background: bg }).render().asPng();

// ---- mark files ----
save("mark/mark.svg", mark());
save("mark/mark-tile.svg", mark({ tile: true }));
save("mark/mark-bone.svg", mark({ seat: BONE }));
save("mark/mark-ink.svg", mark({ body: INK, seat: EMBER }));
save("mark/mark-tile.png", png(mark({ tile: true }), 1024));
save("mark/mark.png", png(mark(), 1024));

// ---- wordmark: the mark, then "deadroom" in lowercase bold, tight ----
function lockup(dark: boolean) {
  const size = 72;
  const t = text(F700, "deadroom", size, -0.045, 0, 0);
  const markSize = 84;
  const gap = 22;
  const w = markSize + gap + t.width;
  const h = markSize;
  const baseline = h * 0.5 + size * 0.36; // optical centre
  const ink = dark ? BONE : INK;
  const body = dark ? BONE : INK;
  return `<svg viewBox="0 0 ${n(w)} ${h}" xmlns="http://www.w3.org/2000/svg"><g transform="scale(${markSize / 32})">${door(body, EMBER)}</g><path transform="translate(${markSize + gap} ${n(baseline)})" d="${t.d}" fill="${ink}"/></svg>`;
}
save("wordmark/wordmark-on-dark.svg", lockup(true));
save("wordmark/wordmark-on-light.svg", lockup(false));
save("wordmark/wordmark-on-dark.png", png(lockup(true), 1600));
save("wordmark/wordmark-on-light.png", png(lockup(false), 1600, "#ffffff"));

// ---- favicons ----
const tile = mark({ tile: true });
writeFileSync(resolve(pub, "favicon.svg"), tile);
for (const s of [16, 32, 48]) save(`icons/favicon-${s}.png`, png(tile, s));
save("icons/apple-touch-icon.png", png(tile, 180));
save("icons/icon-192.png", png(tile, 192));
save("icons/icon-512.png", png(tile, 512));
// maskable: the mark sits inside the safe zone on a full-bleed tile
const maskable = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><rect width="32" height="32" fill="${INK}"/><g transform="translate(5.6 5.6) scale(0.65)">${door(BONE, EMBER)}</g></svg>`;
save("icons/icon-maskable-512.png", png(maskable, 512));
for (const f of ["apple-touch-icon.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png"]) writeFileSync(resolve(pub, f), readFileSync(resolve(out, "icons", f)));
writeFileSync(resolve(pub, "favicon-32.png"), readFileSync(resolve(out, "icons/favicon-32.png")));

// ---- X avatar ----
const avatar = `<svg viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg"><rect width="800" height="800" fill="${INK}"/><g transform="translate(160 160) scale(15)">${door(BONE, EMBER)}</g></svg>`;
save("social/x-avatar.svg", avatar);
save("social/x-avatar.png", png(avatar, 800));

// ---- headline helper ----
function headline(x: number, y: number, size: number) {
  const a = text(F500, "pay to ", size, -0.075, x, y);
  const b = text(F500, "resurrect.", size, -0.075, x + a.width + size * 0.6 * -0.075, y);
  return `<path d="${a.d}" fill="${BONE}"/><path d="${b.d}" fill="${EMBER}"/>`;
}
function headline2(x: number, y1: number, y2: number, size: number) {
  return `<path d="${text(F500, "pay to", size, -0.075, x, y1).d}" fill="${BONE}"/><path d="${text(F500, "resurrect.", size, -0.075, x, y2).d}" fill="${EMBER}"/>`;
}
const line = (str: string, x: number, y: number, size: number, color: string, font = F400) => `<path d="${text(font, str, size, 0.01, x, y).d}" fill="${color}"/>`;

// ---- X banner 1500 x 500 (the left 300px stay clear for the profile photo) ----
{
  const W = 1500;
  const H = 500;
  const scene = sceneStill({ fill: 1, lift: 0.62, box: { x: 880, y: -30, w: 560, h: 500 }, strokePx: 1.5, outline });
  const svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" fill="${INK}"/>${scene}${line("robinhood chain / built on pons", 334, 118, 17, ASH)}${headline2(330, 214, 300, 82)}${line("fill the coffin. same seat, same price, same block.", 334, 356, 21, ASH)}</svg>`;
  save("social/x-banner.svg", svg);
  save("social/x-banner.png", png(svg, 1500));
}

// ---- link preview 1200 x 630 ----
{
  const W = 1200;
  const H = 630;
  const scene = sceneStill({ fill: 1, lift: 0.58, box: { x: 610, y: 20, w: 620, h: 554 }, strokePx: 1.6, outline });
  const wmW = 84 + 22 + text(F700, "deadroom", 72, -0.045).width;
  const wm = lockup(true).replace(/^<svg viewBox="[^"]+"/, `<svg x="64" y="52" width="260" height="${n(260 * (84 / wmW))}" viewBox="0 0 ${n(wmW)} 84"`);
  const svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" fill="${INK}"/>${scene}${wm}${headline2(60, 330, 440, 104)}${line("fill the coffin. same seat, same price, same block.", 66, 500, 22, ASH)}${line("robinhood chain / built on pons", 66, 578, 19, ASH)}</svg>`;
  save("social/og-image.svg", svg);
  const og = png(svg, 1200);
  save("social/og-image.png", og);
  writeFileSync(resolve(pub, "og-image.png"), og);
}

console.log("brand assets written to", out);
