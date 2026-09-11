# AGENT.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

**Current state (2026-09-11): V2 is implemented and running in Docker locally.** The V2 image was
rebuilt, the container was recreated with the existing `leaddata` volume, migration `003_v2.sql`
applied successfully, and `/api/health` returned HTTP 200. Do not remove the volume during
updates. The default local endpoint is `127.0.0.1:9081`; the nightly cron remains disabled unless
`CRON_ENABLED=true` is set.

V2 includes CSV customer import with preview and idempotent storage, customer exclusion before
paid qualification, name/address duplicate hints, CSV export, company details with sources,
evidence and manufacturer relationships, map clustering, priority/status filters, navigation
links, and per-company sales feedback. The scoring rules remain unchanged because the user
confirmed that practical sales experience is not available yet. Feedback values are `good_fit`,
`poor_fit`, and `uncertain`, with a free-text reason for later calibration.

Verification after V2: `npm test` passes 66 tests across 10 files, `npm run typecheck` passes for
server and client, `npm run build` passes, and the browser upload flow was tested against an
isolated database: two valid customer rows imported, one lead matched, one malformed row skipped,
and a repeat import added zero duplicates. The production database was not used for that test.

Read `docs/v2.md` before changing import, export, duplicate matching, detail view, map, or
feedback behavior. `README.md` contains the user-facing setup and Docker instructions.

Vertical slice implemented (2026-09-07): Node.js/TypeScript, DB schema + migrations, deterministic
scoring engine, Perplexity Agent API client (finder + Stufe-2 calls), Nominatim geocoding,
HTTP-check, run orchestrator, REST API, minimal PWA frontend (field list + research view).
**Acceptance test cleared (2026-09-08)**: the user reviewed run #8's 30 leads and accepted them
("Die Liste ist perfekt"), so spec §7's governance gate is open. The v1 scope is complete and V2
is implemented and locally deployed in Docker. Deployment to the user's IONOS server remains an
external handoff; it has not been performed from this workspace.

**Login requires setup before the server will start.** `assertAuthConfigured()` throws on boot if
`AUTH_PASSWORD_HASH` or `SESSION_SECRET` is missing from `.env` — deliberately, so a
misconfiguration surfaces at startup rather than as a login that rejects everyone. Generate both
with `npm run hash-password` (prompts twice, hidden input, prints the two `.env` lines). The
plaintext password is never stored or logged.

**Pick up here.** 8 live runs against area "21", ~€1.52 of real API budget spent.

| Run | Change under test | In-area rate |
|-----|-------------------|--------------|
| 1 | Baseline: PLZ-prefix text as the only geo signal | 0% |
| 2 | Real place names (`data/plz-area-places.json`) + hard geofilter (Q4) | 41% |
| 3–4 | Lat/lon coordinate radius framing | 13–14% (reverted) |
| 5 | `preset: "pro-search"` — an alias for `"low"`, so not a real A/B test | 7% |
| 6 | Explicit `tools: [{"type":"web_search"}]` + merged `instructions` into `input` | 15% |
| 7 | Stage-2 geo context (`buildStage2Instructions`) | 27% |
| 8 | **Geofilter switched from PLZ-prefix to radius** | **30 of 31**, 0 rejected |

