import { useState } from "react";
import type { Config, Room } from "./api";
import { Link } from "./App";
import { SeatGrid } from "./SeatGrid";
import { STATUS, eth, hue, ipfs, monoOnLoad, roomBuy, short, timeLeft } from "./util";

export function Logo({ room, size = 48 }: { room: Pick<Room, "token">; size?: number }) {
  const [bad, setBad] = useState(false);
  const src = room.token.logo ? ipfs(room.token.logo) : "";
  const style = { width: size, height: size };
  if (!src || bad)
    return (
      <div className="logo fallback" style={style}>
        {room.token.symbol.slice(0, 2).toUpperCase()}
      </div>
    );
  return <img className="logo" style={style} src={src} alt="" onLoad={monoOnLoad} onError={() => setBad(true)} />;
}

export function Chip({ status }: { status: Room["status"] }) {
  const s = STATUS[status];
  return <span className={`chip chip-${s.tone}`}>{s.label}</span>;
}

export function RoomCard({ room, cfg }: { room: Room; cfg: Config }) {
  const { buy } = roomBuy(cfg, room);
  return (
    <Link to={`/c/${room.id}`} className="card room-card">
      <div className="room-top">
        <Logo room={room} />
        <div className="grow">
          <h3>
            {room.token.name} <span className="muted">${room.token.symbol}</span>
          </h3>
          <Chip status={room.status} />
        </div>
      </div>
      <div className="seats-line">
        <span className="big mono">
          {room.seatsIn}
          <span className="muted"> / {room.target}</span>
        </span>
        <span className="muted">seats</span>
      </div>
      <SeatGrid room={room} size="sm" />
      <dl className="facts">
        <div>
          <dt>Seat</dt>
          <dd className="mono">{eth(room.seatPriceWei)} ETH</dd>
        </div>
        <div>
          <dt>Buy</dt>
          <dd className="mono">≈ {eth(buy)} ETH</dd>
        </div>
        <div>
          <dt>{room.status === "open" ? "time" : "coffin"}</dt>
          <dd className="mono">{room.status === "open" ? timeLeft(room.deadline) : short(room.id)}</dd>
        </div>
      </dl>
    </Link>
  );
}

export function Avatar({ address, size = 22 }: { address: string; size?: number }) {
  const h = hue(address);
  return <span className="avatar" style={{ width: size, height: size, background: `linear-gradient(135deg, hsl(${h} 55% 62%), hsl(${(h + 60) % 360} 50% 38%))` }} />;
}

export function Copy({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn btn-sm btn-ghost"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? "Copied" : (label ?? "Copy")}
    </button>
  );
}
