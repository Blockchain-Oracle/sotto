# Sotto Design System — "Sotto Voce"

Binding visual authority for every Sotto surface (app, site, docs, wallet
approval page, CLI output). Approved at identity gate C0 on 2026-07-19. Changes
to this file require an explicit product decision. The screen/state truth
remains `.thoughts/design/2026-07-12-sotto-x402-surface-map/`; this file governs
how those screens look, move, and speak.

## 1. Concept

_Sotto voce_ is a dynamic marking engraved under the staff — an instruction to
keep the voice low. Sotto renders payment evidence the same way: quiet,
engraved, precise. The purchase lifecycle is the signature element — an engraved
**system** where each real journal event lands as a mark on the line,
**settlement is the double barline**, empty states are **rests** (notated
silence, never apology), and redacted evidence sits behind a **filigrana**
watermark veil that comes to light only for the authorized reader. The identity
keeps every structural decision the accepted prototype proved: density, thin
rules, small radii, mono evidence, paired states.

**Anti-twee rule (binding):** no literal musical glyphs — no notes, clefs,
staves with five lines, or floating symbols, ever. The vocabulary is abstracted
to lines, barlines, dots, and rests only.

## 2. Color

Tokens live in `packages/ui/src/theme.css` — the ONLY file in the repository
allowed to contain raw hex. Everything else uses tokens.

| Token        | Carta (light) | Notte (dark) | Role                                                                                           |
| ------------ | ------------- | ------------ | ---------------------------------------------------------------------------------------------- |
| `--canvas`   | `#F6F5F1`     | `#10131A`    | page ground (dark is first-class, "the quiet room")                                            |
| `--surface`  | `#FFFEFB`     | `#171B24`    | cards, rows, rails                                                                             |
| `--ink`      | `#16181F`     | `#ECEDED`    | primary text                                                                                   |
| `--muted`    | `#63666F`     | `#8E91A0`    | secondary text                                                                                 |
| `--line`     | `#E3E1D8`     | `#252A36`    | hairlines, borders, the staff                                                                  |
| `--lapis`    | `#2B3FC4`     | `#6D7DF2`    | THE accent: actions, focus, human-authority states                                             |
| `--verde`    | `#0E7A45`     | `#3FC98A`    | **settlement money-truth ONLY** — a green mark is earned by a real Canton update, nothing else |
| `--ametista` | `#7A4694`     | `#B98CD1`    | delivery outcomes (never neon web3 purple)                                                     |
| `--ambra`    | `#9A6A00`     | `#D9A03F`    | caution: DEVNET tags, stale, expiring                                                          |
| `--rosso`    | `#B3261E`     | `#EF6A5F`    | danger: rejected, quarantined, failed                                                          |

Rules: semantic colors never appear for decoration. State is never color-only —
every state carries label + shape (pill, hollow ring, bar).
`settled-undelivered` renders as solid verde settlement pill + hollow ametista
delivery pill; the two facts never merge. Canton/partner brand colors appear
only inside their official marks (`packages/ui/ASSET-MANIFEST.md` governs every
mark). No gradients, no glassmorphism, no glow.

## 3. Type

Three voices, self-hosted via `next/font/local`, ≤6 weight files total:

- **Fraunces (variable, opsz)** — the speaking voice. Display headings, the site
  manifesto, gate moments. Weight ~540–600, optical size high for large sizes.
  Never used for UI chrome, tables, or controls.
- **Geist Sans** — the working voice. All product UI, body, controls, labels.
- **Geist Mono + `tabular-nums`** — the testifying voice. EVERY price, amount,
  hash, party ID, update ID, offset, timestamp, route, and status code. No
  exceptions. Evidence set in mono is a product guarantee, not a style.

Scale: UI base 13–15px; running text ≤65ch; uppercase mono labels get
`letter-spacing: .1em`. Headings `text-wrap: balance`.

## 4. Motion — "cue → sound → decay"

- **Cue**: a line draws in (`scaleX`, ~240ms ease-out).
- **Sound**: an event mark lands (scale 1.5→1, ~340ms) exactly when the REAL
  journal/probe event commits — never on a timer.
