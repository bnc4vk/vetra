# Vetra demo system contract

Contract: `vetra-demo-system/v1`

This document is the compatibility boundary for the current demo. Refactors and future integrations may change implementation details, but they must preserve the six user-visible stages below unless this contract is intentionally versioned.

## Locked journey

1. **Welcome.** Progressive welcome copy, with no trip data requested. Pointer or keyboard input may accelerate the reveal; reduced-motion preferences may skip it.
2. **Trip request.** Progressive planning cue followed by the trip composer. Submission enters itinerary interpretation.
3. **Itinerary construction.** Flight legs are revealed progressively, unresolved required details are asked one at a time, and the user gets a repeatable final-check loop for route, date/timing, and cabin changes. “Looks good” is unavailable while the current itinerary validator reports a blocking issue.
4. **Rewards selection.** Twelve ordered program tiles are followed by AwardWallet and Missing program actions. Additional programs are searchable and promoted into an available displayed slot after linking. User-provided balance entry, simulated credential and Google connection flows (including a branded navigation cue), mocked balance plus tier/card-product details, an AwardWallet connector that syncs Amex, Citi, Alaska, JetBlue, and Southwest, disconnection, and a zero-program path are all supported. Settled tiles remain continuously visible through every connection-state transition, and search pagination exposes twenty more programs only after a one-second loading cue.
5. **Optimization.** Four staged progress cues and an animated globe are shown without user input. Fully resolved locations use the geographic itinerary; any unresolved location fails closed to the ambient globe.
6. **Results.** Three ranked demo itineraries expose totals, segment economics, carriers, times, cabin, point value, score, and expandable pros/cons. “Plan another trip” returns directly to the trip composer with transient trip and rewards state cleared.

The application is a single React page whose phases are state transitions, not URL routes. The root element exposes `data-system-contract` and `data-phase` as stable regression-test hooks.

## Replaceable service boundaries

The current implementations are assembled in `src/systemServices.js`. They are deliberately separate even though all three are synchronous demo adapters today.

### Rewards service

Current adapter: `demo-rewards/v1`.

Owns the program catalog and selection-to-balance resolution. A future AwardWallet-style adapter should produce normalized program records with stable IDs, display metadata, balance, connection status, and freshness/provenance. UI authentication must be delegated to the provider; Vetra must not retain provider credentials.

### Award-search service

Current adapter: `demo-award-search/v1`.

Owns production of bookable award options for the finalized trip. It delegates each confirmed leg to the isolated `demo-leg-pricing/v1` adapter, which currently creates a stable pseudo-random quote shaped by route distance, cabin, timing, and candidate strategy. Every leg is quoted; unknown locations use a deterministic fallback distance. A future Seats.aero-style adapter should return normalized segments, dates/times, airports, cabins, carriers, points, fees, cash comparators, availability freshness, and booking provenance. Search failures must remain distinguishable from “no availability.”

### Reasoning service

Current adapter: `demo-reasoning/v1`.

Owns constraint filtering, funding feasibility, trade-off analysis, ranking, and rationale. It consumes the finalized trip, normalized rewards balances, and normalized award-search output. It should not own provider authentication or raw provider transport. Future reasoning must make hard constraints, assumptions, transfer math, and confidence inspectable.

`systemServices.recommend()` is the current composition seam. Entering step 5 snapshots the finalized itinerary and linked reward IDs, runs award search and reasoning, and stores the resulting candidates. Step 6 only presents that stored output; it does not regenerate it. Every displayed funding program must belong to the linked set. With no linked programs, every candidate and leg becomes cash-only. Real implementations should preserve that orchestration shape while making provider calls asynchronous.

## Current demo boundaries

- Rewards balances, account status/card-product details, AwardWallet sync, and connection success are simulated and held only in React state. Credentials are never persisted; user-provided balances are scoped to the current journey and remain visually distinct from provider-confirmed data.
- Award candidates use modeled schedules and distance-aware placeholder economics; they are not live availability.
- Linked program identity constrains candidate funding references, but placeholder balances do not yet alter feasibility or ranking.
- GPT structures the initial brief and free-form adjustments; it does not search availability.
- Unknown globe locations switch the whole visualization to ambient mode.
- Itinerary validation blocks unresolved broad locations, reversed dates, and duplicate IDs. It intentionally permits geographic gaps and unspecified dates/cabins.
- No booking or transfer is executed.

## Regression contract

Static smoke tests cover itinerary mutation, candidate continuity/ranking, globe resolution, safety, and service composition. The in-app-browser suite in `scripts/in-app-browser-regression.mjs` is the acceptance authority for the complete journey.

It drives five deterministic trip plans through the real local UI using DOM-backed clicks, typing, and key presses. The local-only fixture mode is enabled by `npm run test:browser:server`; it is disabled in production and deliberately refuses briefs or adjustments outside the five fixtures.

The five journeys cover:

- required city follow-up and zero linked programs;
- cabin adjustment and a featured rewards connection;
- date adjustment and multiple rewards connections;
- inserting and retaining a fourth leg plus searchable-program connection;
- rewards disconnection/reconnection and unknown-location ambient-globe fallback.

Run the server, then execute `runInAppBrowserRegression({ browser: iab })` from the Codex in-app-browser runtime. A pass requires all five journeys, all six stages, all three result expansions, and zero browser console warnings or errors.
