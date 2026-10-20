// ---------- isometric geometry ----------
// View from +x, +y, +z. x runs to the lower right, y to the lower left, z is up.
export const C = Math.cos(Math.PI / 6);
export const S = 0.5;
type P3 = [number, number, number];
const iso = (x: number, y: number, z: number): [number, number] => [(x - y) * C, (x + y) * S - z];
export const fmt = (n: number) => +n.toFixed(3);
const pt = (p: P3) => iso(...p).map(fmt).join(",");
const poly = (pts: P3[], cls: string) => `<polygon class="${cls}" points="${pts.map(pt).join(" ")}"/>`;
export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const smooth = (t: number) => t * t * (3 - 2 * t);

// coffin outline on the ground plane (x along the length, y across)
const FOOT: [number, number][] = [
  [0, -2],
  [3, -3],
  [14, -1.5],
  [14, 1.5],
  [3, 3],
  [0, 2],
];
export const H = 2.2; // wall height
const FLOOR = 0.5; // bed height
const LID_T = 0.4;
const cx = FOOT.reduce((s, p) => s + p[0], 0) / FOOT.length;
const cy = FOOT.reduce((s, p) => s + p[1], 0) / FOOT.length;

function edgeInfo(i: number) {
  const a = FOOT[i];
  const b = FOOT[(i + 1) % FOOT.length];
  let n: [number, number] = [b[1] - a[1], -(b[0] - a[0])];
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  if ((mx - cx) * n[0] + (my - cy) * n[1] < 0) n = [-n[0], -n[1]];
  return { a, b, visible: n[0] + n[1] > 0 };
}

