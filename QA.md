# Vetra QA contract

Last updated: 2026-07-22

The user-visible acceptance contract and integration boundaries live in [docs/SYSTEM_CONTRACT.md](docs/SYSTEM_CONTRACT.md). Historical acceptance notes are available in git history; this file describes only repeatable checks that match the current application.

## Automated checks

Run:

```sh
npm run build
npm run test:contract
npm run test:itinerary
npm run test:results
npm run test:globe
npm run test:safety
```

These cover the versioned system composition seam, typed itinerary mutation, candidate filtering/ranking, airport resolution and ambient fallback, and fail-closed complimentary-token protections.

## In-app-browser acceptance

Start the deterministic local server:

```sh
npm run test:browser:server
```

Then import `scripts/in-app-browser-regression.mjs` in the Codex in-app-browser runtime and run `runInAppBrowserRegression({ browser: iab })`. The runner uses a real local tab and DOM-backed clicks, typing, and key presses; it does not use a standalone browser or synthetic component harness.

A passing run completes five trips and validates:

1. Progressive welcome and planning cues, including pointer and keyboard acceleration.
2. Trip entry, progressive leg construction, and required follow-up handling.
3. The repeatable final-check loop for cabin/date changes and a retained stop insertion that produces a four-leg result.
4. Zero, one, and multiple rewards selections; featured and searched programs; connection, disconnection, and reconnection.
5. All four optimization stages, geographic globe routes, and fail-closed ambient fallback for an unknown code.
6. Three ranked results, finalized-route handoff, an isolated non-zero quote for every confirmed leg, and only linked program IDs in award funding.
7. Cash-only candidate and leg pricing when zero programs are linked, plus every expandable pros/cons rationale and restart to a cleared intake state.
8. No browser console warnings or errors.

The fixture server is enabled only when `VETRA_BROWSER_TEST_MODE=true` in non-production. It rejects unknown briefs and adjustments, preventing accidental reliance on an unconstrained mock.

## Billing-safety contract

- The model snapshot is pinned; environment variables cannot silently select a different model.
- A project ID and explicit complimentary-token confirmation are required before any OpenAI request.
- Requests reserve a conservative allowance before dispatch and fail closed at the configured ceiling.
- Actual usage is recorded by UTC date; missing usage metadata is charged at the full reservation.
- Hosted traffic uses its separate Redis-backed ceiling and per-IP request allowance.

`npm run test:safety` uses dummy credentials and local refusal paths only. It never sends an OpenAI request.
