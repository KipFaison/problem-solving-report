# problem-solving-report

A product prototype. It turns tutoring session transcripts into a learner- and
parent-facing report showing how the problem-solving process in a student's
sessions changed over time. It is meant to be read by a student and a parent
together, in about two minutes.

## What it does

It helps a student, and a parent reading beside them, see how problem solving
actually happens. Sizing a problem up, planning, trying something, checking
it, backing out and trying again: none of that survives a tutoring session.
What is left is an answer and, eventually, a grade. This project reads a
session's transcript and shows the work itself — which kinds of
problem-solving work the session moved through, in what order, for how long —
so that the process can be seen for the first time. Every step in the report
links to the turns behind it. The report describes the sessions and the work,
never the person, and draws no comparison across students (`INTENT.md`,
"The product" and "Why the report exists").

Three screens:

- **Tutor Annotation.** A tutor marks the stretches of problem-solving work in
  a session, then has the model read the same session.
- **Student Report.** What a student and a parent read together: the
  route each problem took through the kinds of work, each step linked to its
  turns.
- **Internal Feature.** The working figures a family never sees: agreement
  (Cohen's kappa) between the tutor's marking and the model's, and the gate it
  decides.

## How it was built

- React 19, Vite and TypeScript, with Tailwind CSS.
- Server-side routes in a Vite plugin: `vite.config.ts` hands `/api/*` to
  `src/server/api.ts`. The API key is read from `.env` on the server and never
  reaches the page.
- The Anthropic API: Claude, model id `claude-sonnet-5` (`config/gate0.json`).
  At runtime it segments a session into episodes, classifies Layer 2's tutor
  turns, writes the report's summary and describes its quotes. It also wrote
  the demo sessions' dialogue, once and offline (`yarn write:dialogue`, stored
  in `src/generator/dialogue/`). Counts are computed in code, never by the
  model.
- Cohen's kappa from NTO Sandpiper, vendored verbatim in `vendor/sandpiper/`
  (MIT), wrapped by a function of ours that refuses the inputs it would
  otherwise score wrongly.

The code and documentation were written with heavy generative-AI assistance
(Claude Code). The project owner directed the work, reviewed it and made every
decision, and each decision is recorded in `INTENT.md`, `docs/SPEC-gate0.md`
and `docs/DEVIATIONS.md`. Third-party material and its attributions are in
`NOTICE` and `docs/CITATIONS.md`.

## Built

14 to 18 September 2026. The earliest dated document is the Gate 0 brief of
2026-09-14, which `docs/SPEC-gate0.md` supersedes; the spec, the plan and the
deviation log carry dates up to 2026-09-18. The vendored Sandpiper files come
from an upstream commit of 2026-09-08, which is Sandpiper's work, not this
project's (`NOTICE`).

## Try it without an API key

Needs Node 22 (`.nvmrc`) and Yarn.

```sh
yarn install
yarn seed:live --clean    # the workspace, from the tracked data/demo and data/out
yarn dev                  # then open http://localhost:5173
```

All data is simulated: transcripts, starting annotations and the stored model
runs. Sessions 1 to 3 arrive with a simulated annotation and a stored model
run, and are locked. Session 4 is untouched, and is where the loop is walked.

Works without a key: annotating and saving, the sampled problem and the
whole-session toggle, agreement against the stored model runs of sessions 1
to 3, the Internal Feature view, and Reset demo.

Needs a key (`ANTHROPIC_API_KEY` in `.env`, copied from `.env.example`):
Generate, on session 4 or an uploaded session, and with it that session's own
agreement figure; Classify for Layer 2; and Build or Rebuild the report,
because its summary and quote descriptions are model calls. A clean seed
carries no built report, so without a key, Student Report shows only that none
has been built yet.

## Guided walk (3 minutes)

Steps 3 and 5 need a key.

1. In **Tutor Annotation**, open **Session 4**. It opens on one sampled
   problem; **Whole session** shows the rest.
2. Pick a code, then click the first and last turn of the stretch it covers.
   Mark each stretch of problem-solving work in the turns shown; unmarked
   turns count as not problem solving.
