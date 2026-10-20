import { useEffect, useMemo, useRef } from "react";
import { mountStage, sceneSvg } from "./motion/coffin";
import { PREVIEW } from "./env";
import { openCreate } from "./ui";

/**
 * The home hero. A sticky stage: scrolling fills the coffin seat by seat, and at the last seat
 * the lid lifts. The same sentence the product says, shown by the page itself.
 */
export function CoffinStage() {
  const ref = useRef<HTMLElement>(null);
  const svg = useMemo(() => sceneSvg(), []);

  useEffect(() => (ref.current ? mountStage(ref.current) : undefined), []);

  return (
    <section className="stage" ref={ref} aria-label="How a coffin fills">
      <div className="stage-in">
        <div className="stage-text">
          <p className="eyebrow">robinhood chain / built on pons</p>
          <h1>
            pay to <em>resurrect.</em>
          </h1>
          <p className="tag">
            <b>raising dead tokens.</b> same price for everyone, in the same block.
          </p>
          <p className="live" aria-live="off">
            <span className="mono big">
              <span data-seats>30</span>
              <span className="muted"> / 100</span>
            </span>
            <span className="muted"> seats</span>
            <span className="state" data-state="sealed">
              sealed
            </span>
            <span className="muted hint">scroll to fill it</span>
            {PREVIEW && <span className="muted small example">an example coffin, not a real one</span>}
          </p>
          <div className="row">
            {PREVIEW ? (
              <a className="btn" href="#how">
                how it works
              </a>
            ) : (
              <>
                <button className="btn" onClick={openCreate}>
                  dig up a coffin
                </button>
                <a className="cue" href="#coffins">
                  see the coffins
                </a>
              </>
            )}
          </div>
        </div>
        <div className="scene" data-scene dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
    </section>
  );
}
