---
name: hackathon-idea-scout
description: Find, ground, and pressure-test hackathon project ideas using a research-first, judge-centric lens. Use this whenever the user is figuring out WHAT to build for a hackathon, bounty, demo day, or grant — phrases like "what should I build", "help me find a project idea", "brainstorm ideas for the X hackathon", "is this idea any good", "pressure-test my idea", "will judges like this", or when they're weighing one chain/platform/API against the kind of thing worth building on it. Trigger even when the user names a specific idea and just wants it sharpened, not only when they ask for a fresh list. Do NOT use this to write specs, user stories, architecture, or code — this is the discovery/judgment stage that comes BEFORE building.
---

# Hackathon Idea Scout

A lens for hackathon idea work. It does two jobs with the same brain:

- **Discover** — the user has no idea yet → research and produce a ranked menu of grounded candidates.
- **Pressure-test** — the user already has an idea (or a shortlist) → score it honestly, ground it, and surface what would kill it.

This skill is judgment, not a vending machine. Its value is in *how it thinks*, so internalize the reasoning below rather than running it as a checklist. The output is ideas the user can browse and react to — never specs or code. Building comes later, only if the user explicitly says "let's build it."

---

## The win formula (the heart of everything)

```
Win = (a judge can try it with zero friction — "30 seconds" is shorthand, not a stopwatch)
    × (it obviously needs THIS chain / platform / tech)
    × (it looks like a real product, not a demo)
```

It's **multiplicative on purpose**. A zero in any one factor zeroes the whole thing — a brilliant idea no judge can try loses to a simpler one they can. Score every candidate against all three; don't let a strong factor paper over a weak one.

What each factor really means:

1. **Try in 30 seconds — which means ZERO FRICTION, not a stopwatch.** Many judges aren't technical and won't read your code. If they can't click in and *get it* — log in, do the one core action, see the payoff — it doesn't land. Favor ideas with a single, obvious, self-serve action. The killer move is a demo where the value (and especially the privacy/uniqueness) is *visible on screen* in one moment.
   **CRITICAL (Abu, locked 2026-07-06):** "30 seconds" is shorthand for *no friction*, never a literal time budget. Friction = leaving the app or crypto plumbing (faucets, wallets, extensions, external setup). A real email signup with an OTP code is **NOT** friction — it's a real product working, even if the full journey takes ~2 minutes. NEVER use "the time budget is impossible" as a reason to shortcut, fake, or skip demoing anything through real integration. Realness beats speed, always.

2. **Obviously needs this platform.** The whole reason a sponsor runs a hackathon is to surface what's only possible *because of their thing*. So you must know what the platform is *uniquely* good at, then pick ideas whose value **collapses without it**. The test: "If I rebuilt this on a generic alternative and nothing of value is lost, it's the wrong idea." (For a privacy chain like Canton: if everyone could see the data and nothing breaks, wrong idea.)

3. **Looks like a real product, not a demo.** Winners feel like something a person or business would actually use — a recognizable product shape, not "we put X on a blockchain." Anchor every idea to a real, named, shipping product the judge already understands (see below).

---

## The process (shared by both modes)

Run these in order. The research steps are not optional — the recurring failure mode is generating plausible-sounding "AI ideas" that fall apart on contact with reality. Ground first, opine second.

### 1. Load the domain knowledge — find the superpower
Before anything, learn what the platform is *uniquely* good at. Read whatever the project provides: a `.thoughts/` knowledge base, a docs folder, a README, the sponsor brief, linked repos. If there's a wiki/index, start there. Pull out the **one or two superpowers** that make "obviously needs this platform" possible. You cannot argue an idea "needs this chain" if you don't know what the chain does that others can't. If no domain material exists, web-search the platform's own docs/marketing for its stated differentiator.

### 2. Research what's trendy *right now* (web)
Search for real, shipping products and hot categories in the relevant space, plus recent launches, funding, and partnerships (this year). Why trends matter: you're almost never the first to want a good idea, so a live trend is *proof of real demand* and a signal the thing is adoptable — judges feel that pull too. Caveat to hold in mind: trendy ≠ automatically buildable in a weekend or a clean fit for the platform. Use the trend as a strong signal, not a mandate; sometimes the right idea is adjacent to the trend rather than the trend itself.

### 3. Research what already won — this hackathon *and* comparable ones
Find past winners of this hackathon and of similar (e.g. same-category or same-tech) hackathons. Two payoffs: you learn the *shape* of what wins, and you avoid **red-flag repeats** — pitching a near-clone of something that already won reads as lazy and gets penalized. If a category already won, either avoid it or find a genuinely differentiated angle and say so explicitly.

### 4. Anchor every idea to a real product
State each idea as **"It's like [a real, named product everyone knows], but [the platform's superpower]."** (e.g. "like Carta, but ownership is private"; "like Kickstarter, but backers stay private and funds release atomically".) This single move is what kills abstraction — the complaint that ideas "feel like demos, not things people build." If you can't name the real-world anchor, the idea is probably too abstract; keep digging.