3. Press **Save annotation**, then **Generate model reading**. The model reads
   the same session, and its run is stored beside the annotation.
4. Open **Internal Feature**: kappa for session 4 (or the reason it is
   refused, if too few turns were shown) and pooled over the sessions with
   both runs, the gate's state, and the two tilings side by side. Only the
   turns shown to the tutor are compared.
5. Open **Student Report** and press **Build the report** (or **Rebuild the
   report**). Read it as a family would.
6. Click a numbered step on a problem's diagram to see the turns behind it.
7. Back in **Tutor Annotation**, change one stretch on session 4 and press
   **Save annotation**. **Internal Feature** recomputes the figure without
   running the model again, and Student Report lists what has changed since
   it was built.

## The analysis

The unit of analysis is the episode: a contiguous span of turns during which
the participants are doing one kind of problem-solving work. Episodes span both
speakers, because the process being coded is the collaborative one. There are
nine codes, seven content-related and two not. Five of them are the
problem-solving work itself: those are the codes a tutor marks and the only
ones the report shows. The model uses all nine to segment a session
(`docs/DEVIATIONS.md` D-026). Every definition lives in `codebook.v2.json` and
nowhere else; this file does not restate any of them.

A second, independent layer, Layer 2, looks at one tutor turn: the turn
immediately before a problem-solving episode, in the model's run, that a
student's turn opens. It gives that turn one of five codes from
`codebook.tutor-moves.json`, where their definitions live. Three,
PROMPTING_SELF_EXPLANATION, PROMPTING_SELF_CORRECTION and GIVING_ANSWER, are
taken by name from the NTO Tutor Move Taxonomy (Zhou et al., 2026); two,
OTHER_TUTOR_MOVE and NONE, are ours. The authors report Cohen's kappa for
their full scheme of twenty-eight moves: .65 in the first round and .78 in the
second, after clarifications and minor alterations. Neither figure is this
layer's, and no agreement has been established for it in this project. The
layer has its own
version, its own provenance card and its own agreement, and it is never
combined with the episode layer. Its one sentence, "…opened on the student's
turn, with no prompt in the turn before it.", may appear only where that turn
is coded NONE, and reaches the Student Report only when the layer's own pooled
kappa reaches 0.61 (`INTENT.md`, "Layer 2"; `docs/DEVIATIONS.md` D-027 to
D-031).

This is not a study. It exists to show what an online tutoring company could
ship. The measurement question — whether episode boundaries and labels can be
placed consistently enough to carry a claim — is real. What is here is the
apparatus for asking it, not an answer to it.

## What it is not

From the out-of-scope list in `INTENT.md`, in brief. The report makes no claim
about what a student knows or understands, what kind of thinker a student is,
whether a student improved, or whether the tutor is good.

Also out of scope: recommendations to students or parents, tutor evaluation or
coaching, predicting assessment outcomes, comparison or norming across
students, inferring affect or engagement, and any claim of measured reliability
or validity.

Two consequences run through every line of copy. The subject of every sentence
about the data is the session or the work, never the student. And no comparison
to other students appears, including the implicit kind — no "typical",
"average", "on track".

There is no annotator corps on this project, and no reliability has been
established for the episode layer. What ships is the apparatus for
establishing it, not the claim that it has been: an annotation interface where
a tutor marks the problem-solving work in a session, and a kappa computed
internally between one annotation run and one LLM run. That comparison is at
the turn level, over six classes: the five problem-solving codes, and one class
for everything else, which takes a turn the tutor left unmarked or one the
model gave any of its other four codes. Every turn gets exactly one class from
each run, so the two runs yield equal-length, positionally aligned label
sequences. It is computed per session and pooled over the report's sessions;
the pooled figure is the one per report that the gate acts on, and the
per-session figures gate nothing. `AGREEMENT_THRESHOLD = 0.61`, the floor of
Landis & Koch's "substantial" band, is what that computed value is compared
against, and the comparison decides whether the episode layer surfaces at all.
(The vendored `getKappaInterpretation.ts` starts that band just above 0.60,
not at 0.61; the gate uses 0.61.) Where there is no annotation run there is
nothing to compute, and the state is `unmeasured`, set by the absence of that
run (`src/agreement/gate.ts`) — a third state, rendered as itself and never as
a below-threshold result.

