# Deadroom brand

One idea: **a dark room where the only light is what comes under the door.** Everything on screen is black, bone and grey, and ember appears only on something that is lit.

## Name

- **Deadroom** is the viewing room. Each dead token lies in a **coffin**. Creating one is **digging it up**.
- In running text: `Deadroom` (capital D). In the wordmark and UI: `deadroom` (lowercase).
- Never "Dead Room", "DeadRoom" or "DEADROOM".

## Mark

**The door.** A tombstone that is also a door, with light under it: the light is coming from the other side. One bone arch, one ember line. Files in `mark/`.

| File | Use |
|---|---|
| `mark.svg` | the mark on transparent, bone arch with an ember light line |
| `mark-tile.svg` / `.png` | the app icon: the mark on a black tile |
| `mark-bone.svg` | one colour on dark backgrounds (the light line is bone) |
| `mark-ink.svg` | on light backgrounds |

- Minimum size 16 px. Clear space around it is at least the height of the light line, times four.
- Do not rotate, fill the arch, add gradients or put it on a coloured background. Ember is the light line and nothing else.

## Wordmark

The door, then `deadroom` in JetBrains Mono Bold, lowercase, tracking -0.045em. Files in `wordmark/`. Use `wordmark-on-dark` on black or photos, `wordmark-on-light` on white. Minimum width 96 px.

## Colour

| Role | Hex | Rule |
|---|---|---|
| ground | `#000000` | page and tiles |
| ink | `#f2f2f2` | text and linework (called bone) |
| muted | `#858585` | secondary text, passes AA on ground |
| line | `#262626` / `#3a3a3a` | hairlines, empty seats |
| ember | `#ff6a2b` | **lit things only**: a taken seat, light from the lid, a live status, the fill on a primary hover |

No other colours. Token logos are always shown in black and white (three flat tones), so a token's own colours never compete with ember.

## Type

**JetBrains Mono**, self-hosted (variable, 100 to 800). One family for everything.

- Display: lowercase, weight 400 to 500, tracking -0.075em, leading 0.96.
- Body and UI: 13 px, weight 400, normal tracking, lowercase for headings and buttons.
- Numbers: tabular. Seat counts and ETH amounts always in mono.

## Voice

A funeral home that is calm, polite and a little too serious about something absurd.

- Do: "no coffins yet. nobody has died. suspicious." / "survived by 41 of 100 seats." / "pay to resurrect."
- Money words stay literal: **seat, seat price, refund, buy, leave**. People must never decode a joke to know what they are paying for.
- Funeral language is flavour and status only: sealed, opening, rising, risen, buried, rotted.
- Never claim a token is dead unless it is. Never imply partnership with Pons: keep "not affiliated".
- No em or en dashes. Sentence case. No hype words.

## Imagery

- The isometric coffin scene is the signature image (`social/og-image`, `social/x-banner`). It is generated from code by `web/scripts/brand.ts`, never redrawn by hand.
- Token logos: monochrome only.
- No stock photography, no gradients, no glow other than ember light from the lid.

## Assets

```
mark/       mark, tile, bone and ink versions (svg, png)
wordmark/   lockups on dark and light (svg, png)
icons/      favicon 16/32/48, apple touch, 192, 512, maskable 512
social/     x-avatar 800, x-banner 1500x500, og-image 1200x630 (svg and png)
```

Rebuild everything with `cd web && npx tsx scripts/brand.ts`.