**The key finding (run #7) — the metric was wrong, not the prompt.** Run #7's per-rejection log
showed all 19 rejected companies sitting in Hamburg: 22769, 20457, 22045, 20097 (the same postcode
as Xortec's own office), 20539, 22085 … Measured against the Xortec office they were **all within
40 km, most under 10 km, two at 0.0 km**. They were rejected purely because their postcode starts
with 20 or 22 instead of 21 — and Hamburg spans all three prefixes, so prefix "21" covers
Harburg + Lüneburg/Stade while excluding the entire Hamburg core, which is where the Facherrichter
actually are. The rejected set closely matched the list the user had validated by hand in the
Playground (SHUR, MEBO, Kötter, CD Büttner, Kaliga, VideoProjects-ASS, Deltron, Wahl Elektrotechnik).

So the pipeline had been producing good results for several runs; the hard geofilter was throwing
them away, and the "in-area hit rate" I was optimizing counted correct results as failures. Six
runs of prompt tuning chased a filter bug. **Lesson for the next puzzling metric: log what gets
rejected and check the rejects before tuning the thing that produced them.**

The filter now uses distance from the area centroid (`checkAreaRadius()` in
`research/geofilter.ts`, radius from `RESEARCH_RADIUS_KM`, default 40 km), which is also what the
finder prompt has always claimed ("ca. 40 km um Hamburg") — prompt and filter now share the same
config value so they cannot drift apart. `tests/geofilter.test.ts` pins the Hamburg 20/21/22 case
as a regression test.

Run #8 produced 30 usable leads out of 31 candidates (€0.23): all Hamburg-metro, 29 of 30 with a
phone number, none below the Fachlichkeit-35 cutoff, and — unlike earlier runs — no directory or
trade-association pages (IHK, wer-zu-wem, BHE), which the finder prompt's exclusion list now
catches. One lead came back `unverified` (no address), correctly hidden from the field view by the
scoring rules rather than by a filter.

**Next**: the user judges that list on company *relevance* — spec §7's actual bar is his market
knowledge, not postcode arithmetic, and that judgment has not been collected yet.
`data/livetest7.db` and `data/livetest8.db` are deliberately kept for it — do not delete them
without asking. Live runs cost ~€0.10–0.25 each; **confirm with the user before each one** unless
they have named a budget.

**Known data-quality bug, not yet fixed**: run #8 contains MEBO twice — once as `mebo.de`, once as
`ppalarm.de` (a domain that most likely belongs to P+P Alarm-Sicherheits-Systeme Pfähler, which
appeared as its own candidate in run #7). Stage 2 paired one company's name with another's domain,
so the domain-based dedup could not catch it. Same failure class as the earlier
bhe.de/asb-security.de mixup, which was only half-fixed by preferring Stage 2's own `website`
field: that helps when the *finder* supplies a directory URL, but not when Stage 2 itself
misattributes. Worth a name-similarity check against existing rows before insert.

## Required reading before implementing

`README.md` is the human-facing counterpart to this file: what the app does, setup, dev workflow,
deployment, running costs. Keep operational instructions there and agent guidance here — don't
duplicate the tuning history or the "Pick up here" section into the README.

Both files below are in German and are binding, not background material:

- **`docs/spezifikation.md`** — the binding result of a "Grill-Me" requirements interview
  (2026-09-07). Read it in full before implementing anything; the summary below is a navigation
  aid, not a replacement.
- **`docs/Agent_api_hinweise.md`** — the verified Agent API contract, distilled from the official
  Perplexity skill `migrate-sonar-to-agent-api`. **Read it before touching
  `perplexity.client.ts` or any prompt-building function.** It covers the exact `response_format`
  shape, strict mode (any unknown field → 400), that web search is not automatic
  (`tools` / `tool_choice`), where citations actually live (`search_results` item inside
  `output[]`), and that failed runs arrive as HTTP 200 with `status: "failed"`. Do not implement
  Agent API calls from memory or by OpenAI convention — the deviations documented there are
  exactly the ones that fail silently or return ungrounded answers.

## Commands

```bash
npm install                # install dependencies
cp .env.example .env       # fill in PERPLEXITY_API_KEY and NOMINATIM_CONTACT_EMAIL before running research/geocoding
npm run dev                # server with reload (tsx watch), serves API on :3000
npx vite                   # frontend dev server (separate terminal), proxies /api to :3000 — see vite.config.ts
npm test                   # vitest run (unit tests only — scoring, dedupe, geo, size-heuristics)
npm run typecheck          # tsc for both src/server (tsconfig.json) and src/client (tsconfig.client.json)
npm run hash-password      # generate AUTH_PASSWORD_HASH + SESSION_SECRET for .env (hidden prompt)
npm run migrate            # apply pending SQL migrations in src/server/db/migrations/ (also runs automatically on server start)
npm run build               # build:server (tsc + copy migrations into dist/) then build:client (vite build)
node dist/server/index.js  # run the production build — serves the built frontend from dist/client if present
docker compose up -d --build   # production: see Deployment section for the volume/proxy caveats
```

Run a single test file: `npx vitest run tests/scoring.test.ts`. Vitest has its own `vitest.config.ts`
(root `.`) separate from `vite.config.ts` (root `src/client`) — do not merge them, or test discovery
breaks silently (this already happened once: `vite.config.ts` sets `root: "src/client"`, which
Vitest inherited and then found no tests).

**What the test suite does and does not cover**: the 66 tests cover pure functions (`scoring`,
`dedupe`, `geo`, `size-heuristics`, `plz-centroid`, `geofilter`, `password`) plus the cron's area
rotation against an in-memory DB (`area-schedule`). There are **no** tests for
`run-orchestrator.ts`, `perplexity.client.ts`, the API routes, or the repos — a green `npm test`
says nothing about whether the research pipeline works end to end.

A trap when writing DB-touching tests: importing `node:sqlite` statically makes Vitest fail with
`Failed to load url sqlite` — Vite does not recognise that builtin and tries to resolve a package
named "sqlite". Load it via `createRequire(import.meta.url)` at runtime instead, as
`tests/area-schedule.test.ts` does. Configuring `server.deps.external` does *not* fix it. The only verification
for that path so far has been live runs against the real paid API, which is why the tuning history
above is expressed in run numbers rather than test cases. When a bug turns out to live in pipeline
logic, extract the decision into a pure function and pin it with a test (that is how
`geofilter.ts` came about after run #7) rather than leaving it inline and unverifiable.

`.claude/launch.json` has two configurations, because the app is two processes in development:
`api` (`npm run dev`, port 3000) and `frontend` (`npx vite`, port 5173, proxies `/api` to 3000).
Use `frontend` to look at the UI — `api` alone only serves `dist/client` if it has been built, so
it 404s on `/` after a fresh checkout. (It previously had a single entry pointing `npm run dev` at
5173, which served nothing at all.)

**`npm run typecheck` does not cover the browser build target.** `tsconfig.client.json` targets
ES2022, while Vite bundles for chrome87/safari14 — top-level `await` in `src/client/**` type-checks
cleanly and then fails `npm run build:client`. Run the client build, not just the typecheck, after
touching client entry points.

**Runtime note**: DB access uses Node's built-in `node:sqlite` (experimental, stable from Node
22.5+), not `better-sqlite3` — the native module failed to build here for lack of Visual Studio
Build Tools. This avoids native compilation entirely (works identically in Docker), at the cost of
depending on an experimental Node API; re-evaluate if `node:sqlite` changes incompatibly upstream.
Requires Node ≥22.5 (see `package.json` `engines`) — the Docker base image must match.

## Deployment (Docker, verified 2026-09-11)

`Dockerfile` (multi-stage, `node:24-slim`, runs as the non-root `node` user) and
`docker-compose.yml`. Verified locally end to end: image builds, migrations run, login works,
`/api/health` healthcheck reports healthy, data survives recreating the container, and migration
`003_v2.sql` applies successfully.

Two non-obvious points:

- **The SQLite file must not live in `/app/data`.** That directory holds the static datasets baked
  into the image (`plz-centroids.csv`, `plz-areas.json`, `plz-area-places.json`), which the app
  reads at runtime. Mounting a volume there would hide them. The compose file therefore sets
  `DATABASE_PATH=/app/var/app.db` and mounts the volume on `/app/var`. Keep those two in sync.
- **A manual research run can take 20–30 minutes** (up to ~40 sequential Agent API calls; Fastify's
  `connectionTimeout` is set to 30 min for exactly this). Behind a reverse proxy this will fail
  long before that — nginx defaults `proxy_read_timeout` to 60 s. Either raise the proxy timeout to
  match, or do the async-job refactor noted in `index.ts` (return the `runId` immediately, poll for
  status), which is the proper fix. The nightly cron is unaffected: it runs in-process, with no
  proxy in the path.

The container binds to `127.0.0.1:3000` only — TLS, the subdomain and the certificate belong to the
reverse proxy in front of it, so the API key never sits on an open port (spec Q8).

## What this app is

A single-user (one Vertriebsmitarbeiter, Gebiet HH/NI/HB/NRW) tool that shows, in the field on
tablet/phone, which Facherrichter (specialist installers) for Videoüberwachung/Sicherheitstechnik
nearby are not yet Xortec customers — with traceable evidence for why each is on the list.
Success metric is **precision over completeness**: ~20 callable leads per Gebiet is the bar, not
exhaustive market coverage.

## Architecture: three decoupled layers

The expensive research and the fast field UI are deliberately decoupled — do not blur this
boundary when implementing.

1. **Recherche** (rare, costs money, fills the DB) — nightly cron (2 PLZ areas/night) + manual
   button. **Deviates from spec §2's original two-API design** (Search API + per-company Agent
   calls) based on live-test evidence from 2026-09-07 (see Known open risks below): Stufe 1 is now
   a single **Agent API "finder" call** (`findCandidates()`) returning a short candidate list
   (name/website/reason, `finder-schema.ts`), followed by Stufe 2 = **one Agent API call per
   candidate** (`/v1/agent`, not the deprecated Sonar endpoint — Q6) returning full facts/evidence
   per the fixed JSON schema in spec §6. Candidates are deduped against the DB by **domain** before
   any Stufe-2 call — an already-qualified company is never re-paid for. Hard cap: 40 new
   candidates per run, configurable, with a running cost display in the UI. Both calls use
   `preset: "low"` (the canonical name; set in `config.ts`). Canonical presets are
   `fast | low | medium | high | xhigh`. **`"pro-search"` is a legacy alias for the same preset,
   not a stronger tier** — it appears in Perplexity's Playground sample code, which is how it got
   into this project in the first place. Runs #5 and #6 that looked like a preset A/B test were
   therefore comparing `"low"` against itself; no stronger tier has ever actually been tried here.
2. **Anreicherung** (automatic, free) — geocode every address via public Nominatim, throttled to
   **1 request/15s** with permanent caching (OSMF usage policy: 4 req/min for scripted use, caching
   mandatory), falling back to a PLZ-centroid offline dataset (±5km) when unresolvable. HTTP-check
   every URL in `sources` (this is what catches fabricated links). Compute the three scores (§5).
3. **Feldnutzung** (frequent, free, fast) — pure DB reads, no API calls, must work on poor network.
   Browser geolocation + selectable radius. If the radius search finds nothing, the app offers to
   trigger a Recherche run **with visible duration/cost warning** — this warning text is a hard
   requirement (spec §2), not optional UX polish.

**Consequence that must appear as UI text**: the DB must run ahead of the salesperson's location.
An area never researched by the cron is empty during the day. This caveat belongs visibly in the
Recherche view.

## Code layout (maps to the three architecture layers above)

- `src/server/research/` — Ebene 1. `perplexity.client.ts` is the single encapsulated access point
  to the API (Q6), exposing `findCandidates()` (finder call) and `qualifyCompany()` (Stufe 2) built
  on a shared `callAgent()` helper; `searchCandidates()` (the old Search-API-based Stufe 1) is kept
  but unused — see Known open risks before reviving it. `finder-schema.ts` and `stage2-schema.ts`
  each hold a JSON Schema plus matching Zod schema for runtime validation — edit both halves of a
  pair together, never just one. `run-orchestrator.ts` ties finder call → domain dedupe
  (`dedupe.ts`) → Stufe 2 qualification → hard geofilter (`geofilter.ts`, radius around the area
  centroid — read its header before changing the geometry) → enrichment → persistence, enforcing
  the candidate cap and `RESEARCH_MAX_COST_EUR` budget cap. `buildFinderInstructions()` in the same file
  builds the finder prompt from `data/plz-area-places.json` (real place names per PLZ-prefix,
  generated by `scripts/build-plz-area-places.mjs` — deliberately no raw lat/lon in the prompt, see
  Known open risks).
- `src/server/enrichment/` — Ebene 2. `scoring.ts` is pure/deterministic and the most heavily
  tested file in the repo (`tests/scoring.test.ts`) — every point value maps 1:1 to spec §5.
  `nominatim.client.ts` throttles all callers through one module-level queue (1 req/15s) and reads
  through `db/geocode-cache.repo.ts` before ever hitting the network. `plz-centroid.ts` is the
  offline fallback, backed by `data/plz-centroids.csv` (10.813 rows, aggregated from GeoNames'
  German postal code export — CC BY 4.0, see `data/plz-centroids.SOURCE.md`).
- `src/server/api/routes/` + `src/client/` — Ebene 3. `companies.ts` route branches on
  presence of `lat`/`lon`: with coordinates it's the field view (radius filter + distance sort via
  `util/geo.ts` Haversine, no external calls); without, it's the desk view (Fachlichkeit × Potenzial
  sort). `src/client/views/research.ts` carries the mandatory visible cost/duration warning text —
  don't remove it, it's a hard spec requirement (§2), not decoration.