The computed value never reaches a learner or a parent. It lives only in the
internal, non-learner-facing view, beside the two tilings it came from and a
per-code breakdown. Computing it validates nothing: it is a number about two
label sequences, not evidence about the model and not evidence about a
student. No claim of measured reliability or validity appears anywhere in this
repo or its UI.

## Where this diverges from NTO Sandpiper

At the unit of analysis, and deliberately.

- Here, the unit is an episode: a contiguous span of turns, spanning both
  speakers.
- In Sandpiper, the unit is a single utterance, with `_id` assigned as the
  array index at ingestion.
- Sandpiper has no representation for a span, a segment, an episode or a
  boundary anywhere in its data model or schemas.

So the thing this project measures cannot be written down in Sandpiper's model
at all. This is not a gap to work around. It is where the two designs part
ways, it is upstream of every other decision here, and it is the substantive
point of the project rather than an oversight. The divergence is documented on
purpose, here and in `docs/DEVIATIONS.md`. Nothing in this repo is designed to
drop into Sandpiper later, and "droppable into Sandpiper" is not a constraint
on any decision.

Four things are still taken from Sandpiper, and only four: two designs and two
copied files.

1. **The codebook structure.** Categories, codes, examples, and a version
   stamped on every record produced under it. `codebook.v2.json` follows it in
   part: nine codes, a plain `example` on seven of them, and one
   `codebook_version`. Sandpiper's typed examples
   (HIT / NEAR_HIT / NEAR_MISS / MISS) and its designated production version
   are structure this project has not adopted yet
   (`docs/SPEC-gate0.md` §11, O-26).
2. **`getKappaInterpretation.ts`**, copied verbatim with attribution and zero
   imports, at `vendor/sandpiper/getKappaInterpretation.ts`. It implements the
   Landis & Koch bands, which is where `AGREEMENT_THRESHOLD = 0.61` comes from;
   it draws the substantial band from just above 0.60 rather than from 0.61.
3. **`calculateCohensKappa.ts`**, taken on the same terms — verbatim, with
   attribution, at `vendor/sandpiper/calculateCohensKappa.ts` — because the
   owner's instruction is that the kappa be computed with Sandpiper's own
   code. Two defects in it are recorded in `docs/LAY-OF-THE-LAND.md` §3 and are
   not inherited: it returns 1 when expected agreement is 1, so two runs that
   annotate nothing at all score a perfect 1, and it returns 0 on a length
   mismatch rather than raising. A thin wrapper, `src/agreement/kappa.ts`,
   refuses unequal-length input
   and refuses the degenerate single-code case instead of returning a number
   [OURS: vendoring the function as instructed is not the same as inheriting a
   silent wrong answer].
4. **The transcript JSON field names** (`_id`, `role`, `content`, `session_id`,
   `sequence_id`, `annotations`) as a compatibility target at the turn level
   only. Shape compatibility keeps open the option of comparing output against
   NTO's corpus later. Episodes are ours and have no Sandpiper analogue.

Not taken: its pipeline, its remaining evaluation helpers and its evaluation
report builders, its annotation functions, its human-annotation CSV plumbing,
its vote fields (`markedAs` / `votingReason`), its transcript validator and
schema, its LLM class, its storage adapters, its Mongo services, and its UI.
The annotation interface that ships in Gate 0 is this project's own; none of
Sandpiper's annotation plumbing sits behind it. The per-item reasons are in
`docs/LAY-OF-THE-LAND.md` §3(c), which was written before the correction of
2026-09-17 and still lists the kappa calculator among the things not taken.

## Repository layout

