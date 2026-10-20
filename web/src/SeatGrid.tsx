import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Room } from "./api";
import { ago, short } from "./util";

/**
 * Pick the number of rows (1 to 7) so the cells come out closest to the size we want while the grid fills the width
 * exactly. Small coffins end up as a single strip, big ones as a wide short block like a contribution calendar.
 */
function fit(n: number, width: number, gap: number, target: number, maxCell: number) {
  let best = { rows: Math.min(7, Math.max(1, Math.round(Math.sqrt(n / 2.2)))), cell: target };
  if (!width) return best;
  let bestScore = Infinity;
  for (let rows = 1; rows <= 7; rows++) {
    const cols = Math.ceil(n / rows);
    const cell = (width - gap * (cols - 1)) / cols;
    if (cell < 6) continue; // too small to read
    const used = Math.min(cell, maxCell);
    const score = Math.abs(used - target);
    if (score < bestScore - 0.01) {
      bestScore = score;
      best = { rows, cell: Math.floor(used * 2) / 2 };
    }
  }
  return best;
}

/**
 * One cell per seat, filled in the order wallets joined, reading down each column then across.
 * Ember is a taken seat (older seats are dimmer, newer ones brighter), bone is a seat that has been paid out,
 * and a seat that just filled pulses. The grid is the page's second reading of the same number as "37 / 100".
 */
export function SeatGrid({ room, size = "lg" }: { room: Room; size?: "lg" | "sm" }) {
  const n = room.target;
  const gap = size === "sm" ? 3 : 4;
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const { rows, cell } = fit(n, width, gap, size === "sm" ? 14 : 22, 44);

  const taken = room.seats.filter((s) => s.status === "in").sort((a, b) => a.joinedAt - b.joinedAt);
  const oldest = taken[0]?.joinedAt ?? 0;
  const span = Math.max(1, (taken[taken.length - 1]?.joinedAt ?? 0) - oldest);

  // seats that arrived since the last poll pulse for a moment
  const seen = useRef<number | null>(null);
  const [fresh, setFresh] = useState(0);
  useEffect(() => {
    if (seen.current !== null && taken.length > seen.current) {
      setFresh(taken.length - seen.current);
      const t = setTimeout(() => setFresh(0), 2600);
      seen.current = taken.length;
      return () => clearTimeout(t);
    }
    seen.current = taken.length;
  }, [taken.length]);

  const cells = Array.from({ length: n }, (_, i) => {
    const s = taken[i];
    if (!s) return { i, cls: i === taken.length && room.status === "open" ? "seat next" : "seat", title: `seat ${i + 1}: open`, lv: 1 };
    const lv = 0.5 + 0.5 * ((s.joinedAt - oldest) / span); // older seats are dimmer
    const isFresh = fresh > 0 && i >= taken.length - fresh;
    const cls = ["seat", "taken", s.payoutTx ? "paid" : "", isFresh ? "fresh" : ""].filter(Boolean).join(" ");
    return { i, cls, title: `seat ${i + 1}: ${short(s.address)}, ${ago(s.joinedAt)}${s.payoutTx ? ", paid out" : ""}`, lv };
  });

  return (
    <div className={`seatwrap ${size}`} ref={box}>
      <div
        className="seatgrid"
        role="img"
        aria-label={`${taken.length} of ${n} seats taken`}
        style={{ gridTemplateRows: `repeat(${rows}, ${cell}px)`, gridAutoColumns: `${cell}px`, gap }}
      >
        {cells.map((c) => (
          <i key={c.i} className={c.cls} title={c.title} style={{ ["--lv" as string]: c.lv }} />
        ))}
      </div>
      {size === "lg" && (
        <div className="seatlegend" aria-hidden="true">
          <span>open</span>
          <i className="seat" />
          <span className="sp">older</span>
          <i className="seat taken" style={{ ["--lv" as string]: 0.5 }} />
          <i className="seat taken" style={{ ["--lv" as string]: 0.7 }} />
          <i className="seat taken" style={{ ["--lv" as string]: 0.85 }} />
          <i className="seat taken" style={{ ["--lv" as string]: 1 }} />
          <span>newer</span>
          <span className="sp">paid out</span>
          <i className="seat taken paid" />
        </div>
      )}
    </div>
  );
}
