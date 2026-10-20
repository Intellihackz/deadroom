import { useCallback, useEffect, useState } from "react";
import { api, type Config, type Room } from "../api";
import { Link } from "../App";
import { Avatar, Chip, Copy, Logo } from "../components";
import { SeatGrid } from "../SeatGrid";
import { payForSeat, reportJoin as reportJoinTx, type SeatResult } from "../seat";
import { currentToken, friendly, leaveMessage, openWalletModal, signMessage, useWallet } from "../wallet";
import { GRAD_ETH, ago, eth, formatEther, roomBuy, short, timeLeft, tokens } from "../util";

export function RoomPage({ id, cfg }: { id: string; cfg: Config | null }) {
  const [room, setRoom] = useState<Room | null>(null);
  const [missing, setMissing] = useState(false);
  const { account: me } = useWallet();
  const [msg, setMsg] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [hash, setHash] = useState("");

  const load = useCallback(() => {
    api
      .room(id)
      .then(setRoom)
      .catch((e) => e.status === 404 && setMissing(true));
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5_000);
    return () => clearInterval(t);
  }, [load]);

  if (missing)
    return (
      <div className="narrow">
        <h1 className="h-page">No such coffin</h1>
        <Link to="/" className="btn btn-sm">
          Back to coffins
        </Link>
      </div>
    );
  if (!room || !cfg) return <p className="muted pad">Loading…</p>;

  const price = BigInt(room.seatPriceWei);
  const { buy } = roomBuy(cfg, room);
  const mySeat = room.seats.find((s) => s.status === "in" && s.address === me);
  const open = room.status === "open";
  const left = room.target - room.seatsIn;
  const seatsShown = room.seats.filter((s) => s.status === "in" || s.payoutTx);

  function showResult(r: SeatResult) {
    setRoom(r.room);
    if (r.accepted) setMsg({ tone: "ok", text: r.room.creator === me && r.room.seatsIn === 1 ? "You have the first seat. The coffin is open to everyone." : "You have a seat." });
    else setMsg({ tone: "error", text: `Not seated: ${r.reason}.${r.refundTx ? " Your ETH was sent back." : ""}` });
  }
  async function reportJoin(txHash: string) {
    showResult(await reportJoinTx(room!.id, txHash));
  }

  async function take() {
    setMsg(null);
    if (!me) return openWalletModal();
    setBusy(true);
    try {
      showResult(await payForSeat(room!, me, cfg!.explorer, (text) => setMsg({ tone: "info", text })));
    } catch (e) {
      setMsg({ tone: "error", text: friendly(e) });
    } finally {
      setBusy(false);
    }
  }

  async function claimByHash() {
    setMsg(null);
    setBusy(true);
    try {
      await reportJoin(hash.trim());
      setHash("");
    } catch (e) {
      setMsg({ tone: "error", text: friendly(e) });
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    setMsg(null);
    setBusy(true);
    try {
      // Being signed in is enough. If the session was refused (expired), fall back to signing this one request.
      let r;
      try {
        r = await api.leave(room!.id, { address: me }, currentToken());
      } catch (e: any) {
        if (e.status !== 400 && e.status !== 401) throw e;
        const timestamp = Date.now();
        const signature = await signMessage(me, leaveMessage(room!.id, me, timestamp));
        r = await api.leave(room!.id, { address: me, timestamp, signature });
      }
      setRoom(r.room);
      setMsg({ tone: "ok", text: "You left and your ETH was sent back." });
    } catch (e) {
      setMsg({ tone: "error", text: friendly(e) });
    } finally {
      setBusy(false);
    }
  }

  const notice =
    room.status === "live" || room.status === "distributing"
      ? `risen with ${room.seatsIn} seats.`
      : room.status === "expired"
        ? "buried before it filled. every seat was refunded."
        : room.status === "failed"
          ? "rotted. every seat was refunded."
          : `survived by ${room.seatsIn} of ${room.target} seats.`;

  const pending = Boolean(room.pending);
  const isCreator = Boolean(me) && room.creator === me;
  const tokenLink = room.launch?.newToken ? `https://ponsfamily.com/launchpad/${room.launch.newToken}` : "";

  return (
    <div className="room">
      <Link to="/" className="back">
        ← all coffins
      </Link>

      <section className="room-head">
        <Logo room={room} size={72} />
        <div className="grow">
          <h1 className="h-page">
            {room.token.name} <span className="muted">${room.token.symbol}</span>
          </h1>
          <div className="row">
            <Chip status={room.status} />
            {room.token.address && (
              <a className="muted mono" href={`${cfg.explorer}/token/${room.token.address}`} target="_blank" rel="noreferrer">
                old token {short(room.token.address)} ↗
              </a>
            )}
          </div>
        </div>
      </section>
      <p className="notice">
        † dug up {ago(room.createdAt)}{room.creator ? ` by ${short(room.creator)}` : ""}. {pending ? "waiting for the creator to take the first seat." : notice}
      </p>
      {room.token.description && <p className="desc">{room.token.description}</p>}

      <div className="cols">
        <div className="col-main">
          <div className="card pad-lg">
            <div className="seats-line">
              <span className="huge mono">
                {room.seatsIn}
                <span className="muted"> / {room.target}</span>
              </span>
              <span className="muted">seats taken{open ? `, ${left} to go` : ""}</span>
            </div>
            <SeatGrid room={room} />
            <dl className="facts facts-4">
              <div>
                <dt>One seat</dt>
                <dd className="mono">{eth(price)} ETH</dd>
              </div>
              <div>
                <dt>The buy</dt>
                <dd className="mono">≈ {eth(room.launch?.quoteIn ?? buy)} ETH</dd>
              </div>
              <div>
                <dt>Each seat gets</dt>
                <dd className="mono">{room.launch?.sharePerSeat ? tokens(room.launch.sharePerSeat) : "equal share"}</dd>
              </div>
              <div>
                <dt>Time</dt>
                <dd className="mono">{open ? timeLeft(room.deadline) : "—"}</dd>
              </div>
            </dl>
            {Number(formatEther(buy)) > GRAD_ETH && open && (
              <p className="fine">This coffin is big enough to sell out the launch curve. Any part of the buy it cannot fill comes back to the coffin wallet.</p>
            )}
          </div>

          {open && (
            <div className="card pad-lg join">
              <h2>{mySeat ? "You are in" : pending ? (isCreator ? "Take the first seat" : "Not open yet") : "Take a seat"}</h2>
              {mySeat ? (
                <>
                  <p className="muted">Your {eth(price)} ETH is held until the coffin opens. You can leave and get all of it back before then. If you are the only one in, a tiny network fee comes out of the refund.</p>
                  <button className="btn btn-ghost" onClick={leave} disabled={busy}>
                    {busy ? "Waiting…" : "Leave and refund"}
                  </button>
                </>
              ) : pending && !isCreator ? (
                <p className="muted">
                  This coffin is waiting for its creator{room.creator ? ` (${short(room.creator)})` : ""} to take the first seat. It opens to everyone as soon as they have. If they never do, it disappears after an hour.
                </p>
              ) : (
                <>
                  <p className="muted">
                    {pending && isCreator ? "Your coffin is not listed yet. Taking the first seat opens it to everyone. " : ""}
                    Send exactly <b className="mono">{eth(price)} ETH</b> from your wallet. Your wallet becomes your seat. Anything else sent is refunded.
                  </p>
                  <div className="row">
                    <button className="btn" onClick={take} disabled={busy}>
                      {busy ? "Working…" : me ? `Take a seat · ${eth(price)} ETH` : "Connect wallet to take a seat"}
                    </button>
                  </div>
                </>
              )}
              {msg && <p className={msg.tone === "error" ? "error" : msg.tone === "ok" ? "ok" : "muted"}>{msg.text}</p>}

              <details className="manual">
                <summary>Send from somewhere else</summary>
                <p className="muted">
                  Send exactly {eth(price)} ETH on Robinhood Chain to the coffin wallet, then paste the transaction hash to claim your seat. The sending wallet is the seat.
                </p>
                <div className="addr">
                  <code className="mono">{room.wallet}</code>
                  <Copy text={room.wallet} />
                </div>
                <div className="row">
                  <input value={hash} onChange={(e) => setHash(e.target.value)} placeholder="0x… transaction hash" spellCheck={false} className="mono grow" />
                  <button className="btn btn-sm" onClick={claimByHash} disabled={busy || !/^0x[0-9a-fA-F]{64}$/.test(hash.trim())}>
                    Claim
                  </button>
                </div>
              </details>
            </div>
          )}

          {!open && msg && <p className={msg.tone === "error" ? "error" : "ok"}>{msg.text}</p>}

          {(room.status === "launching" || room.status === "distributing") && (
            <div className="card pad-lg">
              <h2>The lid is lifting</h2>
              <p className="muted">Every seat is taken. The coffin is opening: the new token is being launched and bought, then tokens go out to every seat.</p>
              {room.launch?.error && <p className="warn">{room.launch.error}</p>}
            </div>
          )}

          {(room.status === "live" || room.launch?.newToken) && (
            <div className="card pad-lg alive">
              <h2>Risen</h2>
              <dl className="facts facts-3">
                <div>
                  <dt>New token</dt>
                  <dd className="mono">
                    <a href={tokenLink} target="_blank" rel="noreferrer">
                      {short(room.launch!.newToken!)} ↗
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>Bought</dt>
                  <dd className="mono">{tokens(room.launch?.tokensBought)}</dd>
                </div>
                <div>
                  <dt>Per seat</dt>
                  <dd className="mono">{tokens(room.launch?.sharePerSeat)}</dd>
                </div>
              </dl>
              <div className="buyback">
                <b>Buybacks</b>
                <span className="mono">
                  {eth(room.buyback.spentWei)} ETH spent · {tokens(room.buyback.tokens)} tokens
                </span>
                {room.buyback.lastNote && <small className="muted">{room.buyback.lastNote}</small>}
              </div>
              <a className="btn btn-sm" href={tokenLink} target="_blank" rel="noreferrer">
                Trade it on Pons ↗
              </a>
            </div>
          )}

          {(room.status === "expired" || room.status === "failed") && (
            <div className="card pad-lg">
              <h2>{room.status === "expired" ? "The coffin was buried" : "The launch rotted"}</h2>
              <p className="muted">Every seat is being refunded in full from the room wallet.</p>
              {room.launch?.error && <p className="warn">{room.launch.error}</p>}
            </div>
          )}
        </div>

        <aside className="col-side">
          <div className="card pad">
            <h3>Coffin wallet</h3>
            <div className="addr">
              <code className="mono">{short(room.wallet)}</code>
              <Copy text={room.wallet} />
              <a className="btn btn-sm btn-ghost" href={`${cfg.explorer}/address/${room.wallet}`} target="_blank" rel="noreferrer">
                Explorer ↗
              </a>
            </div>
            <p className="fine">It receives the seats, launches the token, collects its fees and buys it back. The server holds its key.</p>
          </div>

          <div className="card pad">
            <h3>Seats</h3>
            {seatsShown.length === 0 && <p className="muted">Nobody yet. Be the first.</p>}
            <ul className="seatlist">
              {seatsShown.map((s) => (
                <li key={s.depositTx} className={s.address === me ? "me" : ""}>
                  <Avatar address={s.address} />
                  <a className="mono" href={`${cfg.explorer}/address/${s.address}`} target="_blank" rel="noreferrer">
                    {short(s.address)}
                  </a>
                  <span className="grow" />
                  {s.payoutTx ? (
                    <a className="tag-paid" href={`${cfg.explorer}/tx/${s.payoutTx}`} target="_blank" rel="noreferrer">
                      paid out ↗
                    </a>
                  ) : (
                    <span className="muted small">{ago(s.joinedAt)}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="card pad">
            <h3>Activity</h3>
            <ul className="log">
              {[...room.log].reverse().slice(0, 12).map((l, i) => (
                <li key={i}>
                  <span className="muted small">{ago(l.t)}</span> {l.msg}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