- `src/server/db/*.repo.ts` — one repo module per table, plain functions over `node:sqlite`
  prepared statements, JSON-serialized array columns (`services`, `sources` etc. — see `db/types.ts`
  for the row shapes and `api/serialize.ts` for the JSON-parsed API-facing shape).
- `src/server/cron.ts` + `research/area-schedule.ts` — nightly research (spec Q13). **Off by
  default** (`CRON_ENABLED`), because every run spends real money and a cron left running on a dev
  machine only shows up on the invoice. Which areas run next is *derived from the `runs` table*
  (least-recently-researched first, never-researched before that) rather than stored as a cursor —
  no extra schema, survives restarts, and a manual run pushes its area to the back of the queue by
  itself. The area list is `data/plz-areas.json` (29 prefixes covering HH/NI/HB/NRW, generated by
  `scripts/build-plz-areas.mjs`, hand-reorderable). Its order is sorted by postcode count as a rough
  urban-before-rural proxy — spec §8.3 asks for "Betriebsdichte", which is not in the GeoNames data,
  so this is explicitly a placeholder for the user's market knowledge. Note when regenerating: a
  handful of GeoNames rows carry a wrong Bundesland (company-specific bulk postcodes like
  "norisbank GmbH"), which is why the script requires ≥25 % of a prefix's postcodes to be in the
  territory — without that threshold, Berlin, Leipzig, Frankfurt and Munich end up in the list.