### 5. Run the feasibility gate (this is where most ideas die — kill them early)
Ask: **does this depend on real-world infrastructure or enforcement that doesn't exist on-platform?** The canonical trap: invoice financing — "post your unpaid invoice and get funded" quietly assumes a real-world mechanism for the debtor to actually pay it back, which the hackathon can't provide. Such ideas can't be tried, can't be a real product in 3 minutes, and aren't feasible. **Prefer self-contained flows** where the money/asset/action actually lives on the platform, so the loop closes inside the demo (payroll works because the employer funds a pot and pays out — nothing waits on the outside world). Note honestly where a real test token or stand-in stands in for a real-world asset; that's fine for a hackathon, but say so.

### 6. Keep it plain-English
Define every domain or finance term in one sentence with an everyday example (judges may be non-technical, and clarity is itself a scored quality). No undefined jargon.

---

## Mode A — Discover (produce a ranked menu)

When the user has no idea yet. After the process above, output a **ranked menu of 6–10 candidates**, ranked by the win formula × real-world demand × originality × build feasibility. For each:

- **Plain-English name**
- **It's like ___** — the real-product anchor
- **The problem** — in everyday terms, why someone cares
- **Why it needs this platform** — in plain words: what specifically breaks if it ran on a generic alternative
- **The 30-second try** — exactly what a judge clicks and the payoff/"wow" moment they see
- **Who actually uses it** — the real user
- **Trend + feasibility note** — the evidence it's real and self-contained (cite what you found)
- **Build difficulty** — Low / Medium / High, one line why

End with **Top 3 and why**, judged against the formula. Then **stop and let the user browse** — do not proceed to specs, plans, or code. Range across the available tracks/themes; lean toward obvious real-world demand and recognizable anchors.

## Mode B — Pressure-test (sharpen one idea)

When the user brings an idea. Don't just validate it — stress it. Output:

- **One-line restatement** as "It's like ___, but ___" (if you can't, that's the first finding).
- **Score on each factor** of the win formula, honestly, with the reasoning: can a judge try it in 30s? does it *truly* need this platform or is privacy/the-superpower cosmetic? does it look like a real product?
- **Grounding** — the real products/trend that prove (or undercut) the demand, with sources.
- **Kill-risks** — the feasibility traps (esp. dependence on missing real-world infrastructure), red-flag overlap with past winners, anything that makes it un-demoable.
- **Verdict + how to sharpen** — keep / reshape / drop, and the concrete tweak (e.g. a niche or framing) that raises the score.

Be candid. A real "this won't demo" now is worth more than a polite yes.

---

## Guardrails

- **Discovery stage only.** This skill ends at a menu or a verdict. Writing specs, stories, architecture, or code is a *different, later* step the user must explicitly ask for.
- **Research, don't hallucinate.** Anchors, trends, and past winners must be real and verifiable. Cite sources. If you can't verify a claim you'd lean on, say so.
- **Don't over-produce.** The user is browsing and reacting; a tight, honest menu beats an exhaustive one. Respect their conciseness preferences.

---

## Worked example (compressed, from a real Canton session)

**Platform superpower found (step 1):** Canton = privacy by default (each deal is private to its parties) + atomic settlement (all legs happen together or none).

**An idea that got killed at the feasibility gate (step 5):** "Invoice-factoring marketplace — post unpaid invoices, financiers fund them." Dropped: getting paid back depends on real-world enforcement the hackathon can't provide. Not self-contained, not demoable as a real product.

**A red-flag repeat that got flagged (step 3):** "Private prediction market" — exactly the shape that already won the previous season, so pitching it again reads as a clone. Only viable with a sharply differentiated niche.

**The idea that survived all three filters:** **Confidential stablecoin payroll** — *"It's like Deel/Toku stablecoin payroll, but salaries are private."* (Stablecoin = a crypto coin pegged 1:1 to the dollar; payroll = the system that pays salaries on payday.)
- *Needs this platform:* salary is the most sensitive number in a company; on a public chain paying salaries broadcasts everyone's pay forever. Competitors literally hide salaries today using heavy Fully Homomorphic Encryption (Toku + Inco) — Canton does it natively, so "they need FHE; we just don't show it" is a one-sentence judge-proof moat.
- *30-second try:* log in as an employee → "Salary: $5,000 — Claim" → balance goes up → you notice you can't see a coworker's number. Privacy visible in one moment.
- *Real product + trend:* Deel and Remote launched stablecoin payroll in 2026; ~35–40% business adoption projected — proven demand, not invented.
- *Feasible / self-contained:* employer funds a pot and pays out; nothing waits on the outside world (a test token stands in for real USDC, noted honestly).

That's the whole lens: load the superpower → ground in trends → dodge what won → anchor to a real product → kill the infeasible → keep what a judge can try in 30 seconds and that obviously needs the platform.
