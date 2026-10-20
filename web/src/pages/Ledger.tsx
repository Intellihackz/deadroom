import { useEffect, useState } from "react";
import { Link } from "../App";
import type { Config } from "../api";
import { eth, short, tokens } from "../util";

type Ledger = {
  enabled: boolean;
  feeBps: number;
  burnShareBps: number;
  treasury: string | null;
  burnWallet: string | null;
  platformToken: string | null;
  totals: { gross: string; costs: string; net: string; toTreasury: string; toBurnWallet: string; burnedEth: string; burnedTokens: string };
  coffins: { id: string; name: string; symbol: string; at: number; feeWei: string; costWei: string; netWei: string; treasuryWei: string; burnWei: string; treasuryTx?: string; burnTx?: string; swept: boolean }[];
  burns: { t: number; ethWei: string; tokens: string; buyTx: string; burnTx: string }[];
  note: { text: string } | null;
};

export function LedgerPage({ cfg }: { cfg: Config | null }) {
  const [l, setL] = useState<Ledger | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    document.title = "Fees and burns · Deadroom";
    fetch("/api/ledger")
      .then((r) => r.json())
      .then(setL)
      .catch(() => setErr("Could not load the ledger."));
  }, []);
  const x = (hash?: string) => (hash && cfg ? <a href={`${cfg.explorer}/tx/${hash}`} target="_blank" rel="noreferrer">{short(hash)} ↗</a> : <span className="muted">none</span>);

  return (
    <div className="ledger">
      <Link to="/" className="back">
        ← all coffins
      </Link>
      <h1 className="h-page">fees and burns</h1>
      <p className="lede small">Everything Deadroom keeps, what it paid for and where the rest went. Every row links to its transaction.</p>
      {err && <p className="error">{err}</p>}
      {!l && !err && <p className="muted">loading…</p>}
      {l && (
        <>
          <div className="card pad-lg">
            <h2>the rule</h2>
            {l.enabled ? (
              <p className="muted">
                When a coffin fills and relaunches, Deadroom holds back <b className="mono">{l.feeBps / 100}%</b> of the pool. That pays the launch fee and gas first. What is left goes to the treasury
                {l.platformToken ? `, and ${l.burnShareBps / 100}% of it buys the platform token and burns it` : ". There is no platform token yet, so all of it goes to the treasury"}. It is never taken from a refund, a leave or an expired coffin.
              </p>
            ) : (
              <p className="muted">No platform fee is charged. The whole pool goes into the buy, less the launch fee and gas.</p>
            )}
            <dl className="facts facts-3" style={{ marginTop: 14 }}>
              <div>
                <dt>treasury</dt>
                <dd className="mono">{l.treasury && cfg ? <a href={`${cfg.explorer}/address/${l.treasury}`} target="_blank" rel="noreferrer">{short(l.treasury)} ↗</a> : "none"}</dd>
              </div>
              <div>
                <dt>platform token</dt>
                <dd className="mono">{l.platformToken && cfg ? <a href={`${cfg.explorer}/token/${l.platformToken}`} target="_blank" rel="noreferrer">{short(l.platformToken)} ↗</a> : "not launched"}</dd>
              </div>
              <div>
                <dt>burn wallet</dt>
                <dd className="mono">{l.burnWallet && cfg ? <a href={`${cfg.explorer}/address/${l.burnWallet}`} target="_blank" rel="noreferrer">{short(l.burnWallet)} ↗</a> : "none"}</dd>
              </div>
            </dl>
          </div>

          <div className="stats">
            <div className="card pad"><span className="muted">fees held back</span><b className="mono">{eth(l.totals.gross)} ETH</b></div>
            <div className="card pad"><span className="muted">spent on launch and gas</span><b className="mono">{eth(l.totals.costs)} ETH</b></div>
            <div className="card pad"><span className="muted">sent to the treasury</span><b className="mono">{eth(l.totals.toTreasury)} ETH</b></div>
            <div className="card pad"><span className="muted">burned</span><b className="mono">{tokens(l.totals.burnedTokens)}</b><small className="muted">for {eth(l.totals.burnedEth)} ETH</small></div>
          </div>
          {l.note && <p className="fine">{l.note.text}</p>}

          <section className="section">
            <div className="section-head"><h2>by coffin</h2><span className="muted">{l.coffins.length}</span></div>
            {l.coffins.length === 0 && <p className="muted">No coffin has relaunched yet.</p>}
            <div className="tablewrap">
              <table>
                <thead><tr><th>coffin</th><th>fee</th><th>launch and gas</th><th>net</th><th>to treasury</th><th>to burn wallet</th></tr></thead>
                <tbody>
                  {l.coffins.map((c) => (
                    <tr key={c.id}>
                      <td><Link to={`/c/${c.id}`}>{c.name} <span className="muted">${c.symbol}</span></Link></td>
                      <td className="mono">{eth(c.feeWei)}</td>
                      <td className="mono">{eth(c.costWei)}</td>
                      <td className="mono">{eth(c.netWei)}</td>
                      <td className="mono">{eth(c.treasuryWei)} {x(c.treasuryTx)}</td>
                      <td className="mono">{eth(c.burnWei)} {x(c.burnTx)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="section">
            <div className="section-head"><h2>burns</h2><span className="muted">{l.burns.length}</span></div>
            {l.burns.length === 0 && <p className="muted">{l.platformToken ? "No burn yet." : "No burns yet. They start when the platform token exists."}</p>}
            <div className="tablewrap">
              {l.burns.length > 0 && (
                <table>
                  <thead><tr><th>when</th><th>eth spent</th><th>tokens burned</th><th>buy</th><th>burn</th></tr></thead>
                  <tbody>
                    {l.burns.map((b) => (
                      <tr key={b.burnTx}>
                        <td>{new Date(b.t).toLocaleString()}</td>
                        <td className="mono">{eth(b.ethWei)}</td>
                        <td className="mono">{tokens(b.tokens)}</td>
                        <td className="mono">{x(b.buyTx)}</td>
                        <td className="mono">{x(b.burnTx)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
