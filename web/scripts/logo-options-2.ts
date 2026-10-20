// Logo exploration, round 2: away from the coffin outline. Run from web/:  npx tsx scripts/logo-options-2.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../../brand/exploration");
mkdirSync(out, { recursive: true });

const INK = "#000000";
const BONE = "#f2f2f2";
const DIM = "#2c2c2c";
const EMBER = "#ff6a2b";

const ot: any = (opentype as any).default ?? opentype;
const font = (() => {
  const buf = readFileSync(resolve(here, "../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff"));
  return ot.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
})();
const n = (v: number) => +v.toFixed(2);
const cmdStr = (c: any) => (c.type === "M" ? `M${n(c.x)} ${n(c.y)}` : c.type === "L" ? `L${n(c.x)} ${n(c.y)}` : c.type === "C" ? `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}` : c.type === "Q" ? `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}` : c.type === "Z" ? "Z" : "");
const pathData = (cmds: any[]) => cmds.map(cmdStr).join("");

/** split a glyph's commands into its contours (outer shape first, then holes) */
function contours(cmds: any[]) {
  const list: any[][] = [];
  for (const c of cmds) {
    if (c.type === "M") list.push([]);
    list[list.length - 1]?.push(c);
  }
  const area = (cs: any[]) => {
    const xs = cs.flatMap((c) => [c.x, c.x1, c.x2]).filter((v) => typeof v === "number");
    const ys = cs.flatMap((c) => [c.y, c.y1, c.y2]).filter((v) => typeof v === "number");
    return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
  };
  return list.sort((a, b) => area(b) - area(a));
}

/** text outlines; `lit` is the index of a letter whose counter (the hole) is filled with ember */
function text(str: string, size: number, tracking: number, x = 0, y = 0, lit = -1) {
  const scale = size / font.unitsPerEm;
  let cx = 0;
  let d = "";
  let ember = "";
  let i = 0;
  for (const ch of str) {
    const g = font.charToGlyph(ch);
    const cmds = g.getPath(x + cx, y, size).commands;
    d += pathData(cmds);
    if (i === lit) {
      const cs = contours(cmds);
      if (cs[1]) ember += pathData(cs[1]);
    }
    cx += g.advanceWidth * scale + tracking * size;
    i++;
  }
  return { d, ember, width: cx - tracking * size };
}

const wrap = (body: string, tile?: boolean) => `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">${tile ? `<rect width="32" height="32" rx="3" fill="${INK}"/>` : ""}${body}</svg>`;

type Mark = { name: string; note: string; svg: (o?: { ink?: string; tile?: boolean }) => string; lockup?: (dark: boolean) => string };

// A. The lit counter: a bold lowercase d, the hole of the letter is the only light in the room
const dGlyph = (() => {
  const size = 40;
  const p = font.charToGlyph("d").getPath(0, 0, size);
  const bb = p.getBoundingBox();
  return { size, bb };
})();
const litD: Mark = {
  name: "A  the lit d",
  note: "the counter of the d is the only light in the room. the wordmark lights the same letter, so the mark is a letter from the name",
  svg: (o = {}) => {
    const ink = o.ink ?? BONE;
    const { size, bb } = dGlyph;
    const target = 24; // glyph height in the 32 box
    const s = target / (bb.y2 - bb.y1);
    const tx = 16 - ((bb.x1 + bb.x2) / 2) * s;
    const ty = 16 - ((bb.y1 + bb.y2) / 2) * s;
    const cmds = font.charToGlyph("d").getPath(0, 0, size).commands;
    const cs = contours(cmds);
    return wrap(`<g transform="translate(${n(tx)} ${n(ty)}) scale(${n(s)})"><path d="${pathData(cmds)}" fill="${ink}"/><path d="${cs[1] ? pathData(cs[1]) : ""}" fill="${EMBER}"/></g>`, o.tile);
  },
  lockup: (dark) => {
    const size = 72;
    const t = text("deadroom", size, -0.045, 0, 0, 3);
    const ink = dark ? BONE : INK;
    return `<svg viewBox="-4 -62 ${n(t.width + 8)} 84" xmlns="http://www.w3.org/2000/svg"><path d="${t.d}" fill="${ink}"/><path d="${t.ember}" fill="${EMBER}"/></svg>`;
  },
};

// B. Seat brackets: the [x] of the product's own seat list, one seat lit
const brackets: Mark = {
  name: "B  seat brackets",
  note: "[ ■ ] is how a seat looks in the product: taken, lit. terminal-native, scales to any size",
  svg: (o = {}) => {
    const ink = o.ink ?? BONE;
    return wrap(`<path d="M11.5 6.5H5.5V25.5H11.5M20.5 6.5H26.5V25.5H20.5" fill="none" stroke="${ink}" stroke-width="2.6" stroke-linejoin="miter"/><rect x="12" y="12" width="8" height="8" fill="${EMBER}"/>`, o.tile);
  },
};