| Path | What it is |
| --- | --- |
| `INTENT.md` | Why the repo exists and what the product may claim. Wins over everything else, including the spec. |
| `CLAUDE.md` | Standing rules: the workflow, provenance tags, wording rules. |
| `README.md` | This file. |
| `codebook.v2.json` | The nine codes. Single source of truth for every episode-code definition; generates the LLM prompt (all nine), the annotation interface's code dropdown and annotator guide (the five a tutor marks), and the provenance card in Gate 0, and the review screen's buttons and help text when that gate is built. |
| `codebook.tutor-moves.json` | Layer 2's five codes and provenance card, with a version of its own, separate from the episode codebook's. Single source of truth for this layer's definitions; generates this layer's LLM prompt (`src/moves/classify.ts`). The layer's code is in `src/moves/`, and its item floors are in `config/gate0.json` under `moves` (placeholders, `docs/DEVIATIONS.md` D-031). |
| `NOTICE` | Third-party notices: what was copied, from which commit, under which licence. |
| `docs/` | `SPEC-gate0.md` (the Gate 0 spec, the current design artifact), `SPEC-layer2.md` (Layer 2's design), `PLAN-gate0.md` (the Gate 0 build plan, with its status at the end), `SPEC-review.md` (the episode review screen, recorded for a later gate and not built), `DEVIATIONS.md` (the audit trail of every extrapolation, cross-study and consequential OURS decision), `LAY-OF-THE-LAND.md` (what Sandpiper provides, with file paths), `CITATIONS.md` (the reference list for every source), `SOURCES.md` (where to obtain each, and what the briefs surveyed), `reference/` (reference material and local copies of the papers), and the bundled CC BY paper `2603.05778v1.pdf` (Zhou et al., the source of Layer 2's three named codes). |
| `schema/` | `transcript.schema.json`, `run.schema.json` and `report.schema.json`, the data contract `yarn validate` enforces; and `agreement-response.schema.json`, the student agreement response record, a draft held pending O-8 that nothing consumes. |
| `config/gate0.json` | Every threshold, the data paths and the model id. |
| `src/` | The codebook loader, the agreement wrapper and gate, the model pipeline, Layer 2 (`src/moves/`), file storage, and the local server (`src/server/`). |
| `app/` | The site: Tutor Annotation, Student Report and Internal Feature. |
| `vite.config.ts` | The dev server, and the Vite plugin that serves `/api/*` from `src/server/api.ts`. |
| `scripts/` | The commands under "Run it", and the checks. |
| `lint/`, `test/fixtures/` | The banned-phrase list the wording lint reads, and the fixtures the validator's self-check breaks on purpose. |
| `data/` | Generated demo sets, pipeline output and the live workspace. Gitignored. |
| `vendor/` | Sandpiper code copied verbatim and attributed in `NOTICE`. Two files: `getKappaInterpretation.ts` and `calculateCohensKappa.ts`. |
| `reference/` | `sandpiper`, an upstream clone kept only for reading. Gitignored; never shipped. |
| `image-1789667159848.png` | Rott et al. (2021) Fig. 5, supplied in chat as the design reference for the report's schematic. This loose copy is gitignored; the tracked copy is `docs/reference/rott-2021-fig5.png`, recorded in `.gitignore` as CC BY 4.0. See `docs/reference/rott-2021-fig5.md`. |
| `package.json`, `.nvmrc`, `.env.example` | Scripts and dependencies; the Node version; and the one environment variable, `ANTHROPIC_API_KEY`, with no value. |

## Status

Gate 0 is built, and the loop runs locally (see "Run it"). Three surfaces sit
side by side:

- **Tutor Annotation.** A tutor opens a session, marks stretches of turns with
  the five problem-solving codes from the dropdown generated from
  `codebook.v2.json`, and saves the marking as a run stamped with
  `codebook_version`. Unmarked turns count as not problem solving. A session
  that marks two or more problems opens on one whole problem, drawn as set
  under `sampling` in `config/gate0.json`; a toggle shows the whole session,
  the choice is saved with the marking, and kappa compares only the turns
  shown. Generate runs the model on that session. Transcripts can be uploaded as CSV, JSONL or
  JSON. In the live demo, sessions 1 to 3 arrive annotated and read by the
  model and are locked: no transcript, no Save, no Generate; session 4 is where
  the loop is walked, re-annotation included (SPEC D19, DEVIATIONS D-036).
