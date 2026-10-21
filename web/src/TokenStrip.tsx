import { useState } from "react";
import { EXPLORER_URL, HAS_TOKEN, PONS_URL, TOKEN_CA, TOKEN_LABEL } from "./token";
import { short } from "./util";

function CopyCa({ className = "btn btn-sm btn-ghost" }: { className?: string }) {
  const [done, setDone] = useState(false);
  if (!HAS_TOKEN) return null;
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        navigator.clipboard?.writeText(TOKEN_CA).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        });
      }}
    >
      {done ? "copied" : "copy"}
    </button>
  );
}

function BuyButton({ className = "btn btn-sm" }: { className?: string }) {
  if (!HAS_TOKEN)
    return (
      <span className={`${className} soon`} aria-disabled="true">
        buy on pons · soon
      </span>
    );
  return (
    <a className={className} href={PONS_URL} target="_blank" rel="noreferrer">
      buy on pons
    </a>
  );
}

/** A slim bar above the nav on every page, so the address is always one glance away. */
export function TokenBar() {
  return (
    <div className="tbar" role="region" aria-label="Token contract address">
      <div className="wrap tbar-in">
        <span className="tbar-label">{TOKEN_LABEL}</span>
        <span className="tbar-ca mono">
          {HAS_TOKEN ? (
            <>
              <span className="long">{TOKEN_CA}</span>
              <span className="short">{short(TOKEN_CA)}</span>
            </>
          ) : (
            <span className="muted">contract address: coming soon</span>
          )}
        </span>
        <span className="tbar-actions">
          <CopyCa />
          <BuyButton />
        </span>
      </div>
    </div>
  );
}

/** The large version on the home page: the address in full, copyable, with the buy button and a warning. */
export function TokenCard() {
  return (
    <section className="tcard card" aria-label={`${TOKEN_LABEL} contract address`}>
      <div className="tcard-head">
        <span className="tag-small">{TOKEN_LABEL} · contract address</span>
        {HAS_TOKEN && <span className="live-dot" aria-hidden="true" />}
      </div>
      <code className="tcard-ca mono" data-lenis-prevent>
        {HAS_TOKEN ? TOKEN_CA : "0x… coming soon"}
      </code>
      <div className="row">
        <BuyButton className="btn" />
        <CopyCa className="btn btn-ghost" />
        {HAS_TOKEN && (
          <a className="btn btn-ghost" href={EXPLORER_URL} target="_blank" rel="noreferrer">
            view on explorer
          </a>
        )}
      </div>
      <p className="fine">
        {HAS_TOKEN
          ? "Copy the address from here. Anyone can launch a token with a similar name, so check that it matches. The buy button opens the token's page on Pons."
          : "The address will be posted here, and on our X, at launch. Anything else that claims to be our token is not."}
      </p>
    </section>
  );
}