- `src/server/auth/` — single-user login (spec Q3/§7). `password.ts` hashes with scrypt from
  `node:crypto` (no extra dependency); `session.ts` issues a **stateless** signed cookie whose value
  is the issue timestamp, so sessions survive restarts without a session store. The guard is one
  `onRequest` hook in `index.ts`: everything under `/api/` is protected except `/api/health` and the
  three `/api/auth/*` routes. Static frontend files stay public on purpose — the data behind the API
  is what needs protecting, not the empty app shell. Login has an in-memory lockout (5 attempts →
  15 min), which resets on restart; acceptable for one user on one process.

## Non-negotiable decisions (spec §3 — do not re-litigate without the user)

- Scoring/prioritization is computed **in the app**, never by the LLM. The Stage-2 JSON schema
  (§6) intentionally excludes `lead_score`, `lead_priority`, `fit_for_xortec`,
  `verification_status` — two sources of truth is the failure mode being avoided.
  `manufacturer_mentions` is displayed as a signal but never scored.
- `evidence`/`sources` arrays may be empty (no `minItems` requirement) — forcing an LLM to always
  cite a source produces fabricated citations. The app, not the schema, decides what to do with
  weak evidence (mark `unverified`, hide in field view).
- No personal contact data — company data and role-based contacts only. **No email button in the
  UI** (Q20).