- **Student Report.** Built from the model runs of the annotated sessions
  only; a session nobody has annotated is not in it.
- **Internal Feature.** Cohen's kappa over the six classes, per session and
  pooled, with the gate's state. Re-annotating a session recomputes it without
  re-running the model.

The model is Claude (`claude-sonnet-5`, set in `config/gate0.json`), called
from the server side only: a Vite plugin in `vite.config.ts` hands `/api/*`
requests to `src/server/api.ts`, and the key is read from `.env` and never
reaches the page. Each model run records its token usage and its cache reads
and writes. Reset demo returns the workspace to the state it opens in.

Layer 2 is built too. One model call per session codes the tutor turn before
each student-opened episode; a tutor can mark the same items; the layer has its
own kappa and gate, and its own section in the Internal view. On the report it
adds "This stretch of <kind> opened on the student's turn", and "with no prompt
in the turn before it" only once the layer clears 0.61. Design in
`docs/SPEC-layer2.md`.

The demo transcripts and starting annotations are simulated; every computation
on them is real. No agreement has been established for either layer, and
nothing here claims any. The episode review screen of `docs/SPEC-review.md` is
not built and belongs to a later gate.

## Run it

Prerequisites: Node 22 (`.nvmrc`), Yarn, and an Anthropic API key in `.env` as
`ANTHROPIC_API_KEY` (copy `.env.example`). `.env` is gitignored; never commit a
key.

```sh
yarn install
yarn generate:demo        # the three simulated demo sets, into data/demo/
yarn seed:live --clean    # the workspace the site opens in, into data/live/
yarn dev                  # http://localhost:5173
```

The demo transcripts' lines are written by a model once and stored in
`src/generator/dialogue/` (docs/DEVIATIONS.md D-034); `yarn generate:demo`
reads them and calls no model. A session with no stored file falls back to the
pool lines of `src/generator/dialogue.ts`, which repeat, and prints a WARNING;
a stored file written for an older plan stops the build with an error. To
write or refresh them:

```sh
yarn generate:demo --pool-lines   # only if the plan changed: refreshes the plan files
yarn write:dialogue               # one model call per session whose stored lines are missing or stale
yarn generate:demo                # rebuilds the sets with the stored lines
yarn pipeline demo-a              # and demo-b, demo-c
yarn seed:live --clean
```

`yarn write:dialogue demo-a` limits it to one set; `--force` rewrites lines that
are current.

`yarn seed:live --clean` annotates three of demo-a's four sessions with the
simulated annotation, locks those three, and leaves the fourth untouched. The
three open with model runs only if `data/out/demo-a/report.json` exists
(written by `yarn pipeline demo-a`); Generate is refused on a locked session,
so run the pipeline first. Reset demo runs the same command.

Checks:

```sh
yarn typecheck
yarn validate
node --experimental-strip-types scripts/lint-wording.ts
node --experimental-strip-types scripts/check-agreement.ts
node --experimental-strip-types scripts/check-moves.ts
```

## Attribution

NTO Sandpiper is MIT-licensed. The files taken from it, the commit they came
from, and the full licence text are in `NOTICE`.

Every source is listed in `docs/CITATIONS.md`, with its licence and what it is
used for. The codebook's own sources are also cited inside `codebook.v2.json`,
in its `source` field and in each code's `origin`. `docs/SOURCES.md` is the wider
citation list and the set of pages that may be read without asking first.

## Next steps

Required before anything is pushed. Items 2 to 11 are derived from the open
questions in `docs/SPEC-gate0.md` §11 and `docs/SPEC-layer2.md`, and from what
the build left open (`docs/PLAN-gate0.md`, "Status, 2026-09-18"). Items 1 and
12 to 16 are further directions and what running it for real would take, each
pointing to where the repo records it.

O-15, the conflict between the owner decisions and `INTENT.md`, was settled on
2026-09-17 and then settled again the same day, the other way. The outcome
that stands: the annotation interface ships in Gate 0, a kappa is computed
internally between an annotation run and an LLM run and is never shown to a
learner or a parent, and `INTENT.md` is amended to drop the sentence "There
are no human annotators on this project. No kappa will be computed." The
owner's reading of that sentence is what settled it — it meant that no claim
would be made that the model's labelling had already been validated, not that
nothing would be computed. So the repo computes a kappa, keeps it internal,
and lets it gate what surfaces, while claiming no reliability and no validity
anywhere. What remains:

