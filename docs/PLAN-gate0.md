# PLAN — Gate 0 implementation

**Playbook step.** Build (CLAUDE.md, "How we work"). This is the artifact the
owner approves before code.

**Status.** Draft 1, 2026-09-17. Implements `docs/SPEC-gate0.md` Draft 3.

**Precedence.** INTENT.md, then CLAUDE.md, then the spec, then this plan. Where
this plan and the spec disagree, the spec wins and this plan is wrong.

---

## 0. Decisions taken to unblock the build

**Superseded in part.** Sections 0 to 4 are left as written; where "Status,
2026-09-18" at the end records that the code differs, it supersedes them, and
README.md "Repository layout" supersedes §1.

Each is the owner's to overturn. Nothing here overrides an open question; it
records the working answer the code assumes until the owner settles it.

| # | Question | Working answer |
| --- | --- | --- |
| P1 | Stack (O-24) | React 19 + Vite + TypeScript + Tailwind 4, `react-router` for views. shadcn-style primitives written here, taken from upstream shadcn if needed, never from Sandpiper. Files and JSON only, no database. |
| P2 | Storage (O-19) | Direct file IO behind one module, `src/storage/`. Paths in config. No adapter contract until there is a second implementation to justify it. |
| P3 | Running TypeScript | Node 22's type stripping (`node --experimental-strip-types`), as this repo already does for the vendored helper. No `tsx`, no build step for scripts. |
| P4 | `MIN_TURNS_REPORTABLE` (O-7) | 40 turns, in config, tagged `[OURS]` with no source. A placeholder, visible in one place, not scattered. |
| P5 | `MIN_TURNS_AGREEMENT` (O-7) | 100 turns, in config, tagged `[OURS]`. Below it the agreement gate refuses rather than computing. |
| P6 | Codebook snapshot (O-5) | No snapshot in the report. The report stamps `codebook_version`, and the loader is the only thing that reads definitions, so there is exactly one definition in the repo. |
| P7 | Report source run (O-29) | Explicit per report. No silent default when a student has both runs; the report records which it used and the provenance card names it. |
| P8 | Schematic (O-21) | Deferred to the last slice. The timeline ships first; the schematic's node set is still the owner's call. |

## 1. Repository layout

```
config/
  gate0.json              thresholds, paths, demo-set registry
schema/
  transcript.schema.json  turn-level shape, Sandpiper field names (§5.1)
  run.schema.json         an annotation or LLM run (§5.3)
  report.schema.json      the report contract (§5.6)
  agreement-response.schema.json   existing, pending O-8
src/
  contract/types.ts       the TypeScript mirror of the schemas
  storage/index.ts        read/write JSON under config paths (P2)
  codebook/load.ts        compose codebook + domain; the one definition source
  agreement/kappa.ts      wrapper over vendor/sandpiper/calculateCohensKappa.ts
  agreement/gate.ts       the three states of §5.4
  generator/              simulated sessions, planted plans, noisy runs
  pipeline/               prompt, segment, aggregate, summarise
  lint/                   banned phrases and the wording check
scripts/
  validate.ts             yarn validate        (§9.1)
  lint-wording.ts         yarn lint:wording    (§9.2)
  generate-demo.ts        builds the three demo sets (§8)
  run-pipeline.ts         LLM run over a demo set or real intake
app/                      the UI (§7)
data/demo/<set-id>/       generated; gitignored
```

## 2. Slices, in order

Each slice ends with something runnable and a check that fails before it and
passes after. No slice starts before the one above it is green.

**S1. Scaffolding and contract.** `package.json` scripts, `config/gate0.json`,
`src/contract/types.ts`, `src/storage/`. The types are written from §5 by hand,
not generated, because the schemas are the contract and the types are for the
editor.
*Done when:* `yarn typecheck` passes on an empty app.

**S2. Codebook loader.** Composes `codebook.v2.json` with `domains/math.json`
when the O-4 split exists and reads 2.0.0 as it stands when it does not. Four
consumers, one loader: dropdown, prompt, annotator guide, provenance card.
Drops `requires_timestamps` codes when a session has no timestamps.
*Done when:* a check script prints the ten codes, and nine for a session
without timestamps, with `writing` absent.

**S3. Schemas and validator.** The three JSON Schemas, then `yarn validate`
implementing every rejection in §9.1 — tiling, duplicate ids, version
mismatches, the agreement-gate consistency rules, the review-field rules, and
the learner-facing-number rule.
*Done when:* one deliberately broken fixture per rule is rejected with its own
message, per §9.1's self-check.

**S4. Wording lint.** `lint/banned-phrases.json` and `yarn lint:wording` over
UI copy and generated report text, including the grammatical-subject rule.
*Done when:* copy carrying each banned phrase fails, and the repo's own UI
strings pass.

**S5. Demo data generator.** Three sets (§8): planted episode plans, generated
transcripts, and simulated annotation runs with tuned boundary and label noise
so one set lands at or above 0.61, one below, and one has no annotation run at
all.
*Done when:* `yarn generate:demo` produces three sets that `yarn validate`
accepts, and the two with annotation runs land on the intended side of the
threshold.

**S6. Agreement.** `src/agreement/kappa.ts` wraps the vendored calculator and
refuses the three degenerate inputs of §5.4; `gate.ts` returns `shown`,
`suppressed` or `unmeasured`.
*Done when:* unequal lengths, a single-code run, and a short comparison each
refuse rather than return a number, and the three states are reachable from the
three demo sets.

