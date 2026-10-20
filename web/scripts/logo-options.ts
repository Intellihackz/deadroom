// Logo exploration: four directions drawn from code, shown at large and favicon sizes, on dark and light.
// Run from web/:  npx tsx scripts/logo-options.ts   (writes brand/exploration/)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../../brand/exploration");
mkdirSync(out, { recursive: true });

const INK = "#000000";
const BONE = "#f2f2f2";
const EMBER = "#ff6a2b";

const ot: any = (opentype as any).default ?? opentype;
const font = (() => {
  const buf = readFileSync(resolve(here, "../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff"));
  return ot.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
})();
const n = (v: number) => +v.toFixed(2);
const pathData = (cmds: any[]) =>
  cmds
    .map((c) => (c.type === "M" ? `M${n(c.x)} ${n(c.y)}` : c.type === "L" ? `L${n(c.x)} ${n(c.y)}` : c.type === "C" ? `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}` : c.type === "Q" ? `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}` : c.type === "Z" ? "Z" : ""))
    .join("");
function text(str: string, size: number, tracking: number, x = 0, y = 0) {
  const scale = size / font.unitsPerEm;
  let cx = 0;
  let d = "";
  for (const ch of str) {
    const g = font.charToGlyph(ch);
    d += pathData(g.getPath(x + cx, y, size).commands);
    cx += g.advanceWidth * scale + tracking * size;
  }
  return { d, width: cx - tracking * size, end: cx };
}

// A coffin: narrow at the head, widest at the shoulders, tapering to the feet.   (10,2) (22,2) (27,9) (20,30) (12,30) (5,9)
const COFFIN = "M10 2H22L27 9L20 30H12L5 9Z";

type Mark = { name: string; note: string; svg: (o?: { ink?: string; tile?: boolean }) => string; svgSmall?: (o?: { ink?: string; tile?: boolean }) => string };
const wrap = (body: string, tile?: boolean, tileFill = INK) => `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">${tile ? `<rect width="32" height="32" rx="3" fill="${tileFill}"/>` : ""}${body}</svg>`;

// 1. The slit: a coffin whose lid has slid and lifted, with light in the gap
const slit: Mark = {
  name: "1  the slit",
  note: "the lid has just moved. light in the gap. reads as a coffin at any size",
  svg: (o = {}) => {
    const ink = o.ink ?? BONE;
    return wrap(`<path d="M10 2H22L27 9L25 15H7L5 9Z" transform="translate(1.6 -2.2)" fill="${ink}"/><path d="M7.87 17.6H24.13L20 30H12Z" fill="${ink}"/><path d="M7.87 17.6H24.13L26.6 12.8H8.6Z" fill="${EMBER}"/>`, o.tile);
  },
};

// 2. Seat grid coffin: the coffin built out of seats, one of them lit
const rows = [5, 5, 7, 7, 7, 7, 7, 5, 5, 3, 3];
function gridBody(ink: string) {
  const cell = 2.2;
  const gap = 0.5;
  const step = cell + gap;
  const totalH = rows.length * step - gap;
  const y0 = (32 - totalH) / 2;
  let s = "";
  rows.forEach((w, r) => {
    const x0 = (32 - (7 * step - gap)) / 2 + ((7 - w) / 2) * step;
    for (let c = 0; c < w; c++) {
      const lit = r === 5 && c === Math.floor(w / 2) + 1;
      s += `<rect x="${n(x0 + c * step)}" y="${n(y0 + r * step)}" width="${cell}" height="${cell}" rx="0.4" fill="${lit ? EMBER : ink}"/>`;
    }
  });
  return s;
}
const grid: Mark = {
  name: "2  the seat grid",
  note: "a coffin made of seats, one lit. the same grid as the product",
  svg: (o = {}) => wrap(gridBody(o.ink ?? BONE), o.tile),
};

// 3. The o: the coffin replaces the first o of "room" (the mark alone is the coffin with one lit seat)
const solid: Mark = {
  name: "3  the o",
  note: "the o in deadroom is the coffin. the mark is that letter on its own",
  svg: (o = {}) => wrap(`<path d="${COFFIN}" fill="${o.ink ?? BONE}"/><rect x="13" y="14" width="6" height="6" fill="${EMBER}"/>`, o.tile),
};

// 4. Hairline: an outlined coffin with a small grid, one seat lit. Breathing room in the tile, and a simpler version for tiny sizes.
const pad = (body: string) => `<g transform="translate(2.4 2.1) scale(0.85)">${body}</g>`;
const hair: Mark = {
  name: "4  hairline",
  note: "line only, like the isometric scene. a small grid inside, one seat lit. at 32 px and below it simplifies to the outline and the lit seat",
  svg: (o = {}) => {
    const ink = o.ink ?? BONE;
    let cells = "";
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 2; c++) {
        const lit = r === 1 && c === 1;
        cells += `<rect x="${11.2 + c * 5}" y="${8.4 + r * 6}" width="3.6" height="3.6" fill="${lit ? EMBER : "none"}" stroke="${lit ? EMBER : ink}" stroke-width="${lit ? 0 : 0.8}" opacity="${lit ? 1 : 0.5}"/>`;
      }
    return wrap(pad(`<path d="${COFFIN}" fill="none" stroke="${ink}" stroke-width="1.7" stroke-linejoin="round"/>${cells}`), o.tile);
  },
  svgSmall: (o = {}) => wrap(pad(`<path d="${COFFIN}" fill="none" stroke="${o.ink ?? BONE}" stroke-width="2.6" stroke-linejoin="round"/><rect x="13" y="13.5" width="6" height="6" fill="${EMBER}"/>`), o.tile),
};

