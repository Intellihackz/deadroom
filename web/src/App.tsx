import { gsap } from "gsap";
import { useEffect, useMemo, useRef, useState, type AnchorHTMLAttributes, type ReactNode } from "react";
import { sceneSvg } from "./motion/coffin";
import { api, type Config } from "./api";
import { PREVIEW } from "./env";
import { CreateModal } from "./pages/Create";
import { openCreate } from "./ui";
import { Home } from "./pages/Home";
import { LedgerPage } from "./pages/Ledger";
import { RoomPage } from "./pages/Room";
import { closeWalletModal, connectWith, disconnect, friendly, initWallets, openWalletModal, useWallet } from "./wallet";

// ---- tiny router ----
// Page changes lower a curtain (a black sheet with an ember edge that rises), swap the page behind it, then lift it away.
let curtain: HTMLElement | null = null;
export function navigate(to: string) {
  const [path, hash] = to.split("#");
  const jump = () => {
    if (!hash) return window.scrollTo(0, 0);
    requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const go = () => {
    history.pushState({}, "", to);
    window.dispatchEvent(new PopStateEvent("popstate"));
    jump();
  };
  if (path === location.pathname) return go(); // same page: no curtain, just move
  if (!curtain || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return go();
  gsap.killTweensOf(curtain);
  gsap
    .timeline()
    .set(curtain, { display: "block", yPercent: 100 })
    .to(curtain, { yPercent: 0, duration: 0.36, ease: "power3.inOut" })
    .add(go)
    .to(curtain, { yPercent: -100, duration: 0.42, ease: "power3.inOut", delay: 0.06 })
    .set(curtain, { display: "none" });
}

export function Link({ to, children, ...rest }: { to: string; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      href={to}
      {...rest}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  return path;
}

export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="3" fill="var(--ink)" stroke="var(--line-2)" />
      <path d="M10 24.8V10.8A6 6 0 0 1 22 10.8V24.8" fill="none" stroke="var(--bone)" strokeWidth="3" strokeLinejoin="round" />
      <rect x="6.5" y="24.8" width="19" height="2.8" fill="var(--ember)" />
    </svg>
  );
}

export function useConfig() {
  const [cfg, setCfg] = useState<Config | null>(null);
  useEffect(() => {
    if (PREVIEW) return; // no server to ask
    api.config().then(setCfg).catch(() => {});
  }, []);
  return cfg;
}

function ConnectButton() {
  const { account } = useWallet();
  if (!account)
    return (
      <button className="btn btn-sm btn-ghost" onClick={openWalletModal}>
        connect wallet
      </button>
    );
  return (
    <button className="btn btn-sm btn-ghost" onClick={openWalletModal} title="Wallet options">
      <span className="dot" /> {account.slice(0, 6)}…{account.slice(-4)}
    </button>
  );
}

function WalletModal() {
  const { account, modal, wallets } = useWallet();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => {
    if (!modal) return;
    setErr("");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeWalletModal();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal]);
  if (!modal) return null;

  return (
    <div className="overlay top" onClick={closeWalletModal}>
      <div className="modal card" role="dialog" aria-label="Connect a wallet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{account ? "wallet" : "connect a wallet"}</h2>
          <button className="btn btn-sm btn-ghost" onClick={closeWalletModal}>
            close
          </button>
        </div>
        {account && (
          <div className="addr">
            <code className="mono">{account}</code>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => {
                disconnect();
                closeWalletModal();
              }}
            >
              disconnect
            </button>
          </div>
        )}
        {!account && wallets.length === 0 && (
          <p className="muted">
            no browser wallet found. install MetaMask, Rabby or Coinbase Wallet and reload. you can also send from any wallet and paste the transaction hash on the room page.
          </p>
        )}
        {!account && (
          <ul className="wallets">
            {wallets.map((w) => (
              <li key={w.id}>
                <button
                  className="wallet"
                  disabled={Boolean(busy)}
                  onClick={async () => {
                    setErr("");
                    setBusy(w.id);
                    try {
                      await connectWith(w.id);
                    } catch (e) {
                      setErr(friendly(e));
                    } finally {
                      setBusy("");
                    }
                  }}
                >
                  {w.icon ? <img src={w.icon} alt="" width={28} height={28} /> : <span className="wi" />}
                  <span className="grow">{w.name}</span>
                  <span className="muted">{busy === w.id ? "sign the message…" : "connect"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {err && <p className="error">{err}</p>}
        <p className="fine">Connecting asks you to sign one message to prove the wallet is yours. It costs no gas and gives no permission to move funds. Nothing is spent until you confirm a seat.</p>
      </div>
    </div>
  );
}

function Soon() {
  const svg = useMemo(() => sceneSvg(), []);
  useEffect(() => {
    const prev = document.title;
    document.title = "Opening soon · Deadroom";
    return () => {
      document.title = prev;
    };
  }, []);
  return (
    <section className="nf">
      <div className="nf-text">
        <p className="eyebrow">opening soon</p>
        <h1>
          the lid is <em>still on.</em>
        </h1>
        <p className="lede">coffins, seats and the ledger open when the first room does. nothing on this site takes money yet.</p>
        <Link to="/" className="btn">
          back to the start
        </Link>
      </div>
      <div className="scene nf-scene" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
    </section>
  );
}

function NotFound() {
  const svg = useMemo(() => sceneSvg(), []);
  useEffect(() => {
    const prev = document.title;
    document.title = "Nothing buried here · Deadroom";
    return () => {
      document.title = prev;
    };
  }, []);
  return (
    <section className="nf">
      <div className="nf-text">
        <p className="eyebrow">404</p>
        <h1>
          nothing is <em>buried</em> here.
        </h1>
        <p className="lede">this plot is empty. the coffin you wanted was never dug up, or it was moved.</p>
        <Link to="/" className="btn">
          back to the coffins
        </Link>
      </div>
      <div className="scene nf-scene" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
    </section>
  );
}

export function App() {
  const path = usePath();
  const cfg = useConfig();
  useEffect(() => (PREVIEW ? undefined : initWallets()), []);

  let page: ReactNode;
  const coffin = path.match(/^\/[cr]\/([a-z0-9]+)\/?$/i); // /r/ is the old path, kept so shared links still work
  const curtainRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    curtain = curtainRef.current;
    return () => {
      curtain = null;
    };
  }, []);
  if (PREVIEW && path !== "/") page = path === "/new" || coffin || path === "/ledger" ? <Soon /> : <NotFound />;
  else if (coffin) page = <RoomPage id={coffin[1]} cfg={cfg} key={coffin[1]} />;
  else if (path === "/ledger") page = <LedgerPage cfg={cfg} />;
  else if (path === "/" || path === "/new") page = <Home cfg={cfg} />;
  else page = <NotFound />;
  useEffect(() => {
    if (path === "/new" && !PREVIEW) openCreate(); // deep link: open the modal over the home page
  }, [path]);

  return (
    <>
      <a href="#main" className="skip">
        skip to content
      </a>
      <header className="nav">
        <div className="wrap nav-in">
          <Link to="/" className="brand">
            <Mark />
            <span>deadroom</span>
          </Link>
          <nav>
            <Link to="/#coffins" className="plain">
              coffins
            </Link>
            {PREVIEW ? (
              <span className="btn btn-sm btn-ghost soon" aria-disabled="true">
                opening soon
              </span>
            ) : (
              <>
                <Link to="/ledger" className="plain">
                  ledger
                </Link>
                <button className="btn btn-sm" onClick={openCreate}>
                  dig up a coffin
                </button>
                <ConnectButton />
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="wrap" id="main" tabIndex={-1}>
        {page}
      </main>
      <footer className="foot wrap">
        <p>{" "}
          {PREVIEW ? "Deadroom is not open yet, and nothing on this site takes money. " : ""}
          {cfg?.feeBps ? `When a coffin relaunches, ${cfg.feeBps / 100}% of the pool pays the launch and gas, and the rest of that fee goes to the treasury. It is never taken from a refund. ` : ""}
          {PREVIEW ? null : <><Link to="/ledger">Fees and burns</Link>. </>}Launches run on Pons contracts."
        </p>
      </footer>
      {!PREVIEW && <WalletModal />}
      <div className="curtain" ref={curtainRef} aria-hidden="true" />
      {!PREVIEW && <CreateModal cfg={cfg} />}
    </>
  );
}