- CSV import, customer-list matching, map view, export, company details, clustering and navigation
  are implemented in V2. Salesforce integration remains out of scope.
- API key stays server-side; daily rate limit enforced in code (Q8).
- **Superseded with the user's explicit approval (2026-09-08)**: spec Q7 defines the Gebietseinheit
  as a two-digit PLZ prefix, and the hard geofilter (Q4) used to compare prefixes. It now compares
  **distance to the area centroid** instead. Q4's "harter Geofilter" still holds — only the geometry
  changed. Evidence is in the run #7 finding above; do not "restore" prefix matching to bring the
  code back in line with Q7's wording. `areaCode` remains the prefix as the *input* unit (that part
  of Q7 is unchanged); it just names the centre of a radius now rather than defining the boundary.

## Data model (SQLite, spec §4)

Four tables: `companies` (keyed by normalized `domain`, unique — this is the dedup key across
Stage 1 candidate collection), `sources`, `evidence` (both N:1 to a company), `runs` (research run
log: cost, trigger, candidate counts). Read spec §4 for exact columns before writing migrations.

## Scoring (spec §5 — deterministic, implement exactly as specified)

Three independent 0–100 scores: **Fachlichkeit**, **Potenzial**, **Datenqualität** (never blended
into one number). Each has an additive point breakdown in the spec — implement it literally, do
not approximate. Key derived rules:
- `Datenqualität < 45` → `verification_status = unverified` → hidden in field view.
- `Fachlichkeit < 35` → hidden from all views, but stays in the DB.
- Priority A/B/C thresholds combine Fachlichkeit and Potenzial per spec §5 — copy the exact
  boolean logic, the two priority tiers are not symmetric.