const current: Mark = {
  name: "now",
  note: "the current mark: stubby, reads as an egg or a stop sign",
  svg: (o = {}) => wrap(`<path d="M12.5 4h7l4.5 7v11l-4 6h-8l-4-6V11z" fill="${o.ink ?? BONE}"/><rect x="13.5" y="13" width="5" height="5" fill="${EMBER}"/>`, o.tile),
};

// ---- lockups ----
const SIZE = 72;
const TRACK = -0.045;
function lockupFor(m: Mark, dark: boolean) {
  const ink = dark ? BONE : INK;
  const markSize = 84;
  const gap = 22;
  if (m === solid) {
    // "deadr" + coffin + "om"
    const left = text("deadr", SIZE, TRACK, 0, 0);
    const adv = font.charToGlyph("o").advanceWidth * (SIZE / font.unitsPerEm);
    const startO = left.end;
    const s = 1.5; // coffin 22 x 28 units -> 33 x 42 px, the height of a lowercase o
    const ox = startO + (adv - 22 * s) / 2;
    const glyph = `<g transform="translate(${n(ox - 5 * s)} ${n(-42 + 1 - 2 * s)}) scale(${s})"><path d="${COFFIN}" fill="${ink}"/><rect x="13" y="14" width="6" height="6" fill="${EMBER}"/></g>`;
    const right = text("om", SIZE, TRACK, startO + adv + TRACK * SIZE, 0);
    const w = startO + adv + TRACK * SIZE + right.width;
    const h = 90;
    return `<svg viewBox="-4 -66 ${n(w + 8)} ${h}" xmlns="http://www.w3.org/2000/svg"><path d="${left.d}" fill="${ink}"/>${glyph}<path d="${right.d}" fill="${ink}"/></svg>`;
  }
  const t = text("deadroom", SIZE, TRACK, 0, 0);
  const w = markSize + gap + t.width;
  const baseline = markSize * 0.5 + SIZE * 0.36;
  const mk = m.svg({ ink }).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  return `<svg viewBox="0 0 ${n(w)} ${markSize}" xmlns="http://www.w3.org/2000/svg"><g transform="scale(${markSize / 32})">${mk}</g><path transform="translate(${markSize + gap} ${n(baseline)})" d="${t.d}" fill="${ink}"/></svg>`;
}

const options = [slit, grid, solid, hair];
for (const m of [current, ...options]) {
  const key = m.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  writeFileSync(resolve(out, `${key}.svg`), m.svg({ tile: true }));
  writeFileSync(resolve(out, `${key}-lockup-dark.svg`), lockupFor(m, true));
}

// ---- contact sheet ----
const cell = (m: Mark, rec = false) => `
<div class="opt ${rec ? "rec" : ""}">
  <div class="name">${m.name}</div>
  <div class="big">${m.svg({ tile: true })}</div>
  <div class="small">
    <span class="px64">${m.svg({ tile: true })}</span><span class="px32">${(m.svgSmall ?? m.svg)({ tile: true })}</span><span class="px16">${(m.svgSmall ?? m.svg)({ tile: true })}</span>
    <span class="px32 lt">${(m.svgSmall ?? m.svg)({ ink: INK, tile: true }).replace(`fill="${INK}"/>`, `fill="#fff"/>`)}</span>
  </div>
  <div class="lock dark">${lockupFor(m, true)}</div>
  <div class="lock light">${lockupFor(m, false)}</div>
  <div class="note">${m.note}</div>
</div>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Deadroom logo options</title><style>
@font-face{font-family:JB;src:url("../../web/node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2");font-weight:100 800}
body{margin:0;background:#000;color:#f2f2f2;font:400 13px/1.6 JB,monospace}
.wrap{max-width:1360px;margin:0 auto;padding:40px}
h1{font-weight:400;font-size:40px;letter-spacing:-.06em;margin:0 0 6px}p{color:#858585;margin:0 0 28px}
.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:14px}
.opt{border:1px solid #262626;padding:16px;display:grid;gap:12px;align-content:start}
.opt.rec{border-color:#ff6a2b}
.name{font-size:15px;letter-spacing:-.03em}
.big svg{width:100%;height:auto;display:block;border:1px solid #1a1a1a}
.small{display:flex;align-items:flex-end;gap:12px;padding:10px;background:#0a0a0a;border:1px solid #1a1a1a}
.small svg{display:block;width:100%;height:100%}.px64{width:64px;height:64px}.px32{width:32px;height:32px}.px16{width:16px;height:16px}.lt{background:#fff}
.lock{padding:14px}.lock svg{width:100%;height:auto;display:block}.lock.dark{background:#000;border:1px solid #1a1a1a}.lock.light{background:#fff}
.note{color:#858585;font-size:12px}
</style></head><body><div class="wrap"><h1>deadroom, logo directions</h1><p>Each shown as the app tile, at 64, 32 and 16 px, as a lockup on dark and on light.</p>
<div class="grid">${cell(current)}${cell(slit)}${cell(grid)}${cell(solid)}${cell(hair, true)}</div></div></body></html>`;
writeFileSync(resolve(out, "logo-options.html"), html);
console.log("wrote", out);
