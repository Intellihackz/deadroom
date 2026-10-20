# Deadroom design notes

## Brief

- **Subject:** Deadroom, a product where a crowd fills a coffin for a dead token and it relaunches on Pons (Robinhood Chain) when the last seat is taken. Everyone buys in one transaction at one price.
- **Audience:** people holding or watching dead tokens, comfortable with wallets, skeptical of anything that smells like a rug.
- **Job of the site:** get a visitor to understand the mechanic in 10 seconds, then dig up a coffin or take a seat.
- **Stack:** the existing Vite + React + TypeScript app. Added GSAP + ScrollTrigger only. No Lenis (native scroll is fine for one sticky stage), no WebGL (the scene is line art, and a crisp SVG holds 60 fps on a phone). Reason: scale the theatre to the brief.
- **Assumptions:** copy is the owner's product copy, no invented metrics. The seat count shown in the hero (100) is an example.

## Concepts

| | Idea | Anchor | Original | Fit | Feasible | Portable (low is good) |
|---|---|---|---|---|---|---|
| A | Scroll fills the coffin seat by seat, and at the last seat the lid lifts and light climbs out | the real mechanic: N equal seats, the last one triggers the relaunch | 4 | 5 | 4 | 1 |
| B | Every page is an obituary column, the product as newsprint | the death notice line | 3 | 4 | 5 | 3 |
| C | A séance board whose planchette spells the token name as wallets join | wallets joining | 4 | 3 | 3 | 3 |

**Pick: A.** The site demonstrates the product with its own scroll. B survives as a small voice device (the death notice line on each coffin page).

## Concept card

```
Idea:        scroll to fill a coffin seat by seat; the last seat lifts the lid
Metaphor:    a viewing room: dead things lie in coffins, a crowd gathers, the lid lifts
Signature:   sticky hero stage. Scroll progress is the driver: seats light up, then the lid slides off and ember light rises
Emotion:     quiet, a little ominous, then a small lift of relief at the last seat
Motion verb: rise. Things rise: fills come up from the bottom, the lid lifts, light and dust climb
Screenshot:  the open coffin, every seat lit, hairline rays going up, the gravestone behind it
```

## System

- **Palette (roles):** ground `#000000`, ink `#f2f2f2`, muted `#858585` (AA on ground), line `#262626`, line-2 `#3a3a3a`, accent ember `#ff6a2b`, curtain `#000000`. Ember means "lit" and nothing else: a taken seat, light from the lid, the live status, the fill on primary hover.
- **Genericness test:** black plus one warm accent is on the avoid list. Kept on purpose: the accent is the concept (the only light in a dark room), so it is rationed to lit things.
- **Type:** the system monospace stack, lowercase headings with tight tracking (-0.075em at display size). Mono for small labels is also on the avoid list. Kept: the terminal voice is the brand, and every number in the product (seats, ETH) benefits from tabular figures. Self-hosting a specific mono is part of the branding pass.
- **Grid:** 1360 px max, 40 px gutters on desktop, 20 px on phones. Hero is a two column stage (text, scene). Sections after it vary: a ruled list, a four column steps row, a card grid.
- **Shape:** 2 px radius everywhere. Hairlines are 1 px and never scale with the viewBox.
- **Motion language:** ease is GSAP `power3.out` for hover (0.35 s) and exponential smoothing for the scroll driver. Big things move slower than small things. Everything runs off the GSAP ticker.
- **Idle state:** the next unlit seat breathes, rays flicker, dust drifts upward slowly. Paused when the stage is off screen, absent under reduced motion.
- **Pointer:** the scene leans up to 12 px toward the pointer.
- **Hover (primary targets):** a fill of ember rises from the bottom edge and the label turns black. Cards grow an ember edge from the bottom up. Utility links only change color.
- **Reduced motion:** no scrub, no ticker. The stage renders one designed still: 60 percent of seats lit, lid on.
- **Phone:** the scene sits above the text at about 46svh, the stage is 160svh tall, seat count and state stay visible.

## Composition plan

```
[hero stage, sticky 100svh inside 220svh]
  text left: eyebrow, h1, live line "37 / 100 seats  sealed", cta, scroll cue
  scene right: gravestone, coffin with seat cells, lid, rays, dust

[lede + steps]   one paragraph, then four columns 01 to 04
[coffins]        card grid, bar-as-text progress
[footer]         disclosure
```

## Open items for the branding pass

Logo, wordmark, banner, X avatar, link preview image, a self-hosted mono, a page transition that belongs to the concept (a lid sliding), and a designed 404.
