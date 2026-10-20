import { useEffect, useState } from "react";
import { api, type Config, type Room } from "../api";
import { CoffinStage } from "../CoffinStage";
import { RoomCard } from "../components";
import { PREVIEW } from "../env";
import { openCreate } from "../ui";

export function Home({ cfg }: { cfg: Config | null }) {
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (PREVIEW) return; // no server to ask
    const load = () =>
      api
        .rooms()
        .then((r) => {
          setRooms(r);
          setErr("");
        })
        .catch((e) => setErr(e.message));
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);

  // Opening the page with #coffins in the address: the list renders after the browser has tried to jump, so jump again.
  useEffect(() => {
    if (!rooms || !location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    if (el && window.scrollY < 50) requestAnimationFrame(() => el.scrollIntoView({ block: "start" }));
  }, [rooms !== null]);

  const sealed = rooms?.filter((r) => r.status === "open") ?? [];
  const rest = rooms?.filter((r) => r.status !== "open") ?? [];

  return (
    <>
      <CoffinStage />

      {PREVIEW && (
        <section id="coffins" className="section">
          <div className="section-head">
            <h2>waiting to rise</h2>
            <span className="muted">opening soon</span>
          </div>
          <div className="empty">
            <p>the first coffins open soon. nothing here takes money yet.</p>
          </div>
        </section>
      )}
      {!PREVIEW && (<section id="coffins" className="section">
        <div className="section-head">
          <h2>waiting to rise</h2>
          {cfg && <span className="muted">{sealed.length} sealed</span>}
        </div>
        {err && <p className="error">{err}</p>}
        {!rooms && !err && <p className="muted">loading coffins…</p>}
        {rooms && sealed.length === 0 && (
          <div className="empty">
            <p>no coffins yet. nobody has died. suspicious.</p>
            <button className="btn btn-sm" onClick={openCreate}>
              dig up the first one
            </button>
          </div>
        )}
        <div className="grid">{cfg && sealed.map((r) => <RoomCard key={r.id} room={r} cfg={cfg} />)}</div>
      </section>)}

      {rest.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>risen and buried</h2>
          </div>
          <div className="grid">{cfg && rest.map((r) => <RoomCard key={r.id} room={r} cfg={cfg} />)}</div>
        </section>
      )}

      <section id="how" className="how">
        <p className="lede">
          every dead token can be raised. a crowd takes seats at one price, and when the last seat is taken the token relaunches with its old name and logo, with everyone buying in together at that price. leave before it opens and you get your eth back.
        </p>

        <ol className="steps">
          <li>
            <span className="n">01</span>
            <span className="t">
              <b>dig up.</b> name the dead token, the seat count and the seat price.
            </span>
          </li>
          <li>
            <span className="n">02</span>
            <span className="t">
              <b>fill.</b> each wallet pays the exact price for one seat.
            </span>
          </li>
          <li>
            <span className="n">03</span>
            <span className="t">
              <b>open.</b> the last seat relaunches the token. equal shares for everyone.
            </span>
          </li>
          <li>
            <span className="n">04</span>
            <span className="t">
              <b>buy back.</b> the coffin wallet collects trading fees and buys more of the token.
            </span>
          </li>
        </ol>
      </section>
    </>
  );
}