- Sort order differs by context: field view sorts by distance; desk view sorts by
  Fachlichkeit × Potenzial.

## Stage-2 JSON schema (spec §6)

One company per Agent API call, flat schema, no scoring fields, no forced evidence. Spec §6 lists
8 explicit changes from an earlier draft and *why* each was made (e.g. why `sources`/`evidence`
lost their `minItems: 1`, why `manufacturer_mentions` became an object with a `relationship`
enum). Read those rationale notes before modifying the schema — each one encodes a specific
failure mode that was already hit.

## Known open risks (spec §8 — check before assuming these are resolved)

- ~~`tool_choice` untested against strict mode~~ — **resolved 2026-09-08**. A single ~$0.004
  validation call confirmed the API accepts `preset` + `input` + `tools` + `tool_choice` +
  `response_format` together: HTTP 200, `status: "completed"`, one `search_results` item, schema
  honoured. `callAgent()` also now throws on `status !== "completed"` instead of persisting a failed
  run. Useful pattern for any future request-shape change under strict mode: a minimal call costs
  well under a cent, and the *failure* case costs nothing because validation precedes execution —
  always smoke-test the body before spending a full run on it.
- Failed Stufe-2 calls are caught per candidate in `run-orchestrator.ts` and skip that candidate.
  A failed **finder** call is not caught — it propagates and 500s the route, leaving the already
  created `runs` row at all zeros, which looks identical to a legitimately empty area. Low priority
  while tuning, but worth knowing before trusting the `runs` table as a complete cost log.
- Agent API request/response shape is otherwise confirmed against live calls (6 runs,
  2026-09-07/08, real `PERPLEXITY_API_KEY`): `response_format`/`json_schema` works exactly as
  spec §6 assumed, which retires spec §8's original #1 risk.
- **Architecture note**: the user's own validated Playground example did NOT use `response_format`
  at all — the model free-formed a JSON structure from prompt instructions alone (different field
  names than our schema), and it was a *single* call that both found companies and returned full
  per-company detail — no separate finder/Stufe-2 split. If the Stage-2-geo-context fix (see top of
  file) doesn't get hit rate back to ~40%+, the next thing to question with the user is whether the
  two-call split is the right design at all, vs. one larger call per area returning several
  companies with full detail directly (would mean reintroducing a wrapper array in the JSON schema,
  which spec §6 explicitly rejected — a real tradeoff to discuss, not a unilateral call to make).
- Cost note: at `"low"` (= the legacy alias `"pro-search"`), each Stage-2 call with
  `tools: web_search` costs roughly
  $0.005–0.01 (mostly the `tool_calls_cost.search_web` fee, not tokens). Watch
  `RESEARCH_MAX_COST_EUR` behavior on a full 40-candidate run — untested at that scale, only up to
  ~34 candidates so far.
- Do not pass raw lat/lon coordinates in prompts expecting radius reasoning — tested and performed
  worse than naming real places (`data/plz-area-places.json`). Address-level or city-level place
  names work; decimal coordinates apparently don't ground the model well.
- PLZ-Gebietsliste for HH/NI/HB/NRW with cron ordering did not exist yet at spec time, and still
  doesn't — cron trigger itself isn't built yet either.
- Acceptance test (spec §7): a run over a PLZ area the user (Remo) knows personally (21 or 22),
  checked against his own market knowledge. **Below 50% useful hit rate means the prompt is
  broken, not the app** — the fix is prompt work, not new features, until that bar is cleared.
  **Not yet cleared** — best run so far (#2, `"low"` preset + place-name hints + hard geofilter)
  hit 41% in-area, still below the 50% bar, and geographic hit rate alone isn't the full criterion
  anyway (spec's bar is the user's own market-knowledge judgment on company relevance, which hasn't
  been collected yet — the `livetest*.db` files from 2026-09-07 were cleaned up at end of session,
  so a fresh run is needed to produce reviewable data). Per spec's own governance rule, do not add
  cron/login/Docker work before this is cleared.