function distToEdge(px: number, py: number, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = clamp(((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

function inside(px: number, py: number) {
  let c = false;
  for (let i = 0, j = FOOT.length - 1; i < FOOT.length; j = i++) {
    const [xi, yi] = FOOT[i];
    const [xj, yj] = FOOT[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- the scene, built once as an SVG string (no user input in it) ----------
export function sceneSvg() {
  const rnd = mulberry(7);
  const out: string[] = [];

  // ground: a plot outline and a few blades of grass
  const plot: P3[] = [
    [-5, -4.6, 0],
    [16.2, -4.6, 0],
    [16.2, 4.6, 0],
    [-5, 4.6, 0],
  ];
  out.push(`<polygon class="plot" points="${plot.map(pt).join(" ")}"/>`);
  for (let i = 0; i < 26; i++) {
    const x = -4.6 + rnd() * 20.4;
    const y = -4.2 + rnd() * 8.4;
    if (inside(x, y) || (x < 0.5 && Math.abs(y) < 2.8)) continue;
    const [sx, sy] = iso(x, y, 0);
    out.push(`<path class="grass" d="M${fmt(sx - 0.18)} ${fmt(sy)} L${fmt(sx)} ${fmt(sy - 0.34)} L${fmt(sx + 0.18)} ${fmt(sy)}"/>`);
  }

  // gravestone behind the head of the coffin
  const X0 = -3.5;
  const X1 = -2.6;
  const prof: [number, number][] = [
    [-2.2, 0],
    [2.2, 0],
    [2.2, 4.6],
    [1.4, 6.2],
    [-1.4, 6.2],
    [-2.2, 4.6],
  ];
  out.push(poly([[X0, 2.2, 0], [X1, 2.2, 0], [X1, 2.2, 4.6], [X0, 2.2, 4.6]], "solid"));
  out.push(poly([[X0, 2.2, 4.6], [X1, 2.2, 4.6], [X1, 1.4, 6.2], [X0, 1.4, 6.2]], "solid"));
  out.push(poly([[X0, 1.4, 6.2], [X1, 1.4, 6.2], [X1, -1.4, 6.2], [X0, -1.4, 6.2]], "solid"));
  out.push(poly(prof.map(([y, z]) => [X1, y, z] as P3), "solid"));
  // engraved text lies on the front face: map face coordinates (y right, z up) to the screen
  const e = fmt(X1 * C);
  const f = fmt(X1 * S);
  out.push(
    `<g transform="matrix(${fmt(C)} ${fmt(-S)} 0 1 ${e} ${f})" class="engrave"><text x="0" y="-4.1" text-anchor="middle" class="e1">r.i.p</text><text x="0" y="-3.15" text-anchor="middle" class="e2">deadroom</text><path d="M-1.1 -2.55 H1.1" class="e3"/></g>`,
  );

  // coffin: inner back walls and the bed, then the seats
  const edges = FOOT.map((_, i) => edgeInfo(i));
  for (const { a, b, visible } of edges)
    if (!visible) out.push(poly([[a[0], a[1], FLOOR], [b[0], b[1], FLOOR], [b[0], b[1], H], [a[0], a[1], H]], "inner"));
  out.push(poly(FOOT.map(([x, y]) => [x, y, FLOOR] as P3), "bed"));

  // seat cells on the bed, filled in a fixed shuffled order so seats seem to arrive one by one
  const cells: { x: number; y: number }[] = [];
  for (let x = 1.1; x < 13.6; x += 1.08)
    for (let y = -2.5; y <= 2.55; y += 1.08) {
      if (!inside(x, y)) continue;
      const d = Math.min(...FOOT.map((p, i) => distToEdge(x, y, p, FOOT[(i + 1) % FOOT.length])));
      if (d < 0.62) continue;
      cells.push({ x, y });
    }
  const order = cells.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const rank = new Array<number>(cells.length);
  order.forEach((cellIndex, r) => (rank[cellIndex] = r));
  const s = 0.4;
  const quad = (c: { x: number; y: number }, z: number): P3[] => [
    [c.x - s, c.y - s, z],
    [c.x + s, c.y - s, z],
    [c.x + s, c.y + s, z],
    [c.x - s, c.y + s, z],
  ];
  // the bed: lit once the lid has gone
  cells.forEach((c) => out.push(`<polygon class="bedcell" points="${quad(c, FLOOR).map(pt).join(" ")}"/>`));

  // outer walls facing us, then the rim
  for (const { a, b, visible } of edges)
    if (visible) out.push(poly([[a[0], a[1], 0], [b[0], b[1], 0], [b[0], b[1], H], [a[0], a[1], H]], "solid"));
  out.push(`<polygon class="rim" points="${FOOT.map(([x, y]) => pt([x, y, H])).join(" ")}"/>`);

  // light: hairline rays and dust rising out of the open coffin
  const rays: string[] = [];
  for (let i = 0; i < 11; i++) {
    const x = 1.5 + rnd() * 11.5;
    const y = (rnd() - 0.5) * 4;
    if (!inside(x, y)) continue;
    const [sx, sy] = iso(x, y, H);
    const h = 5 + rnd() * 13;
    rays.push(`<rect class="ray" data-p="${fmt(rnd() * 6.28)}" x="${fmt(sx)}" y="${fmt(sy - h)}" width="0.05" height="${fmt(h)}" fill="url(#rayg)"/>`);
  }
  out.push(...rays);
  const dust: string[] = [];
  for (let i = 0; i < 16; i++) {
    const x = 1 + rnd() * 12.5;
    const y = (rnd() - 0.5) * 4.4;
    if (!inside(x, y)) continue;
    const [sx, sy] = iso(x, y, H);
    dust.push(`<circle class="dust" data-x="${fmt(sx)}" data-y="${fmt(sy)}" data-s="${fmt(0.4 + rnd() * 0.9)}" data-ph="${fmt(rnd())}" r="${fmt(0.05 + rnd() * 0.05)}" cx="${fmt(sx)}" cy="${fmt(sy)}"/>`);
  }
  out.push(...dust);

  // the lid: sits on the coffin, slides off and lifts as the last seat is taken
  const k = 1.05;
  const lidFoot = FOOT.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k] as [number, number]);
  const lid: string[] = [];
  for (let i = 0; i < lidFoot.length; i++) {
    const a = lidFoot[i];
    const b = lidFoot[(i + 1) % lidFoot.length];
    let n: [number, number] = [b[1] - a[1], -(b[0] - a[0])];
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    if ((mx - cx) * n[0] + (my - cy) * n[1] < 0) n = [-n[0], -n[1]];
    if (n[0] + n[1] > 0) lid.push(poly([[a[0], a[1], H], [b[0], b[1], H], [b[0], b[1], H + LID_T], [a[0], a[1], H + LID_T]], "solid"));
  }
  lid.push(`<polygon class="solid" points="${lidFoot.map(([x, y]) => pt([x, y, H + LID_T])).join(" ")}"/>`);
  const lz = H + LID_T + 0.01;
  cells.forEach((c, i) => lid.push(`<polygon class="cell" data-o="${rank[i]}" points="${quad(c, lz).map(pt).join(" ")}"/>`));
  out.push(`<g class="lid" data-lid>${lid.join("")}</g>`);

  const defs = `<defs><linearGradient id="rayg" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff6a2b" stop-opacity="0.9"/><stop offset="1" stop-color="#ff6a2b" stop-opacity="0"/></linearGradient></defs>`;
  return `<svg viewBox="-9.5 -13 28 25" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A coffin with seats that light up one by one until the lid lifts">${defs}${out.join("")}</svg>`;
}


// ---------- static renders (brand images, link preview) ----------
// The live scene is styled by the site's CSS and moved by the scroll driver. For a still image we bake one state into the markup.

export function sceneCss(sw: number) {
  return [
    `.plot{fill:none;stroke:#3a3a3a;stroke-width:${sw};stroke-dasharray:${fmt(sw * 3)} ${fmt(sw * 5)}}`,
    `.grass{fill:none;stroke:#3a3a3a;stroke-width:${sw}}`,
    `.solid{fill:#000;stroke:#f2f2f2;stroke-width:${sw};stroke-linejoin:round}`,
    `.inner{fill:#050505;stroke:#858585;stroke-width:${sw}}`,
    `.bed{fill:#050505;stroke:#3a3a3a;stroke-width:${sw}}`,
    `.rim{fill:none;stroke:#f2f2f2;stroke-width:${sw};stroke-linejoin:round}`,
    `.cell{fill:#ff6a2b;fill-opacity:0;stroke:#3a3a3a;stroke-width:${sw}}`,
    `.cell.on{fill-opacity:.92;stroke:#ff6a2b}`,
    `.bedcell{fill:#ff6a2b;fill-opacity:0;stroke:#3a3a3a;stroke-width:${sw}}`,
    `.bedcell.on{stroke:#ff6a2b}`,
    `.dust{fill:#ff6a2b}`,
    `.eng1{fill:#f2f2f2}.eng2{fill:#858585}`,
    `.e3{stroke:#858585;stroke-width:${fmt(sw * 0.5)};fill:none}`,
  ].join("");
}

export type StillOptions = {
  fill: number; // 0..1 share of seats lit
  lift: number; // 0..1 how far the lid has risen
  box: { x: number; y: number; w: number; h: number }; // where to place it, in the parent image's pixels
  strokePx?: number;
  /** turns text into path data (centred on x=0, baseline y=0, in the units of `size`), so images need no font at render time */
  outline: (text: string, size: number) => string;
};

export function sceneStill(o: StillOptions) {
  let svg = sceneSvg();
  const total = (svg.match(/class="cell"/g) ?? []).length;
  const lit = Math.round(clamp(o.fill) * total);
  const lift = clamp(o.lift);
  const unitsPerPx = 28 / o.box.w;
  const sw = fmt((o.strokePx ?? 1.6) * unitsPerPx);

  svg = svg.replace(/<polygon class="cell" data-o="(\d+)"/g, (m, r) => (+r < lit ? `<polygon class="cell on" data-o="${r}"` : m));
  const bedA = 0.9 * clamp((lift - 0.15) / 0.6);
  svg = svg.replace(/<polygon class="bedcell"/g, bedA > 0.02 ? `<polygon class="bedcell on" style="fill-opacity:${fmt(bedA)}"` : '<polygon class="bedcell"');
  const dx = lift * 4.2;
  const dz = lift * 9.5;
  svg = svg.replace('<g class="lid" data-lid>', `<g class="lid" transform="translate(${fmt(dx * C)} ${fmt(dx * S - dz)})">`);
  svg = svg.replace(/<rect class="ray"/g, `<rect class="ray" style="opacity:${fmt(clamp(lift * 1.4 - 0.1) * 0.9)}"`);
  svg = svg.replace(/<circle class="dust" data-x="([-\d.]+)" data-y="([-\d.]+)" data-s="[-\d.]+" data-ph="([-\d.]+)" r="([-\d.]+)" cx="[-\d.]+" cy="[-\d.]+"/g, (_m, x, y, ph, r) => {
    const up = +ph * 12; // spread the dust up the shaft
    const a = clamp(lift * 1.2) * Math.sin(+ph * Math.PI) * 0.9;
    return `<circle class="dust" r="${r}" cx="${x}" cy="${fmt(+y - up)}" style="opacity:${fmt(a)}"`;
  });
  // stone lettering as outlines
  svg = svg.replace(/<text x="0" y="-4.1"[^>]*>r\.i\.p<\/text>/, `<path class="eng1" transform="translate(0 -4.1)" d="${o.outline("r.i.p", 1.05)}"/>`);
  svg = svg.replace(/<text x="0" y="-3.15"[^>]*>deadroom<\/text>/, `<path class="eng2" transform="translate(0 -3.15)" d="${o.outline("deadroom", 0.42)}"/>`);

  return svg.replace(
    /^<svg viewBox="([^"]+)" xmlns="http:\/\/www.w3.org\/2000\/svg"[^>]*>/,
    `<svg x="${o.box.x}" y="${o.box.y}" width="${o.box.w}" height="${o.box.h}" viewBox="$1" overflow="visible" xmlns="http://www.w3.org/2000/svg"><style>${sceneCss(sw)}</style>`,
  );
}