// C. The door: a tombstone that is also a door, with light under it
const door: Mark = {
  name: "C  the door",
  note: "a tombstone that is also a door. the light is coming from the other side. outline plus one ember line",
  svg: (o = {}) => {
    const ink = o.ink ?? BONE;
    return wrap(`<path d="M9 26.6V14.2A7 7 0 0 1 23 14.2V26.6" fill="none" stroke="${ink}" stroke-width="2.4" stroke-linejoin="round"/><rect x="4.5" y="26.6" width="23" height="2.6" fill="${EMBER}"/>`, o.tile);
  },
};

// D. The seat grid itself: nine seats, one lit
const seat: Mark = {
  name: "D  nine seats",
  note: "the product's seat grid as a mark: eight dark seats and one lit. the same square is the unit of the whole brand",
  svg: (o = {}) => {
    const ink = o.ink === INK ? "#cfcfcf" : DIM;
    let cells = "";
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) {
        const lit = r === 0 && c === 2;
        cells += `<rect x="${3 + c * 9.5}" y="${3 + r * 9.5}" width="7" height="7" rx="1" fill="${lit ? EMBER : ink}"/>`;
      }
    return wrap(cells, o.tile);
  },
};

function lockupFor(m: Mark, dark: boolean) {
  if (m.lockup) return m.lockup(dark);
  const size = 72;
  const markSize = 84;
  const gap = 22;
  const ink = dark ? BONE : INK;
  const t = text("deadroom", size, -0.045, 0, 0);
  const w = markSize + gap + t.width;
  const baseline = markSize * 0.5 + size * 0.36;
  const mk = m.svg({ ink }).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  return `<svg viewBox="0 0 ${n(w)} ${markSize}" xmlns="http://www.w3.org/2000/svg"><g transform="scale(${markSize / 32})">${mk}</g><path transform="translate(${markSize + gap} ${n(baseline)})" d="${t.d}" fill="${ink}"/></svg>`;
}

const options = [litD, brackets, door, seat];
for (const m of options) {
  const key = m.name.split("  ")[0].toLowerCase() + "-" + m.name.split("  ")[1].replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  writeFileSync(resolve(out, `${key}.svg`), m.svg({ tile: true }));
  writeFileSync(resolve(out, `${key}-lockup-dark.svg`), lockupFor(m, true));
}

const cell = (m: Mark) => `
<div class="opt">
  <div class="name">${m.name}</div>
  <div class="big">${m.svg({ tile: true })}</div>
  <div class="small">
    <span class="px64">${m.svg({ tile: true })}</span><span class="px32">${m.svg({ tile: true })}</span><span class="px16">${m.svg({ tile: true })}</span>
    <span class="px32 lt">${m.svg({ ink: INK, tile: true }).replace(`<rect width="32" height="32" rx="3" fill="${INK}"/>`, `<rect width="32" height="32" rx="3" fill="#fff"/>`)}</span>
  </div>
  <div class="lock dark">${lockupFor(m, true)}</div>
  <div class="lock light">${lockupFor(m, false)}</div>
  <div class="note">${m.note}</div>
</div>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Deadroom logo options, round 2</title><style>
@font-face{font-family:JB;src:url("../../web/node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2");font-weight:100 800}
body{margin:0;background:#000;color:#f2f2f2;font:400 13px/1.6 JB,monospace}
.wrap{max-width:1360px;margin:0 auto;padding:40px}
h1{font-weight:400;font-size:40px;letter-spacing:-.06em;margin:0 0 6px}p{color:#858585;margin:0 0 28px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.opt{border:1px solid #262626;padding:16px;display:grid;gap:12px;align-content:start}
.name{font-size:15px;letter-spacing:-.03em}
.big svg{width:100%;height:auto;display:block;border:1px solid #1a1a1a}
.small{display:flex;align-items:flex-end;gap:12px;padding:10px;background:#0a0a0a;border:1px solid #1a1a1a}
.small svg{display:block;width:100%;height:100%}.px64{width:64px;height:64px}.px32{width:32px;height:32px}.px16{width:16px;height:16px}.lt{background:#fff}
.lock{padding:14px}.lock svg{width:100%;height:auto;display:block}.lock.dark{background:#000;border:1px solid #1a1a1a}.lock.light{background:#fff}
.note{color:#858585;font-size:12px}
</style></head><body><div class="wrap"><h1>deadroom, logo directions, round 2</h1><p>No coffin outline this time. Each shown as the app tile, at 64, 32 and 16 px, and as a lockup on dark and on light.</p>
<div class="grid">${options.map(cell).join("")}</div></div></body></html>`;
writeFileSync(resolve(out, "logo-options-2.html"), html);
console.log("wrote", out);