- **Decay**: emphasis fades to the persistent engraved state.

One-shot, total ≤550ms, nothing loops, no ambient motion. Progress indicators
are state rails advanced only by real events; the ONLY permitted time-driven
motion is `Deadline` counting down to a real expiry field.
`prefers-reduced-motion` renders final states with opacity-only changes. Loading
skeletons preserve the final layout geometry exactly.

## 5. Signature primitives (`packages/ui/src/primitives/`)

- **`system-rail`** — the engraved lifecycle: staff line, event marks with mono
  timestamps, verde double barline at settlement, hollow marks for pending. Used
  by Composer inspector, Add API audit, funding step, CLI text rendering.
- **`state-chip`** — paired settlement/delivery pills; never a generic
  "Success".
- **`rest-state`** — designed empty states: honest zero as anticipation with one
  real next action. Never apology copy, never fake placeholder data.
- **`veil`** — the filigrana redaction boundary: diagonal watermark hatch over
  withheld fields with the exact reason ("Private resource context"). Owner-
  authorized detail renders un-veiled; there is no theatrical "reveal" animation
  of private data.
- **`deadline`** — countdown against a real `executeBefore`/expiry value.
- Plus tokenized `button` (loading state preserves width), `field/input/select`,
  `card`, `badge`, `table` (dense, hairline), `code-block`, `copy-chip`
  (truncated ID → full value on copy), `dialog/tabs/tooltip` (Radix-wrapped),
  `toast` (secondary actions only — payment/settlement results NEVER live in a
  toast), `skeleton`, `system-strip` (global system conditions only).

## 6. Copy and evidence formatting (binding, from surface map 09/10)

- Verbs for commands ("Add API", "Prepare call", "Open in Canton explorer");
  nouns/adjectives for status ("Healthy", "Settled", "Delivery failed"). Errors
  name the failed boundary + the next safe action.
- Say: Canton x402, verified resource, payment challenge, settlement, delivery,
  owner session, party ID, "CC test value on DevNet", "Settlement rate" and
  "Delivery rate" (always separately, never generic success).
- Never say: demo, proof page, showcase, sample; organization/team/auditor;
  wallet balance/bank/deposit/withdraw; "private payment" for public CC
  settlement; "Live" without a timestamp; "Success" when settlement and delivery
  differ; "Make any API payable".
- Truncation: party IDs keep hint + first/last (`merchant-ctai::1220…c397b`);
  update IDs first-8 + last-4 (`1220a91e…7c2f`); copy actions return the full
  value; URLs show origin + route, never an ellipsized hostname; amounts always
  carry the asset; relative time in lists, exact UTC in detail views.
- "This signature does not move funds" appears ONLY on session login, never on
  payment authorization.

## 7. Layout

Breakpoints verified at 390 / 768 / 1280 / 1440. No page-level minimum width;
horizontal scrolling only inside tables/code/technical rows with a visible
affordance. Cards are individual records only — never card-inside-card, never a
decorative outer card around a work surface. Radii ≤6px. Stable control
dimensions (loading labels never shift neighbors). Modals fit 390px with
internal scroll.

## 8. Anti-slop contract (binding)

No generic SaaS hero + benefit cards; no DeFi portfolio/balance dashboard; no
gradient orbs, glassmorphism, neon chain graphics, token coins, or stock
blockchain art; no wall of equal-weight cards; no fake terminal output presented
as evidence (captured output must be real); no fabricated metrics, testimonials,
or activity anywhere, ever; no purple-gradient hero; no hidden critical state in
toasts; no time-based progress on real payments.

## 9. Design QA gate (every Track C phase)

`scripts/shoot.mjs` (ports: site 4101, app 4102, docs 4103) captures every
surface in light + dark + reduced-motion into `.shots/`; diff against the dated
baseline. Each phase ships only after: screenshots in both themes, an anti-slop
vision audit on hero surfaces, an a11y pass (focus visible, contrast, state
never color-only), and Abu's review of the three identity screens — marketplace
`/`, the Composer workspace, and the Scan evidence detail.
