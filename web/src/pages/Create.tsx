import { useEffect, useMemo, useState } from "react";
import { api, type Config, type TokenInfo } from "../api";
import { navigate } from "../App";
import { lockScroll } from "../motion/lenis";
import { payForSeat } from "../seat";
import { friendly, openWalletModal, useWallet } from "../wallet";
import { closeCreate, useCreateOpen } from "../ui";
import { GRAD_ETH, buyAmount, eth, ipfs, monoOnLoad, parseEther } from "../util";

/** The "dig up a coffin" modal. Mounted only while open, so the form resets every time. */
export function CreateModal({ cfg }: { cfg: Config | null }) {
  const open = useCreateOpen();
  if (!open) return null;
  return <Form cfg={cfg} />;
}

function close() {
  closeCreate();
  if (location.pathname === "/new") navigate("/");
}

function Form({ cfg }: { cfg: Config | null }) {
  const [address, setAddress] = useState("");
  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [looking, setLooking] = useState(false);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [logo, setLogo] = useState("");
  const [description, setDescription] = useState("");
  const [seats, setSeats] = useState("100");
  const [price, setPrice] = useState("0.05");
  const [hours, setHours] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [err, setErr] = useState("");
  const { account, token } = useWallet();
  const signedIn = Boolean(account && token);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    lockScroll(true);
    return () => {
      window.removeEventListener("keydown", onKey);
      lockScroll(false);
      document.body.style.overflow = "";
    };
  }, []);

  // Fill name, ticker, logo and description from chain + Pons whenever a valid address is pasted.
  useEffect(() => {
    setInfo(null);
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return;
    setLooking(true);
    api
      .token(address)
      .then((t) => {
        setInfo(t);
        setName((v) => v || t.name);
        setSymbol((v) => v || t.symbol);
        setLogo((v) => v || t.logo);
        setDescription((v) => v || t.description);
        if (!t.name && !t.symbol) setDetailsOpen(true); // nothing found, let them type it
      })
      .catch(() => setDetailsOpen(true))
      .finally(() => setLooking(false));
  }, [address]);

  const calc = useMemo(() => {
    if (!cfg) return null;
    const n = Number.parseInt(seats, 10);
    if (!Number.isFinite(n) || n < 1) return null;
    try {
      return { n, ...buyAmount(cfg, n, parseEther(price || "0")) };
    } catch {
      return null;
    }
  }, [cfg, seats, price]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!name.trim() || !symbol.trim()) {
      setDetailsOpen(true);
      setErr("Give the token a name and a ticker.");
      return;
    }
    if (!signedIn) return openWalletModal();
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        symbol: symbol.trim(),
        logo,
        description,
        seats: Number.parseInt(seats, 10),
        seatPriceEth: price,
      };
      if (address) body.tokenAddress = address;
      if (hours) body.deadlineHours = Number(hours);
      const { room } = await api.create(body, token);
      // The creator takes the first seat right away. Until they have, the coffin is unlisted and nobody else can sit.
      setStep("Coffin ready. Now take the first seat.");
      try {
        const r = await payForSeat(room, account, cfg!.explorer, setStep);
        if (!r.accepted) setErr(`Your seat was not taken: ${r.reason}`);
      } catch (e) {
        // cancelled or failed: the coffin exists and waits for the creator, the coffin page offers the seat again
        setErr(friendly(e));
      }
      closeCreate();
      navigate(`/c/${room.id}`);
    } catch (e) {
      setErr(friendly(e));
      setBusy(false);
    }
  }

  const found = info && (info.name || info.symbol);
  const overCurve = calc && Number(calc.buy) / 1e18 > GRAD_ETH;

  return (
    <div className="overlay sheet" onClick={close}>
      <form className="modal modal-lg card" data-lenis-prevent role="dialog" aria-label="Raise a dead token" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <h2>raise a dead token</h2>
          <button type="button" className="btn btn-sm btn-ghost" onClick={close}>
            close
          </button>
        </div>
        <p className="muted">Paste a dead token. Pick how many seats and what one seat costs. It relaunches when the last seat is taken.</p>
        {!signedIn && (
          <div className="gate">
            <p>Connect your wallet to raise a dead token. You sign one free message, and you take the first seat yourself, so you pay one seat price.</p>
            <button type="button" className="btn btn-sm" onClick={openWalletModal}>
              connect wallet
            </button>
          </div>
        )}

        <label className="field">
          <span>
            Dead token address <i>optional</i>
          </span>
          <input value={address} onChange={(e) => setAddress(e.target.value.trim())} placeholder="0x…" spellCheck={false} autoFocus />
        </label>

        {looking && <small className="muted">Looking it up…</small>}
        {found && (
          <div className="found">
            {logo ? <img src={ipfs(logo)} alt="" width={32} height={32} onLoad={monoOnLoad} onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} /> : <span className="wi" />}
            <span>
              {name} <span className="muted">${symbol}</span>
            </span>
            <span className="ok small">found</span>
          </div>
        )}
        {info && info.openRooms.length > 0 && (
          <small className="warn">
            Heads up: someone is already raising this token.{" "}
            {info.openRooms.map((id) => (
              <a key={id} href={`/c/${id}`} onClick={() => closeCreate()}>
                coffin {id}{" "}
              </a>
            ))}
          </small>
        )}

        <div className="two-even">
          <label className="field">
            <span>Seats</span>
            <input value={seats} onChange={(e) => setSeats(e.target.value.replace(/\D/g, ""))} inputMode="numeric" />
          </label>
          <label className="field">
            <span>Seat price (ETH)</span>
            <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" />
          </label>
        </div>

        {calc && cfg && (
          <div className="summary">
            <div>
              <span>Total pool</span>
              <b>{eth(calc.pool)} ETH</b>
            </div>
            <div>
              <span>{cfg.feeBps ? `Platform fee (${cfg.feeBps / 100}%), covers gas` : "Launch fee and gas"}</span>
              <b>{eth(calc.take)} ETH</b>
            </div>
            <div className="hl">
              <span>The buy</span>
              <b>≈ {eth(calc.buy)} ETH</b>
            </div>
            <p className="fine">Every seat gets an equal share of what this buys. You take the first seat now: you pay {eth(parseEther(price || "0"))} ETH.{cfg.feeBps ? " The fee is only taken when the coffin fills. A refund is never charged." : ""}</p>
            {overCurve && <p className="warn">Above about {GRAD_ETH} ETH the launch curve sells out, so part of the buy may be refunded to the coffin wallet.</p>}
          </div>
        )}

        <details className="more" open={detailsOpen} onToggle={(e) => setDetailsOpen((e.target as HTMLDetailsElement).open)}>
          <summary>token details {found ? "(filled in)" : ""}</summary>
          <div className="more-body">
            <div className="two">
              <label className="field">
                <span>Name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={48} />
              </label>
              <label className="field">
                <span>Ticker</span>
                <input value={symbol} onChange={(e) => setSymbol(e.target.value.replace(/^\$/, ""))} maxLength={16} />
              </label>
            </div>
            <label className="field">
              <span>
                Logo URL <i>https:// or ipfs://</i>
              </span>
              <input value={logo} onChange={(e) => setLogo(e.target.value.trim())} placeholder="ipfs://…" spellCheck={false} />
            </label>
            <label className="field">
              <span>Description</span>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} />
            </label>
          </div>
        </details>

        <details className="more">
          <summary>deadline {hours ? `(${hours}h)` : "(none)"}</summary>
          <div className="more-body">
            <label className="field">
              <span>
                Refund everyone if it has not filled after <i>hours</i>
              </span>
              <input value={hours} onChange={(e) => setHours(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="no deadline" />
            </label>
          </div>
        </details>

        {err && <p className="error">{err}</p>}
        {step && <p className="muted">{step}</p>}
        <button className="btn" disabled={busy || !cfg || !signedIn}>
          {busy ? "Raising…" : signedIn ? `Raise it and take seat 1 · ${eth(parseEther(price || "0"))} ETH` : "Connect wallet first"}
        </button>
        <p className="fine">Anyone can raise any token. Deadroom does not check that the token is really dead.</p>
      </form>
    </div>
  );
}
