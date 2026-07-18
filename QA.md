# Vetra QA evidence

Last updated: 2026-07-18 (UTC)

## Billing-safety contract

- Requested model is pinned to `gpt-5.4-2026-03-05`; `OPENAI_MODEL` cannot override it.
- The OpenAI client requires an explicit project ID and sends it with every request so traffic
  cannot silently fall into a different project.
- A credential without `OPENAI_COMPLIMENTARY_TOKENS_CONFIRMED=true` returns HTTP 412
  before the OpenAI client is called.
- Missing project credentials or project ID return HTTP 503 before the OpenAI client is called.
- The configured daily threshold is reduced to a 90% ceiling. A conservative request
  reservation is rejected locally with HTTP 429 if it could cross that ceiling.
- Actual response usage is persisted by UTC date. If usage metadata is absent, the full
  conservative reservation is recorded instead.
- The dashboard baseline must be refreshed at the beginning of each test session to account
  for eligible-model usage outside Vetra.

Automated proof:

```sh
npm run test:safety
```

This suite uses dummy credentials and exercises only local refusal paths. It never sends an
OpenAI request.

## In-app browser acceptance pass

Executed with real DOM-backed clicks and keyboard input against `http://localhost:5173`:

- Custom Chicago–London brief submitted with `Control+Enter`: safely blocked after GPT
  unavailability; no Tokyo constraints or results were substituted.
- First-time demo data reset: wallet returned to zero linked programs.
- Canonical multi-city brief submitted with `Control+Enter`: matching scripted fallback
  loaded while GPT remained intentionally locked.
- Constraint confirmation: working Edit and Confirm controls; inert tile affordances removed.
- Connection modal: explicit simulation language, no credential fields, Escape dismissal.
- Required wallet: Amex, Chase, and Aeroplan individually connected through the simulated
  authorization UI; unrelated three-program combinations cannot continue.
- Review: displayed wallet sum equals 342,800 + 186,400 + 41,250 = 570,450.
- Optimization: transitioned through the simulated analysis stages to three ranked options.
- Results: persistent prototype disclosure, year/local-time context, airport changes,
  segment-level booking currencies, funding plans, and value formulas all visible.
- Assumptions: modal opened from option one and disclosed score weights, value formula,
  transfer assumptions, cash-comparator scope, and confidence meaning; Escape dismissal worked.
- Browser console: no warnings or errors after the complete pass.

## Live GPT-5.4 acceptance pass

Executed three times through the real Vetra UI with keyboard and click interaction against
`http://localhost:5173`:

- OpenAI model: exact snapshot `gpt-5.4-2026-03-05`.
- The canonical multi-city brief was interpreted into the correct five-city route and six
  inspectable constraints; both the Tokyo arrival cutoff and required business-class outbound
  were preserved as hard constraints.
- The second run continued through the linked-balance review and reached the complete ranked
  results experience without falling back to scripted parsing.
- A non-canonical Chicago–London brief was correctly interpreted by GPT-5.4 and then stopped at
  the prototype boundary with confirmation disabled; no Tokyo results were substituted.
- Local usage ledger after all three calls: 2,035 tokens, with no pending reservations.
- The first two calls reconciled in OpenAI Usage to 1,440 tokens: 884 input + 556 output.
  The third call was still inside the dashboard's ingestion delay at the final refresh.
- Both token categories are explicitly labeled `data sharing incentive tier` in the Platform
  Usage dashboard.
- The restricted `Vetra local demo` project key shows last used July 18, 2026 and monthly spend
  of $0.00.

## Hosted parity acceptance pass

Executed through the public Pages URL with real DOM-backed clicks and keyboard input:

- Public frontend: `https://bnc4vk.github.io/vetra-pages/`.
- Server-side API: `https://vetra-api-three.vercel.app`.
- The canonical brief was submitted with `Control+Enter` and returned `6 constraints · GPT-5.4
  interpreted`; no scripted-fallback response appeared.
- The five-city route, 2026 dates, Tokyo arrival cutoff, and required business-class outbound were
  all preserved.
- Amex, Chase, and Aeroplan were connected through their simulated authorization modals; the
  review showed the expected 570,450-point total.
- Optimization reached all three ranked strategies, and option one expanded successfully.
- The hosted request used 733 tokens. The Redis-backed hosted ledger reported 97,232 tokens
  remaining under its conservative 100,000-token ceiling after accounting for the 2,035-token
  pre-test organization baseline.
- OpenAI Usage reconciled to 2,768 tokens total: 1,724 input + 1,044 output. Both categories are
  explicitly grouped as `data sharing incentive tier`.
- `Vetra hosted demo` is active, restricted, last used July 18, 2026, and shows $0.00 monthly
  spend. `Vetra local demo` is likewise restricted and shows $0.00.
- The originally exposed `My Test Key` is inactive and reduced to read-only permissions.
- Browser console: no warnings or errors after the complete hosted pass.

Deployment evidence:

- Private source repository: `bnc4vk/vetra`.
- Public artifact-only repository: `bnc4vk/vetra-pages`.
- Latest source workflow run for the hosted-quota commit: `29651965229` (successful).
- Vercel production deployment: `dpl_4xUnzFQ7o93Xd4mp6dgmp11d9ZRV`, aliased to the stable API URL.
- GitHub Pages reported its public artifact deployment as built.

## Arithmetic audit

- Option 1 funding: 41,250 Aeroplan + 126,750 Amex = 168,000 points.
  Value: `(6,840 - 312) / 168,000 × 100 = 3.89¢`.
- Option 2 funding: 75,000 Amex + 70,000 Chase = 145,000 points.
  Value: `(6,910 - 684) / 145,000 × 100 = 4.29¢`.
- Option 3 funding: 180,000 Chase = 180,000 points, within the displayed 186,400 balance.
  Value: `(6,770 - 149) / 180,000 × 100 = 3.68¢`.

## Complimentary-token verification

Verified in the authenticated Brahe Labs organization on 2026-07-18:

- Usage Tier 1.
- Eligible offer: 250,000 GPT-5.4-group tokens per UTC day.
- Vetra safe ceiling: 225,000 tokens (10% / 25,000-token buffer).
- Positive prepaid balance: $5.00; auto-recharge disabled.
- Input/output sharing is enabled only for the Default project, and Platform confirms:
  “You’re enrolled for complimentary daily tokens.”
- A new persistent project key named `Vetra local demo` was created with restricted model-request
  permissions and configured in ignored, mode-0600 `.env.local` without printing the secret.
- Organization usage baseline was 0 before testing.
- Three live requests used 2,035 tokens, or 0.90% of Vetra's 225,000-token safety ceiling, leaving
  222,965 tokens within that ceiling.
- Usage attribution and the key's $0.00 spend confirm that the reconciled tests used the complimentary
  data-sharing tier and did not consume paid credits.
- One additional public hosted request used 733 tokens, bringing the reconciled organization total
  to 2,768 tokens. The Usage dashboard attributes all 2,768 tokens to the data-sharing incentive
  tier, while both Vetra keys remain at $0.00 monthly spend.
- The hosted service uses a separate 100,000-token ceiling (40% of the 250,000-token offer) with an
  atomic shared ledger and leaves 150,000 tokens of organization-level headroom for activity outside
  the hosted demo.