1. **Map the problem-solving trajectory across sessions.** A view of how the
   route through kinds of work changes from session to session: which kinds
   of work each session moved through, in what order and for how long, laid
   out session by session. It describes the sessions and the work. It never
   says what `INTENT.md` lists as not measured, "Whether the student improved",
   and draws no comparison across students (`INTENT.md`, "What is measured,
   and what is not" and "Out of scope"). What has to hold first:
   - enough reportable sessions per student for a route across them to mean
     anything. The session gate counts turns within a session
     (`minTurnsReportable`); there is no floor yet on the number of sessions,
     and any floor set would be ours [OURS];
   - the agreement gate, per layer: a layer's trajectory surfaces only where
     that layer's own pooled kappa reaches 0.61, and layers are never combined
     (`CLAUDE.md` rules 1 and 12);
   - the tension, stated rather than smoothed over: `INTENT.md` describes the
     report as showing how problem solving "changed over time", and the same
     file rules out the claim quoted above. A change from session to session
     describes the sessions, not the person. Sessions work on different
     problems, so a different route can reflect the problem as much as
     anything else. How the view keeps the one from reading as the other is
     the owner's call.
2. **Approve or reject the `CLAUDE.md` corrections.** Proposed, not yet
   approved, and each the owner's edit:
   - References: "the ten codes". `codebook.v2.json` 2.2.0 has nine.
   - Rules 4 and 12: with no annotation run, the suppression state "comes
     from config". In the code it is `unmeasured`, set by the absence of an
     annotation run (`src/agreement/gate.ts`).
   - Rule 10: "Version 2.0.0 predates that split". The codebook is at 2.2.0,
     still unsplit.
   - Rule 5: the Gate 0 clause about hand-authored values, which Gate 0's
     generated, synthetic-labelled data no longer fits (O-35).
3. **Approve two factual corrections to `INTENT.md`.**
   - It says 0.61 is the band floor that Sandpiper's `getKappaInterpretation.ts`
     implements. That file starts the Substantial band just above 0.60
     (`kappa <= 0.6` is Moderate), not at 0.61. The gate's 0.61 is unchanged.
   - It says the episode layer has no source figure to show, naming only Li et
     al. (2025). Rott et al. (2021) report percentage agreement for their own
     coding. Whether and how it appears on the provenance card, named as
     percentage agreement and attributed to them, is the owner's call.
4. **Settle the codebook edits**, which travel together because each is a
   codebook edit and a version bump: the domain split `INTENT.md` asks for,
   domain-general fields in `codebook.v2.json` and domain-specific example and
   keywords in `domains/` (O-4; `domains/` does not exist yet); whether to
   adopt Sandpiper's typed examples and designated production version (O-26);
   the leftover word "sheet" in `note_on_editing`, which describes a CSV round
   trip this project does not have; and the two notes D17 contradicts (O-35).
5. **Give the thresholds a source, or keep them as ours** (O-7, D-031). They
   have placeholder values in `config/gate0.json`, all tagged OURS:
   `minTurnsReportable` 40, `minTurnsForAgreement` 100 pooled and
   `minTurnsForSessionAgreement` 30 per session, and Layer 2's item floors,
   15 pooled and 4 per session.
6. **Make sampling more specific.** Done: sampling is built as of 2026-09-18
   (`docs/SPEC-gate0.md` D18, `docs/DEVIATIONS.md` D-035): a tutor is shown
   one whole problem drawn with a seed, a toggle shows the whole session, and
   kappa compares only the turns shown. What is left:
   - smaller units, such as a window inside a long problem;
   - problem markers for uploaded transcripts, which are shown whole today;
   - whether Layer 2 items should be limited to the shown turns (today they
     are not);
   - whether an empty marking is a judgement (O-34, second half). An empty
     marking is still refused.
7. **Layer 2 needs a tutor to mark its items before it can surface.** With no
   tutor marks there is nothing to compare, so the layer stays `unmeasured` and
   the report carries only "This stretch of <kind> opened on the student's
   turn". Also open: its item floors are placeholders (D-031), and the owner's
   test for the tension with the episode codebook has not been run (D-027).
8. **Settle the schematic's four open decisions** (O-21). It is built, on the
   frame of Rott et al. (2021) Fig. 5; `docs/SPEC-gate0.md` §11 lists what
   awaits the owner.
9. **Decide what a second Generate does** (O-31). It now replaces the
   session's model run on disk; the spec recommends appending a new run
   instead.
10. **Settle real-data handling** before any real data arrives: the identity
    manifest fields (O-22), and consent, de-identification and where it lives
    (O-23).
11. **Read the demo dialogue against its plans** (D-034). Done: the writer has
    been run, and `src/generator/dialogue/` holds all twelve files, one per demo
    session. Still open: read a sample of the lines against their plans, since
    nothing in code checks that a line fits its planted code.

Further directions, and what running it for real would take:

12. **Build the episode review screen** (`docs/SPEC-review.md`). Recorded as a
    design for a later gate; nothing of it ships in Gate 0 (`docs/SPEC-gate0.md`
    §2, "Out").
13. **Validate the model against tutors, held out.** The agreement apparatus
    exists for this, and nothing here has done it (`INTENT.md`, "Agreement:
    apparatus, not evidence"). It needs tutors marking sessions the prompt and
    the codebook were not tuned on, with the figure reported held-out, never
    development-set (`CLAUDE.md` rule 4).
14. **Measure episode boundaries as well as labels** (O-18,
    `docs/SPEC-gate0.md` §11). Turn-level kappa can agree while two runs carve
    a session into different episodes. Lee et al. (2026), under "Read before
    Gate 1 and Gate 2" in `docs/CITATIONS.md`, propose segmentation metrics
    that need no gold labels.
15. **A second domain** (`INTENT.md`, "Domain generality"). Out of Gate 0
    (`docs/SPEC-gate0.md` §2). It needs the domain split of item 4 first, and
    applying the codebook outside mathematics is an EXTRAPOLATION needing its
    own validation, not a claim of transfer.
16. **Run it on real sessions.** Beyond the demo, three things:
    - real-data handling first: consent, de-identification and where the data
      lives (O-23), and the identity manifest (O-22), as in item 10;
    - a hosted server with authentication. The API routes exist only in the
      Vite dev server (`configureServer` in `vite.config.ts`), and their
      origin check guards a local server against cross-site requests; it is
      not authentication;
    - a cost per session. Every model run already records its token usage and
      its cache reads and writes; what is missing is turning that into a cost
      per session and a budget.

17. **Integrate specific tutor and student dialogue moves.** Code what is said
    inside a stretch at the level of single moves: for example, a student turn
    that asks a clarifying question or explains reasoning, and the tutor moves
    around it. Layer 2 already does this for one tutor turn per boundary, with
    three codes from the NTO Tutor Move Taxonomy (Zhou et al., 2026). Student
    moves would be a separate layer, with its own codebook, where every code
    names the paper it comes from, and its own agreement gate; nothing is
    combined across layers (`CLAUDE.md` rules 1 and 12). Its sentences describe
    the move in the exchange, never a trait of the person, and `INTENT.md`'s
    ban on an elicited-versus-spontaneous split still holds outside Layer 2's
    one exception. What has to hold first: a published move scheme whose
    licence allows this use (share-alike sources were removed on 2026-09-18),
    and its reliability stated as its authors report it (`CLAUDE.md` rule 3).

The remaining open questions — O-5, O-8, O-10, O-11, O-13, O-14, O-18, O-27,
O-29 and O-30, and O-33 to O-35, raised on 2026-09-18 — are listed in
`docs/SPEC-gate0.md` §11. O-3, O-12, O-21, O-25 and O-28 were resolved on
2026-09-17 by reading the source papers; O-21 has since been built, with the
four decisions of item 8 left to the owner.
