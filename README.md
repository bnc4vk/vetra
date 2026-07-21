# Vetra

Preliminary flight-award optimization experience for an experienced US points traveler.

## Run locally

```sh
npm install
npm run dev
```

Before enabling a real credential, run the fail-closed regression suite:

```sh
npm run build
npm run test:safety
```

The scripted demo remains available when GPT is locked or unavailable.

## Complimentary-only GPT setup

Vetra pins trip-brief parsing to `gpt-5.4-2026-03-05` and does not send tools in the
request. The server fails closed: adding an API key alone does not enable API calls.

1. Rotate any API key that has been shared in chat or another exposed location.
2. In the OpenAI Platform data controls for the same organization and project, enable
   input/output sharing and verify that the page explicitly says the project is enrolled
   for complimentary daily tokens.
3. Confirm the account has the positive balance required by the offer and that the shared
   daily quota has not been consumed by another eligible model or project.
4. Copy `.env.example` to `.env.local`, add the rotated project key, and set
   the matching `OPENAI_PROJECT_ID`, then set
   `OPENAI_COMPLIMENTARY_TOKENS_CONFIRMED=true`.
5. Set `OPENAI_COMPLIMENTARY_DAILY_TOKEN_LIMIT` to the threshold shown for the account's
   usage tier and `OPENAI_COMPLIMENTARY_TOKENS_USED_AT_START` to today's combined usage
   in the eligible model group immediately before testing.

OpenAI does not provide an API preflight that guarantees an individual request will be
free. The confirmation switch prevents accidental activation, but the Platform settings
and Usage dashboard remain the source of truth for enrollment and remaining quota. If a
request would cross the daily complimentary-token limit, OpenAI documents that the whole
request is billed. Leave the switch set to `false` whenever enrollment or quota is
uncertain.

Vetra maintains a UTC-daily local ledger in `.vetra/openai-usage.json`, reserves a
conservative worst-case amount before each request, and rejects requests that could exceed
90% of the configured complimentary threshold. The dashboard baseline accounts for usage
outside Vetra; refresh it before every testing session because OpenAI does not expose a
complimentary-quota preflight API.

## Hosted preview architecture

Live surfaces:

- Public demo: <https://bnc4vk.github.io/vetra/>
- Public source: <https://github.com/bnc4vk/vetra>
- Hosted API health: <https://vetra-api-three.vercel.app/api/health>

The deployable demo keeps frontend and secret-bearing backend separate:

- The public `bnc4vk/vetra` repository builds the Vite app with
  `VITE_BASE_PATH=/vetra/` and deploys `dist/` through GitHub's native Pages artifact workflow.
- The repository variable `VETRA_API_BASE_URL` is compiled into the frontend as the public
  URL of the hosted API. No OpenAI or Redis credential is included in the browser bundle.
- Vercel runs `api/index.mjs` as a server-side function.
- Upstash Redis atomically enforces the hosted daily token budget and per-IP request limit.
- The hosted API defaults to a 100,000-token ceiling—40% of the 250,000-token daily offer—so
  150,000 tokens remain as headroom for other eligible organization usage.
- A failed or ambiguous OpenAI request keeps its full reservation in the hosted ledger.

The source and Pages workflow now live in this single repository. Vercel deployment is
managed by the same GitHub Actions release workflow as Pages. Pull requests must pass the production
build and all regression suites. After a merge to `main`, the workflow deploys the API first, checks
the immutable deployment and stable alias for the exact Git commit and API contract, then deploys
Pages and verifies that the public site responds successfully. Production releases are serialized so
two close merges cannot race each other.

The release workflow requires repository variables `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, and
`VETRA_API_BASE_URL`, plus a `VERCEL_TOKEN` repository secret. Prefer a project-scoped token whenever
the Vercel account permits creating one. The `Validate` check is required on `main`; direct pushes,
force pushes, branch deletion, unresolved review conversations, and merges with stale validation are
blocked by branch protection.

Required backend secrets are documented in `.env.example`. OpenAI recommends keeping API
keys out of source code and public repositories and exposing them to applications through
server-side environment variables or a secret-management service.