**S7. LLM pipeline.** Prompt built only from the composed codebook, the turns
and fixed instructions; one call per session returning structured episodes;
rejection rather than silent repair; aggregates computed in code; a separate
call writing the summary from those aggregates. Token usage recorded on the run
(README next step 4), and the codebook-plus-transcript prefix cached across
calls (next step 5), with cache hits recorded beside the token counts.
*Done when:* a demo set runs end to end against the API, every output
validates, and the run file carries its usage and cache figures.

**S8. UI.** The report (§7.1), the annotation interface (§7.2), the internal
agreement view (§7.3). Suppressed and unmeasured are first-class and visually
distinct. The synthetic label is persistent. No agreement number on any
learner-facing surface.
*Done when:* all three demo sets render their intended state, an annotation run
saved from the UI validates and can generate a report, and the wording lint
passes over every string.

## 3. How this is verified

- **Per slice**, the done criterion above, run before the slice is called done.
- **The validator self-check** (§9.1) is the spine: every contract rule has a
  fixture that must fail.
- **The agreement wrapper** is tested on its refusals first, because a silent 1
  or 0 there is the failure mode that matters (§5.4).
- **No slice is reported as passing without the command output.** Where
  something cannot be verified — anything needing the API, before a key is
  loaded — it is stated as unverified rather than assumed.

## 4. What this plan does not do

- No episode review screen. It is a later gate (docs/SPEC-review.md).
- No second domain, no Gate 1 tutor-move layer.
- No real student data. The intake path is built and tested with generated
  files.
- No database, no Docker, no deployment.
- No schematic until O-21 is settled (P8).

---

## Status, 2026-09-18

Checked against the code, not against this plan. The sections above are left
as written.

| Slice | State | Where |
| --- | --- | --- |
| S1 | Built | `package.json` scripts, `config/gate0.json`, `src/contract/types.ts`, `src/storage/`; `yarn typecheck`. |
| S2 | Built; its done criterion is out of date | `src/codebook/load.ts`, `scripts/check-codebook.ts`. The codebook is 2.2.0 with nine codes, and since 2.1.0 no code carries `requires_timestamps`, so the check prints nine codes and drops none. `domains/math.json` does not exist (O-4), so the loader reads the codebook as it stands. |
| S3 | Built | `schema/transcript.schema.json`, `run.schema.json`, `report.schema.json`; `yarn validate`, whose `--self-check` breaks the fixtures in `test/fixtures/`. |
| S4 | Built | `lint/banned-phrases.json`, `src/lint/wording.ts`, `scripts/lint-wording.ts` (with `--self-check`). |
| S5 | Built | `yarn generate:demo`, three sets under `data/demo/`. |
| S6 | Built | `src/agreement/kappa.ts` over the vendored calculator, `src/agreement/gate.ts`, `scripts/check-agreement.ts`. |
| S7 | Built | `src/pipeline/`, `yarn pipeline <set-id>`. Each run records token usage and cache reads and writes; the codebook-plus-transcript prefix is cached. |
| S8 | Built | `app/`: Tutor Annotation, Student Report, Internal Feature. The schematic was built too, ahead of P8; O-21 now has four decisions awaiting the owner. |

S7 above, and comments in `src/pipeline/client.ts` and `src/contract/types.ts`,
cite README next steps 4 and 5 (token logging and caching). Both are built and
were removed from the README's list on 2026-09-18.

**Added beyond this plan.**

- The live loop (SPEC D13 to D17). A tutor marks the five problem-solving
  codes on a session, saves, presses Generate, and gets a per-session and
  pooled kappa over six classes. The report is built from the model runs of
  the annotated sessions only. Re-annotating recomputes the kappa without
  re-running the model. Transcript upload (CSV, JSONL, JSON) and Reset demo.
  Workspace in `data/live/`, seeded by `yarn seed:live --clean`.
- The endpoint. A Vite plugin in `vite.config.ts` serves `/api/*` from
  `src/server/api.ts`; the API key is read from `.env` server-side only.
- Layer 2, which §4 of this plan excluded as the Gate 1 tutor-move layer and
  the owner brought forward on 2026-09-18: `codebook.tutor-moves.json`,
  `src/moves/`, `scripts/check-moves.ts`, its own kappa and gate, a tutor-side
  marking section, an Internal section, and one report sentence. Design in
  `docs/SPEC-layer2.md`.
- A second, per-session agreement floor (`minTurnsForSessionAgreement`, 30)
  beside the pooled one, and Layer 2's item floors. All OURS placeholders.
- Stand-in runs (`yarn build:standin`) for testing before a model had run, each
  labelled as not produced by a model; and `scripts/reassemble-out.ts`, which
  rebuilt stored reports after the move to six classes.

**What this plan never covered.**

- The model. `config/gate0.json` says its id is set here; it is not. It is
  `claude-sonnet-5`, with adaptive thinking and medium effort, set in config.
- What a second Generate does (O-31). The code replaces the session's model
  run on disk; the spec recommends appending.
- Where `unmeasured` comes from once a report covers only annotated sessions
  (O-30).
- Sampling what a tutor annotates, and recording which turns a partial run was
  shown (O-34). Built as of 2026-09-18 (`docs/SPEC-gate0.md` D18,
  `docs/DEVIATIONS.md` D-035): one whole problem drawn with a seed, a toggle
  to the whole session, and kappa over shown turns only. The second half of
  O-34, whether an empty marking is a judgement, is still open; an empty
  marking is still refused.
- Any automated check of the endpoint or the UI. The scripts check the
  contract, the lint, the agreement wrapper and Layer 2 on hand-built data;
  the site itself is checked by hand.
- Real data: the identity manifest (O-22) and consent and de-identification
  (O-23). The intake path is built; how real data may enter it is not settled.
