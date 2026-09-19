# SPEC — Gate 0

**Playbook step.** Design (CLAUDE.md, "How we work"). The build plan written
from this spec is `docs/PLAN-gate0.md` (Draft 1, 2026-09-17), and Gate 0 is
being built against it. Owner decisions taken since are recorded in §0 as they
arrive, and the sections they change are revised in place.

**Status.** Draft 3, 2026-09-17, amended 2026-09-18 by D17. Supersedes the Gate 0 brief of 2026-09-14, the
`report.json` contract 0.1.0 drafted from it, and Draft 2 of this file, which
was `docs/SPEC.md`. Renamed because Gate 1 will have its own spec, and the
review interface already has one (docs/SPEC-review.md).

**Precedence.** INTENT.md, then CLAUDE.md, then this spec. Where this spec and
INTENT.md disagree, INTENT.md wins until its owner amends it. §11 lists the
disagreements that owner decisions have created.

**Not yet read.**

- `docs/00-SYNTHESIS.md` and `docs/01`–`04`: not in the repo.
- Schoenfeld (1985), Li et al. (2025, arXiv:2509.14662) and Rott, Specht &
  Knipping (2021, ZDM 53(4)): cited in `codebook.v2.json` but not in
  `docs/SOURCES.md`, so not opened.

Nothing below restates a code definition. Definitions live only in
`codebook.v2.json`.

---

## 0. Owner decisions recorded

| # | Question | Decision (2026-09-17) |
| --- | --- | --- |
| D1 | What drives the agreement gate? | **Restored 2026-09-17b.** Demos use simulated tutor–student sessions and simulated annotation runs. Agreement is computed per demo set: one set lands at or above 0.61, another below it, and a third has no annotation run at all. |
| D2 | Codes from more than one paper in one layer? | Allowed when every code names its `origin` and the combination has a DEVIATIONS entry. Applied to CLAUDE.md rule 1. |
| D3 | What does Gate 0 build? | **Restored 2026-09-17b, minus the UI reuse.** The annotation interface (§7.2), the LLM episode pipeline (§6), the multi-session report (§7.1), the agreement computation (§5.4) and the internal agreement view (§7.3). No Sandpiper UI is reused. The episode review screen stays a later gate (docs/SPEC-review.md). |
| D4 | Must episodes tile a session? | **Revised 2026-09-18 by D17.** An LLM run, yes: every turn in exactly one episode, and a gap is a defect. An annotation run, no: it may leave turns unmarked, though no turn may sit in two of its stretches. Was: every run tiles. A later summary phase omits the non-content codes (since D17, the four codes outside `in_problem_process`, §3). They stay in the data so model inference on them can be tracked. |
| D5 | What does the LLM generate for the report? | Episodes only. Episodes can shift quickly, so the summary describes aggregate trends using the number of episodes, their length and their location within sessions. The report includes a visual schematic; Rott et al. (2021) Fig. 5 is the stored reference (`docs/reference/rott-2021-fig5.md`). |
| D6 | How are simulated annotation runs produced? | **Restored 2026-09-17b.** From the generator's planted episode plan, with controlled boundary and label noise, tuned so a demo set lands above or below 0.61. |
| D7 | What does the agreement gate cover? | **Restored 2026-09-17b; revised 2026-09-17c by D15.** A κ at the turn level, between one annotation run and one LLM run. Was: one figure per report, pooled over the turns of the student's reportable sessions. Now: that pooled figure and a per-session one beside it. The pooled figure is still the only one the gate acts on. |
| D8 | Must it work on real data? | Yes. The project must be functional if real data were dropped in. End products: an annotation interface a tutor can use, and the report. |
| D9 | Before pushing | The README carries a "Next steps" section. |
| D10 | Who phrases the summary? | A separate LLM call writes the aggregated summary of what happened, from aggregates computed in code. |
| D11 | Is the agreement figure shown? | No. It is computed internally, it gates whether the layer surfaces, and neither the value nor its band reaches a learner- or parent-facing surface. The repo is the apparatus for validating the labelling, not a claim that it has been validated. |
| D12 | Which run is the report built from? | Either. An annotation run and an LLM run have the same shape, and the report can be generated from one of them. The provenance card names which (§5.6). The default when both exist is O-29. |
| D13 | Is the demo a working system, or screens of one? | **2026-09-17c.** Working, and the whole loop runs from the page: annotate a transcript to tiling, save it, press generate and the model runs on that same transcript through the API at that moment, a κ is computed from those two runs, and the report is built from the run just produced. Re-annotating an earlier session changes the κ. A transcript file dropped into the page runs the same loop (§5.8). Nothing on that path is precomputed, canned or stubbed. What ships already annotated and already run is about three sessions, with at least one left un-annotated so the loop can be walked from the beginning (§8). Transcripts and the annotation runs that ship are simulated; every computation is real (INTENT.md, "The demo is the system"). **Revised 2026-09-18 by D17** on one point: "annotate a transcript to tiling" is now "mark the problem-solving work in it". The rest of the loop is unchanged. |
| D14 | What does re-annotating an annotated session do? | **2026-09-17c.** It recomputes the κ, per session and pooled (§5.4). The model does not re-run, and the report keeps the episodes the last LLM run produced. If the recomputed pooled κ falls below the threshold, the report's episode detail moves into the suppressed state (§7.1 item 6), so the report changes visibly without a new model run. |
| D15 | Per session or pooled? | **2026-09-17c. Revises D7.** Both. Per session, over that session's turns, so annotating one session shows what that session scores. Pooled over the sessions that have both runs, which is the figure the report's gate acts on. Both are internal (D11). |
| D16 | Which sessions does a report cover? | **2026-09-17c.** The annotated ones. If two of four sessions have an annotation run, the report is about those two. An un-annotated session is not in the report at all — not as a view, not in an aggregate, and not as a session held back. |
| D17 | What does a tutor mark, and must a tutor's run tile the session? | **2026-09-18. Revises D4, and D13 on one point.** The problem-solving work only, and no. The owner's words: "the tutor shouldn't have to annotate every line to be able to save the annotation", and "I don't think it's helpful to ask the user to be coding read, monitor, organization, and digression. Eliminate these features from tutor-facing annotations." A tutor marks stretches with the five codes the codebook flags `in_problem_process` (analysis, planning, implementation, exploration, verification) and may leave any turn unmarked. Reading, monitor, organization and digression are never offered to a tutor. The model still tiles every turn with all nine codes, and a gap in its run is still a defect. For the comparison (§5.4), an unmarked turn counts as not problem solving, and so does any turn the model gave one of the other four codes, so κ is computed over six classes: the five codes and `not_problem_solving`. The owner confirmed that reading of it ("yes exactly"). docs/DEVIATIONS.md D-026. |
| D18 | What is a tutor shown of a long transcript, and what does agreement compare? | **2026-09-18. Resolves the first half of O-34.** Where a session marks two or more problems, the tutor is shown one whole problem, drawn at random with a seed; a toggle on the Tutor Annotation screen shows the whole session instead. A session with no problem markers, or one problem, is shown whole. The number of problems drawn and the seed live in config only (`sampling` in config/gate0.json). A saved annotation records the turns it was shown, and κ compares those turns only, in both sequences, with the count recorded; inside them an unmarked turn is still not problem solving. The turn floors (30 per session, 100 pooled) are unchanged and count shown turns. The report still covers the whole session from the model run. The owner's words: "whole problem surfaced. this is a simple fix", "config file only, but maybe the tutor should be able to annotate entire session they want or are sampled one problem, they can toggle", and the recommended options for the other two. Finer sampling units are a README next step. docs/DEVIATIONS.md (sampling entry). |
| D19 | Which demo sessions can a tutor open, and what are their transcripts? | **2026-09-18. Narrows D13 on one point.** In the live demo (demo-a), the three sessions that arrive with a simulated annotation and a model run are locked on the tutor side: their transcript is not served to Tutor Annotation, and saving an annotation or running the model on them is refused. Their transcripts use the generator's pool lines, which follow the planted plan their simulated annotations were built from; the model-written lines (D-034) drifted from that plan and pooled κ fell to 0.37. The un-annotated session keeps its model-written transcript and is where the loop, re-annotation included, is walked. The report keeps its evidence links into locked sessions (CLAUDE.md rule 7). Layer 2 marking on locked sessions is locked too (owner, 2026-09-18, later the same evening): the page shows no tutor moves for them and the server refuses marks on them. The owner's words: "freeze earlier transcripts and ensure they can't be accessed ... just have the newest transcript be nuanced", with the recommended option that keeps report evidence. |

**Two corrections on 2026-09-17, in order.** The first recorded what the owner
verified about Sandpiper: it has no span, segment, episode or boundary concept
anywhere in its data model, no component in it writes a human label, and its
only human inputs are a vote on one AI annotation and an offline CSV round trip.
That replaced §10 and still stands.

That first correction also removed the annotation interface and all agreement
computation from Gate 0, and this spec recorded it by striking out D1, D3, D6
and D7. **The second correction reversed that part.** The annotation interface
ships: the owner's words were "I just won't have real annotators to use it, but
I should be able to become an annotator and influence the data", and the
previous wording contradicted D8 outright. A kappa is computed, internally,
using Sandpiper's own calculator ("compute kappa internally. use sandpiper for
this"), and it is never shown. INTENT.md's sentence "There are no human
annotators on this project. No kappa will be computed." was removed on the
owner's instruction, with the clarification that what it meant was "I wouldn't
be trying to claim that the LLM has already been validated. this serves as a
pipeline TO do the validation."

What survives from the first correction: no Sandpiper UI, pipeline, annotation
plumbing or schema fork, and the episode review screen of docs/SPEC-review.md
stays a later gate. D1, D3, D6 and D7 are restored above, revised rather than
struck through, and D11 and D12 are new.

**Owner decisions of 2026-09-17c, D13–D16.** What "demo" means here was settled
against the reading this spec had been drafted under: the owner's words were
"the entire process needs to work… that's what I mean when I say demo, not just
putting the features on the website. It needs to actually be able to do it."
The consequence runs through §2, §5.4, §5.8, §7.1 and §7.2: the loop is driven
from the page, which means an endpoint of ours behind which the API key stays,
and it means run and report storage is now decided rather than open (§11, O-19).
D7 is revised by D15 rather than superseded — the pooled figure it named is
still the one that gates, and a per-session figure now sits beside it. Nothing
here touches what the repo may claim: the figures stay internal (D11), and the
data that ships stays simulated and labelled (D1, CLAUDE.md rule 6).

**Owner decision of 2026-09-18, D17.** A tutor is asked for the problem-solving
work and nothing else, and what a tutor leaves unmarked is not missing: it is
the comparison's residual class. The consequences run through §1 (done
criteria 2 and 11), §3 (tiling and the summary phase), §4 (the dropdown and the
guide), §5.3 (what an annotation run may leave out), §5.4 (six classes), §7.2,
§7.3, §8 (the simulated annotator) and §9.1 (the tiling rule is the model's).
It raises O-33 and O-34, and it is the first place this spec records what had
already overtaken items 2 and 3 of O-21.

## 1. Goal and done criteria

Gate 0 demonstrates, end to end on simulated data, and runs unchanged on real
transcripts dropped in (D8):

1. A person segmenting and labelling a transcript into episodes, in the
   annotation interface.
2. An LLM doing the same thing, from the codebook.
3. The agreement between the two, computed and internal.
4. The multi-session problem-solving process report, generated from either
   run, or the suppression state when agreement is below threshold or absent.

The episode review screen of docs/SPEC-review.md is a different surface and a
later gate; nothing of it ships here.

Gate 0 is done when:

1. **Demo sets.** Three simulated demo sets exist, each one student across
   several sessions, and between them they render all three states of §5.4:
   one where the computed κ reaches 0.61 and the layer surfaces, one where it
   does not and the layer is suppressed, and one with no annotation run, where
   nothing is computed. The first two differ by a computed number, not a flag.
   D16 bears on the third and is not settled here (§11, O-30).
2. **Annotation interface.** A person can open a session, mark contiguous turn
   ranges, and assign a code from a dropdown built from `codebook.v2.json`:
   the five codes flagged `in_problem_process` (D17), with any timestamp-only
   code absent when the session has no timestamps. Turns may be left unmarked
   and saving does not wait for them; overlapping stretches are refused at
   save. The result is an annotation run stamped with `codebook_version` and
   `annotator_id`, and a run stamped with a different codebook version is
   refused on import.
3. **Codebook composition.** One loader feeds the dropdown, the annotator
   guide, the prompt and the provenance card: composed with its domain file
   once the split in O-4 has been made, and otherwise 2.0.0 as it stands.
4. **Agreement.** A turn-level κ is computed between an annotation run and an
   LLM run, pooled per report, with the band from the vendored interpreter; the
   degenerate inputs in §5.4 are refused rather than scored; the figure appears
   in the internal view only, and no learner-facing string contains it.
5. **LLM pipeline.**
   - A prompt is built only from the composed codebook, the transcript turns,
     and fixed instructions about tiling and output shape (§6).
   - The LLM run produces tiling episodes per session.
   - The report is generated from those episodes.
   - A separate LLM call writes the summary from aggregates computed in code (D10).
   - Every LLM output is validated before use, and every summary sentence
     passes the wording lint before display.
6. **Report UI.** Renders every view in §7.1 and §7.3, with the
   synthetic-data label persistent on every view (CLAUDE.md rule 6). §7.1
   item 9 ships only if O-8 is answered yes.
7. **Checks.** Both scripts are added by the build plan; `package.json` has
   no scripts today.
   - `yarn validate` rejects every defect in §9.1.
   - `yarn lint:wording` passes on all UI copy and all generated report text,
     and fails on every banned phrase.
8. **Deviations log.** `docs/DEVIATIONS.md` has an entry for every
   EXTRAPOLATION, CROSS-STUDY and consequential OURS decision.
9. **Real-data path.** A transcript file in a supported intake format (§5.8),
   with its identity manifest, runs through the annotation interface, the LLM
   pipeline and the report without code changes, labelled `authentic`.
10. **README.** Includes a "Next steps" section before anything is pushed (D9).
11. **The loop, in a browser (D13).** Starting from a session that ships
    un-annotated: mark its problem-solving work, save, press generate, and the κ and the
    report that appear are computed from those two runs at that moment, with
    nothing on the path precomputed. Re-opening an annotated session, changing
    labels and saving recomputes the κ and does not re-run the model (D14). A
    transcript file dropped into the page runs the same loop (§5.8). Checked by
    walking it, and reported with what was observed, not asserted.

## 2. Scope

**In.**

- Codebook loading and composition (§4)
- The annotation interface (§7.2)
- LLM episode pipeline and report generation (§6)
- Turn-level agreement computation and the gate it drives (§5.4), using the
  vendored calculator (§10)
- Simulated demo data (§8)
- The data contract (§5), including stable episode ids and the unwritten
  `reviewer_id` / `reviewed_at` fields
- Report UI (§7.1) and the internal agreement view (§7.3)
- The report and transcript JSON Schemas, written from §5
- Validator and wording lint (§9)
- Real-data intake (§5.8), from a script and from the page
- The loop, driven from the page (D13): annotating and saving an annotation run
  (§7.2), running the LLM pipeline on demand (§6), computing the agreement from
  the two runs that then exist (§5.4), and rendering the report from the run
  just produced (§7.1). Each step runs when it is asked for, not ahead of time
- An endpoint of ours that carries it. The page cannot call the Anthropic API
  itself: the key lives in `.env` and must never appear in client code, in a
  client bundle, or in anything the browser receives. So the page calls an
  endpoint, and the endpoint is what holds the key, makes the model call (§6),
  and performs the reads and writes of §5. It is the only writer (§11, O-19).
  This spec fixes the requirement; the build plan picks the implementation
  [OURS: a key that reaches a browser is a published key, and a demo meant to be
  run by someone other than its author is exactly the case where that happens]
- README with a "Next steps" section

**Out.**

- Everything INTENT.md lists as out of scope
- A second domain
- The NTO tutor-move layer (Gate 1)
- The episode review screen: sampling, the hidden proposed label, the
  eleventh button, the coarse segmentation error rate. docs/SPEC-review.md
  records that design; none of it ships here, and `reviewer_id` /
  `reviewed_at` stay unwritten (§5.3).
- Any agreement figure on a learner- or parent-facing surface (D11), pooled or
  per session (D15)
- The API key anywhere the browser can reach: client code, a client bundle, a
  response body or a URL (D13)
- A precomputed or canned step anywhere in the loop: a stored κ shown as though
  it had just been computed, a stored model output shown as though the model had
  just run, or a report that does not come from a run on disk (D13)
- Any claim that the model's labelling has been validated (INTENT.md)
- Adopting Sandpiper's pipeline, annotation plumbing, transcript schema or UI
  (§10). Its Cohen's kappa helper is vendored; the rest is not.
- Real student data committed to the repo
- Any reliability claim about real data
- A database, Docker
- Tutor-confound adjustment; an elicited-versus-spontaneous split

## 3. The layer

**Construct.** Schoenfeld episodes.

**Definitions.** Li et al. (2025) Appendix E, as adapted in `codebook.v2.json`,
plus two codes whose `origin` is Rott et al. (2021): organization and
digression. That paper makes three inductive additions; the third, writing, was
dropped in codebook 2.1.0 and its scope folded into organization.

**Unit.** An episode: a contiguous span of turns, spanning both speakers,
during which the participants are doing one kind of problem-solving work.

**Codes.** Names and flags only; see `codebook.v2.json` for everything else:

| code | content_related | in_problem_process | requires_timestamps |
| --- | --- | --- | --- |
| reading | true | false | — |
| analysis | true | true | — |
| planning | true | true | — |
| implementation | true | true | — |
| exploration | true | true | — |
| verification | true | true | — |
| monitor | true | false | — |
| organization | false | false | — |
| digression | false | false | — |

**Tiling (D4, D17).** Every turn of a session belongs to exactly one episode of
an LLM run: no gaps and no overlaps. An annotation run is held to the second
half only. It carries the stretches a tutor marked, each with one of the five
`in_problem_process` codes, and no turn sits in two of them. A turn outside
every stretch is unmarked, which is not a defect (§5.3, §5.4).

**Summary phase (D4, D17).** The learner-facing report shows only episodes
whose code has `in_problem_process: true`
[OURS: codebook.v2.json `note_on_in_problem_process`; docs/DEVIATIONS.md D-026].
That leaves out reading and monitor as well as the two codes with
`content_related: false`, which were all this paragraph first excluded. The
timeline and the schematic already draw only the five (`app/Report.tsx`,
`app/Schematic.tsx`). The summary call does not yet follow the rule: it is
handed aggregates over all nine codes (`src/pipeline/aggregates.ts`), so
nothing yet stops its text from naming the other four. Those episodes remain:

- in the LLM run files
- in the timeline data
- in the agreement computation, as the residual class `not_problem_solving`
  (§5.4)
- in the internal view's side-by-side rendering of the two runs, so what the
  model does with them can be seen. They have no per-code agreement of their
  own, because a tutor never marks them (§7.3)

**Sentence subject.** The session or the work, never the student.

**Never implied.**

- what the student knows or understands
- what kind of thinker the student is
- whether the student improved
- whether the tutor is good

## 4. Codebook

**Files.** `codebook.v2.json` (present, 2.0.0) and `domains/math.json` (not
yet present).

INTENT.md splits the fields between them:

- `codebook.v2.json`: code, name, origin, content_related,
  requires_timestamps, definition, include, exclude, adaptation,
  deviation_from_paper; and `in_problem_process`, which INTENT.md's split
  predates [OURS: docs/DEVIATIONS.md D-026]
- `domains/math.json`: example, keywords, include_extra

Version 2.0.0 is not yet split (§11, O-4).

**Composition.** At load time, from `domain` in the run config. One loader
feeds four consumers:

1. **Dropdown.** The annotation interface's code list (§7.2): the five codes
   with `in_problem_process: true` and no others (D17), excluding any code with
   `requires_timestamps: true` when the session's `has_timestamps` is false.
2. **Prompt.** The LLM prompt, with all nine codes, applying the same
   timestamp exclusion.
3. **Annotator guide.** The generated help panel beside the dropdown, for the
   same five codes.
4. **Provenance card.** The code list and each code's `origin` (§5.6).

A fifth consumer arrives with the review gate: the code buttons and help text
in docs/SPEC-review.md, from this same loader. Nothing renders it in Gate 0.

**Versioning.**

- `codebook_version` is stamped on every run file, human or LLM.
- Imports with a different version are refused.
- Changing a definition means a codebook edit, a version bump and a re-run.
  It is never a code change.

**Single definition.** No definition text appears in UI code, prompts written
by hand, this spec, or the report file except as a generated,
validator-checked snapshot (§11, O-5).

## 5. Data contract

### 5.1 Carried over from 0.1.0

- `data_provenance`: `synthetic` for demo sets, `authentic` for real data
  dropped in (D8), with a persistent `ui_label` either way
- `identity`: supplied upstream, never inferred
- `setting`
- The transcript shape, which is ours (§10):
  - turn-level field names match Sandpiper's — `_id`, `role`, `content`,
    `session_id`, `sequence_id`, `annotations` — as a compatibility target at
    the turn level only
  - `student_id`, `session_index`, `session_date`, `session_topic`, `turn_id`
    added
  - `session_id` required; lead role comes from the manifest, never inferred
  - no fork of Sandpiper's schema, and no field carried over for its own sake

### 5.2 Removed from 0.1.0

- Per-utterance layer annotations and the PeerMathDial and NTO layers
- The `source-irr-v0` suppression policy and its minimum band
- `code_subset`, `labeling`, the reliability-basis logic
- Claims with the student or tutor as subject

### 5.3 Added: sessions, runs, episodes

**Per session.**

- `has_timestamps` (boolean)
- `transcript_scope` (`full` required for reportability)
- `problems[]`, optional: `{ problem_id, topic, start_turn_id, end_turn_id }` in
  turn order. A session may be spent on more than one problem, and an episode
  never straddles a boundary — a new problem is new work, whatever kind of work
  it is. Absent means the session was one problem, which is how a transcript
  that arrives without problem boundaries is read [OURS].

**`runs[]`.** One per labelling source. Gate 0 produces two kinds, `llm` and
`human`, with the same shape, because either can be the source the report is
built from (D12):

```
{
  "run_id": "run-llm-001",
  "kind": "llm" | "human",
  "simulated": true,                 // a generated annotation run (§8)
  "model": "<model id>" | null,      // llm runs only
  "prompt_hash": "<hash of the composed prompt>" | null,
  "annotator_id": "<id>" | null,     // human runs only, never a name
  "codebook_version": "2.0.0",
  "domain": "math",
  "created_at": "<ISO 8601>"
}
```

**Episodes.** Stored in the session-level `annotations[]` array, one set per
run, which for an LLM run is a tiling:

```
{
  "_id": "0",
  "episode_id": "ep-run-llm-001-s03-002",
  "run_id": "run-llm-001",
  "identifiedBy": "AI",
  "layer_id": "episodes",
  "codebook_version": "2.0.0",
  "domain": "math",
  "EPISODE": "<code>",
  "start_turn_id": "s03-t014",
  "end_turn_id": "s03-t027",
  "evidence": ["s03-t014", …, "s03-t027"],
  "reviewer_id": null,
  "reviewed_at": null
}
```

- `episode_id` is stable and addressable. It is composed from the run id, the
  session and the episode's ordinal within that session, so a later record can
  point at one episode and keep pointing at it.
- `identifiedBy` is `HUMAN` on an annotation run and `AI` on an LLM run. It
  follows the run's `kind` and is never set per episode.
- `reviewer_id` and `reviewed_at` are present and always `null`. Nothing in
  Gate 0 writes them, including the annotation interface: authoring a label is
  not reviewing a proposed one, and the review record of docs/SPEC-review.md
  is a different shape for a later gate.
- Simulated status lives on the run, never on the episode.
- **What each kind of run covers (D4, D17).** An LLM run tiles every session it
  covers, with any code of its `codebook_version`. An annotation run carries
  only the stretches a tutor marked, each coded with one of the five
  `in_problem_process` codes. It may leave turns unmarked, and no two of its
  stretches overlap. Two touching stretches a tutor marked with the same code
  are saved as one episode [OURS: they are one stretch of the same work]. An
  unmarked turn has no episode record: `not_problem_solving` is a class of the
  comparison (§5.4), never a code written into a run.

### 5.4 Agreement gate (D1, D7, D11, D14, D15, D17)

Computed, internal, and never shown to a learner or a parent.

```
agreement: {                         // the pooled figure, and the gate
  "threshold": 0.61,                 // AGREEMENT_THRESHOLD, config constant
  "statistic": "Cohen's kappa",
  "unit": "turn",                    // each turn's class under each run (below)
  "compared_runs": ["run-human-001", "run-llm-001"] | null,
  "n_turns": <int> | null,
  "value": <number> | null,          // null only when there is nothing to compare
  "band": "<getKappaInterpretation(value)>" | null,
  "measured": <bool>,
  "state": "shown" | "suppressed" | "unmeasured",
  "simulated": <bool>,               // the annotation run it compared against
  "statement": "<provenance-card text, see §7.1>",
  "per_session": [                   // one entry per session with both runs (D15)
    {
      "session_id": "s03",
      "compared_runs": ["run-human-003", "run-llm-003"],
      "n_turns": <int>,
      "value": <number> | null,
      "band": "<getKappaInterpretation(value)>" | null,
      "measured": <bool>,
      "refused": "<reason>" | null   // the degenerate-input rules below
    }
  ]
}
```

- The comparison is one annotation run against one LLM run over the same turns,
  and it is over six classes, not the codebook's nine (D17): the five codes with
  `in_problem_process: true`, and `not_problem_solving` for everything else.
  Each run gives each turn exactly one class:
  - **Annotation run.** A turn inside a marked stretch takes that stretch's
    code. An unmarked turn is `not_problem_solving`.
  - **LLM run.** A turn whose episode has one of the five codes keeps it. A turn
    the model coded reading, monitor, organization or digression is
    `not_problem_solving`. A turn in no episode is a defect, and the computation
    raises rather than scoring it (D4).

  So the two label sequences are equal-length and positionally aligned, which
  is what the vendored calculator expects (§10)
  [OURS: a tutor supplies nothing for the other four codes, so the two runs can
  be compared only on the classes both of them use; whether the residual class
  inflates or deflates κ is O-33, and what an unmarked turn means is O-34].
  Where generate writes a run per session rather than one spanning several, it
  is one such pair per session and the pool is over those pairs.
- **Two scopes (D15).** Per session, over that session's turns, so annotating one
  session shows what that session scores. Pooled over the sessions that have both
  runs, one figure per report (D7), which is the scope the gate acts on. A
  per-code breakdown, keyed by the six classes, is stored for the internal view
  (§7.3).
- The top-level fields are the pooled figure. `state` is computed from the pooled
  `value` alone, and there is no per-session `state`: the gate has one scope. A
  session may land below the threshold while the pooled figure is above it. That
  suppresses nothing by itself and is visible in §7.3, which is the point of
  storing it.
- `per_session` carries an entry for each session that has both an annotation run
  and an LLM run. A session with only one run has no entry — that is an absence,
  not a refusal and not a κ of 0. A session the report does not cover (D16) has
  no entry either.
- `compared_runs` names the runs a figure was computed from: exactly two at the
  session scope, and at the pooled scope the distinct runs that went into it.
- `state` is `shown` when `value >= threshold`, `suppressed` when
  `value < threshold`, and `unmeasured` when there is no annotation run to
  compare against. The third is not a failure and must not render as one
  (§7.1).
- **Recomputed on save (D14).** Saving an annotation run recomputes that
  session's figure and the pooled figure, from the runs then on disk, and
  triggers no model run. If the recomputed pooled value crosses the threshold
  downward, `state` becomes `suppressed` and §7.1 item 6 renders over the
  episodes the last LLM run produced. The report changes; the episodes in it do
  not.
- Neither `value` nor `band` reaches a learner-facing surface, at either scope
  (D11, D15). The report says whether the layer surfaced and why; it does not
  print the number.
- Nothing here is evidence that the model labels a session correctly. It is the
  apparatus for finding that out (INTENT.md, "Agreement: apparatus, not
  evidence").
- `simulated` is true when the annotation run compared against was generated
  (§8), and a simulated figure is labelled as such wherever it appears
  internally.

**Degenerate input, refused rather than scored.** The vendored calculator
returns 1 when expected agreement is 1, so two runs that annotate nothing at
all score a perfect 1, and it returns 0 on a length mismatch rather than
raising (§10, docs/LAY-OF-THE-LAND.md §3a). A wrapper of ours refuses these
instead of passing a number through
[OURS: a silent 1 or 0 is indistinguishable from a real result, which is worse
than no result]:

- label sequences of unequal length: refuse, naming both lengths
- either run using exactly one code across every turn: refuse as degenerate
- fewer turns compared than `MIN_TURNS_AGREEMENT`: refuse (§11, O-7)

The rules apply at both scopes, each on its own inputs (D15). A refused session
does not refuse the pool, and a refused pool does not delete the session figures
already computed. A session refused for unequal length is out of the pool too,
because its labels do not align; a session refused only for being short or
single-coded still contributes its turns to the pool, because that refusal is
about what a figure over that session alone would mean, not about the labels
[OURS: the alternative, dropping a short session from the pool as well, discards
aligned turns for a reason that does not apply at the pooled scale].

At the pooled scope a refusal sets `value` and `band` to null, `measured` to
false, and `state` to `unmeasured`, with the reason recorded for the internal
view. At the session scope it sets that entry's `value` and `band` to null,
`measured` to false, and `refused` to the reason. Neither is ever reported as a
κ of 0.

### 5.5 Session gate

- `session_gate: { min_turns }`, plus per session
  `{ session_id, turn_count, reportable }`.
- Independent of the agreement gate; never merged with it.

### 5.6 Report content

**`claims[]`.** `{ claim_id, text, evidence_episode_ids[], provenance }`.
The text's subject is the session or the work. Evidence resolves to LLM-run
episodes.

**`provenance_card`.**

- the sources
- the setting extrapolation (§11, O-14)
- the simulated-data statement
- which run the report was generated from (D12), named as a human or an LLM run
- the agreement state in words, never as a number (D11): that the layer
  surfaced, or was suppressed, or that no annotation run exists to compare
  against
- that no inter-rater reliability has been established for this layer in this
  project, and that Li et al. (2025) report no agreement figure of their own
- the domain caveat

### 5.7 Student agreement record

Carried over, pending §11, O-8.

### 5.8 Real-data intake (D8, D13)

- **From the page.** Intake happens from the annotation interface as well as
  from a script: a file in one of the formats below is dropped into the page,
  posted to the endpoint of §2, parsed and written there, and is then a session
  like any other — annotatable, runnable, reportable, through the same loop
  (D13). The script path stays; neither is the special case.
- **Transcripts.** CSV or JSONL, one utterance per row, with `session_id`,
  `role`, `content` and `sequence_id` — the turn-level names of §10 item 3,
  documented in Sandpiper's `documentation/transcripts.md`. The parser is ours.
- **Identity and order.** `student_id`, `session_index` and `session_date` are
  not in Sandpiper's intake. They come from a manifest supplied with the data
  (§11, O-22), never inferred. This holds for a drop from the page, which means
  the page must collect those fields or take a manifest alongside the file; a
  dropped file on its own does not carry them.
- **Lead role.** Supplied in the manifest, never inferred. Sandpiper infers it
  with an LLM; that is in the not-taken list (§10).
- **Timestamps.** `has_timestamps` is true only when every turn in the session
  has `start_time` and `end_time` [OURS].
- **Status.** Real data is `authentic` and is never committed to the repo.

## 6. LLM pipeline

1. **Load.** Compose the codebook and domain; exclude timestamp-only codes per
   session.
2. **Prompt.**
   - Built only from the composed codebook, the transcript turns and fixed
     instructions about tiling and output shape.
   - Its hash is recorded on the run.
   - Unit and actor follow `codebook.v2.json` `note_on_adaptation`.
3. **Segment.**
   - One call per session returns episodes as structured output.
   - Output that fails the §9.1 episode checks is rejected, not repaired silently.
4. **Agree.** Compute §5.4 between the LLM run and the student's annotation
   run, if one exists. Refuse the degenerate inputs §5.4 lists rather than
   returning a number. Nothing here is learner-facing.
5. **Report (D5).**
   - The LLM produces episodes only.
   - Aggregates are computed in code, never by the LLM
     [DERIVED: episodes → the operation named]:
     - number of episodes per code per session
     - episode length in turns, and in seconds when timestamps exist
     - location of episodes within the session, as position in the session's
       turn order [OURS: binning chosen in the build plan]
   - Because episodes can shift quickly, the summary describes aggregate trends
     across sessions, not individual shifts.
   - A separate LLM call writes the summary (D10). It receives the computed
     aggregates and the episode list, and counts nothing itself.
   - Each summary sentence carries the episodes it rests on, and must pass the
     wording lint. A sentence that fails either check is dropped, not rewritten
     silently.
   - The visual schematic is built from the same episodes (§7.1).
6. **Model.** Claude via the Anthropic SDK (key slot in `.env`). The model id is
   fixed in the build plan.
7. **Invocation (D13).** Steps 1–5 run behind the endpoint of §2, on demand,
   when the page asks for them and on the transcript the page names. The key is
   read there and does not leave it.

## 7. UI

**Stack.** Open again (§11, O-24). The earlier choice followed from reusing
Sandpiper's UI, which §10 removes. Files and JSON only, no database. The build
plan picks the stack and the rendering mode.

### 7.1 Report

**Tone.** Warm, two minutes, student and parent together; resist the dashboard.

1. **Across-session overview.** Aggregate trends across reportable sessions, in
   `session_index` order (D5), with the summary text written by a separate LLM
   call (D10).
2. **Session episode timeline.** Consecutive segments sized by turns, or by
   seconds with timestamps. Only the five `in_problem_process` codes are drawn
   (§3, D17).
3. **Process schematic (D5).** One per problem, not one per session: the kinds
   of work and the route through them, adapted from Rott et al. (2021) Fig. 5
   (`docs/reference/rott-2021-fig5.md`, CC BY 4.0, attribution and the
   indication of changes rendered with the diagram). The arrows are the episodes
   in order, first to last, so the diagram shows the path this problem actually
   took [DERIVED: episodes of the source run → the order they occurred in].
   The node set is §11, O-21.
4. **Evidence.** An episode or claim opens its turn span, showing both
   speakers, in a turn component of ours.
5. **Provenance card.** Always reachable.
6. **Suppression state.** First-class, and driven by the computed κ (§5.4).
   Shown when `agreement.state` is `suppressed`, with the reason in words. The
   value, the band and the threshold do not appear: a parent reading that the
   layer is held back does not need the number, and printing it would make a
   measurement out of something this project does not claim (D11).
7. **Unmeasured state.** Also first-class, and visually distinct from
   suppression. Shown when `agreement.state` is `unmeasured`: no annotation run
   exists for this student, so nothing has been compared. It is not a failure
   and must not read as one. What reaches this state, now that coverage follows
   the annotated sessions (D16), is §11, O-30.
7. **Session not reportable.** First-class and visually distinct, with its own
   reason.
8. **Data label.** `synthetic` or `authentic`, on every view.
9. **Student agreement control.** Pending O-8.

**Coverage (D16).** A report covers the student's annotated sessions. If two of
four sessions have an annotation run, the report is about those two: an
un-annotated session contributes to no view and no aggregate, and does not
appear as a session held back. Coverage is settled before the gates, not by
them. Of the sessions covered, §5.5 decides which are reportable, and the
session-not-reportable state above says so where one is not. An un-annotated
session is not "not reportable"; it is not in the report. Two gates, two
reasons, and coverage is neither (INTENT.md).

**Generated on demand (D13).** The report renders the run named on it, and that
run is a file on disk produced by the pipeline, not a fixture. Pressing generate
produces one and the report follows it. Saving an annotation afterwards
recomputes the agreement and can move the report into the suppressed state
without a new run (D14); the provenance card still names the run the episodes
came from (§5.6).

### 7.2 Annotation interface (D3, D8)

The authoring surface, and one of the two end products in D8. It is not the
review screen: docs/SPEC-review.md is a different design for a later gate, and
§2 keeps it out of this one.

1. The session transcript, turn by turn, both speakers.
2. Select a contiguous range of turns and assign a code from the dropdown
   generated from `codebook.v2.json` (§4): the five problem-solving codes only
   (D17), with any timestamp-only code absent when the session has no
   timestamps.
3. Unmarked turns are allowed, and are not a defect (D17): saving does not wait
   for them, and an unmarked turn counts as not problem solving when the runs
   are compared (§5.4). Two stretches may not overlap, and saving refuses a
   marking where they do. Touching stretches with the same code are saved as
   one (§5.3).
4. The generated annotator guide for the selected code, from the same loader.
5. Save writes an annotation run, `kind: "human"`, stamped with
   `codebook_version` and `annotator_id`. It writes through the endpoint of §2,
   to a file on disk (§11, O-19): the annotation is stored, not handed back to
   the browser to keep or to download. A run stamped with a different codebook
   version does not import.
6. That run is a source the report can be generated from (D12), and it is what
   §5.4 compares the LLM run against. The save path is the one real data takes
   (§5.8), which is what makes D8 checkable rather than aspirational.
7. **Generate (D13).** From the same page, generate runs the pipeline (§6) on
   this session's transcript, through the same endpoint, at that moment. The run
   it writes is what §5.4 compares against and what the report is built from
   (§7.1). No stored output stands in for it.
8. **Re-annotating (D14).** Re-opening an annotated session, changing labels and
   saving writes the annotation run again and recomputes the κ, per session and
   pooled (§5.4). It does not re-run the model. What the person sees change is
   the agreement, and the report where the recomputed pooled figure crosses the
   threshold.
9. **Intake (D13, §5.8).** A transcript file dropped into the page goes through
   the same endpoint and becomes a session like any other, subject to the
   identity fields §5.8 requires.
10. Sessions ship in both states: some already annotated and already run, at
    least one un-annotated so the loop can be walked from the beginning (§8).

### 7.3 Internal agreement view (not learner-facing)

- The annotation run's stretches and the LLM run's tiling side by side against
  the same transcript, so disagreement is visible turn by turn.
- κ with its band, its `n_turns`, and its simulated label when the annotation
  run was generated (§8).
- The same, per session, beside the pooled figure, and marked as not what the
  gate acts on (D15). This is where a session below the threshold inside a
  pooled figure above it is visible (§5.4).
- Per-code agreement over the six classes of §5.4. The model's four codes
  outside the five have no figure of their own, because a tutor never marks
  them (D17). What the model does with them is visible in its tiling, not
  measured.
- A refusal with its reason, in place of a number, when §5.4's degenerate-input
  rules fire.
- Never linked from a learner-facing view, and never rendered in the same
  screen as the report.

## 8. Simulated demo data (D1, D6)

**Contents.** Simulated tutor–student sessions, one student per demo set, each
session generated from a planted episode plan that is kept beside it, plus a
simulated annotation run for the sets that have one. Every set is
`data_provenance.status: synthetic` and labelled on every view.

**Three sets, three states (D1).** One lands at or above 0.61 and the layer
surfaces; one lands below and the layer is suppressed; one has no annotation
run at all and renders the `unmeasured` state (§5.4). The first two differ by a
computed number, not by a flag.

**Launch state (D13).** What ships is already populated: about three sessions
arrive with a simulated annotation run against them and with an LLM run the
pipeline genuinely produced, so there is something to look at on opening, and at
least one session arrives un-annotated so the loop of §7.2 can be walked from the
beginning. The exact count is the build plan's, within that shape. A stored run
from an earlier real invocation is not a canned step, as long as nothing presents
it as having just happened (§2, Out) and the report names the run it came from
(§5.6). How this sits with the third demo set, which has no annotation run at
all, is §11, O-30.

**Target agreement (D6).** A simulated annotation run is the planted plan with
controlled boundary and label noise, tuned so the set lands where it is meant
to. The noise is on the annotation side because that is the side a real tutor
would supply; the LLM run is whatever the pipeline actually produces. Since
D17 the simulated annotator marks what a tutor marks: its run keeps only the
stretches coded with the five `in_problem_process` codes and leaves the rest
unmarked (`src/generator/sets.ts`).

**Two quantities, reported separately and never collapsed** (CLAUDE.md rule 6):

- **Generator fidelity.** How closely a generated transcript matches the plan
  it was generated from. Not measured in Gate 0. When it is, it is measured by
  coding the transcript independently, not by trusting the generator.
- **Pipeline recovery.** How closely the LLM's episodes match an annotation
  run: §5.4's κ.

Neither is evidence about real tutoring, and a demo κ is not a validity claim
(INTENT.md).

**Cautions** (from the synthetic-fidelity deep search; brief not yet in repo):

- Synthetic recovery shows the pipeline can recover a signal under the
  generator's assumptions, not that it measures real tutoring validly.
- Simulated dialogue is typically more coherent and less varied than real talk.
- A simulated annotation run tuned to a target κ shows the gate works. It says
  nothing about how a person would actually have labelled those turns.

## 9. Validation and lint

### 9.1 `yarn validate` rejects

**Contract.**

- Schema violations of the report contract, the transcript schema, or a run
  file. The schemas were written from §5 in this gate (§2) and are in schema/:
  report.schema.json, transcript.schema.json and run.schema.json.
- Duplicate `session_id`, `session_index`, `turn_id`, `run_id`, `episode_id`
  or `claim_id`.

**Episodes, per run and session.**

- start or end turn missing or in another session
- start after end
- `evidence` not exactly the span's turns
- in an LLM run, any gap or overlap: tiling violated (D4)
- in an annotation run, any overlap, or a code outside the five
  `in_problem_process` codes (D17). A gap in an annotation run is not a defect:
  it is an unmarked turn (§5.3)
- a code not in the codebook for the run's `codebook_version`
- a code declaring `requires_timestamps` in a session without timestamps

**Versions and timestamps.**

- A run's `codebook_version` or `domain` differs from the report's; import refused.
- `has_timestamps: true` with a turn lacking `start_time` or `end_time`.
- A codebook snapshot that differs from the composed codebook files, if O-5
  is answered yes and a snapshot is stored at all.

**Agreement gate.**

- `value` differs from κ recomputed over `compared_runs`, with each turn mapped
  to the six classes of §5.4
- `band` differs from `getKappaInterpretation(value)`
- `state` inconsistent with `value` and `threshold`; or `unmeasured` with a
  non-null `value`; or `shown` with `value < threshold`
- `threshold` differs from config
- `measured` true with a null `value`, or false with a non-null one
- an input §5.4 says must be refused, reported as a number instead
- `simulated` false while the compared annotation run is simulated
- any learner-facing string, claim or summary sentence containing the value,
  the band or the threshold (D11)
- every rule above, applied to each `per_session` entry as well as to the pooled
  figure (D15); plus an entry for a session that does not have both runs, an
  entry for a session the report does not cover (D16), and a non-null `refused`
  beside a non-null `value`

**Coverage (D16).**

- a report view, aggregate or claim covering a session with no annotation run

**Session gate.**

- `turn_count` differs from the transcript
- `reportable` inconsistent with `min_turns` or `transcript_scope`

**Claims.**

- evidence does not resolve to an `episode_id`
- evidence cites a non-reportable session

**Tags.** A `CROSS-STUDY` tag with no matching DEVIATIONS entry id.

**Self-check.** The validator is verified with one broken copy per rule, each
rejected with its specific message.

### 9.2 `yarn lint:wording` fails on

- A phrase in `lint/banned-phrases.json` [OURS], in UI copy or in generated
  report text. The list covers at least:
  - disposition and type nouns
  - comparison words ("typical", "average", "on track", "ahead", "behind")
  - learning-gain words ("improved", "progress", "mastered", "understands", "knows")
- A claim or heading whose grammatical subject is a person pronoun or the
  student's display name.

## 10. What we take from Sandpiper

The owner verified on 2026-09-17 that Sandpiper has no span, segment, episode or
boundary concept anywhere in its data model or schemas; that no component in the
app writes a human label; and that its only human inputs are a vote on a single
AI annotation (`markedAs`, `votingReason`, carrying no reviewer id and no
timestamp, on rows keyed by array index) and an offline CSV round trip.

Our unit is the episode: a contiguous span of turns across both speakers.
Sandpiper cannot represent that. This is not a gap to work around. It is where
the two designs part, and it sits upstream of everything else here.

Three designs and two copied files. The list is closed:

1. **The codebook structure.** Categories, codes, examples, and a version
   stamped on every record produced under it. `codebook.v2.json` follows it in
   part: nine codes, a plain `example` on seven of them, and one
   `codebook_version`. Sandpiper's typed examples
   (HIT / NEAR_HIT / NEAR_MISS / MISS) and its designated production version
   are structure this project has not adopted yet (§11, O-26).
2. **`getKappaInterpretation.ts`**, copied verbatim with attribution to
   `vendor/sandpiper/getKappaInterpretation.ts` and listed in NOTICE. Zero
   imports. It implements the Landis & Koch bands and is the citable source of
   `AGREEMENT_THRESHOLD = 0.61`. Since 2026-09-17b Gate 0 computes a κ (§5.4,
   item 4 below), and this file names that value's band for the internal view
   (§7.3). Its one call site is the wrapper in `src/agreement/kappa.ts`. The
   band is a name for the value, internally; the gate compares the value
   against the threshold, not the band.
3. **Turn-level field names** — `_id`, `role`, `content`, `session_id`,
   `sequence_id`, `annotations` — as a compatibility target at the turn level
   only. It keeps open the option of comparing our output against NTO's corpus
   later. Episodes are ours and have no Sandpiper analogue.
4. **`calculateCohensKappa.ts`**, added 2026-09-17b on the owner's instruction
   ("compute kappa internally. use sandpiper for this"), copied verbatim with
   attribution and listed in NOTICE. It is what §5.4 computes with. Two of its
   behaviours are wrong for us and are handled in a wrapper of ours rather than
   by editing the copy: it returns 1 when expected agreement is 1, so two runs
   that annotate nothing score a perfect 1, and it returns 0 on a length
   mismatch instead of raising. The wrapper refuses both (§5.4).

**Not taken.** The pipeline; the rest of the evaluation helpers, namely the
PRF1, mean-kappa, pairwise-matrix and top-performer functions, none of which a
two-run comparison needs; the annotation-schema and prompt helpers; the
human-annotation CSV plumbing; the transcript validator and its JSON Schema;
the vote fields; the LLM class and its providers; the storage adapters; the
Mongo services; and the UI components and `app/uikit`. The annotation interface
of §7.2 is built, not borrowed: Sandpiper has no in-app annotation authoring
surface to borrow. Reasons per item: docs/LAY-OF-THE-LAND.md §3(c).

**Not a constraint.** "Droppable into Sandpiper later" does not bear on any
decision in this repo. `reference/sandpiper` stays cloned and gitignored, for
reading.

## 11. Open questions and conflicts

Resolved by D1–D12: O-1, O-2, O-6, O-9, O-16, O-17, O-20, and the scope half
of O-18. Resolved by the two corrections of 2026-09-17: O-15 and O-25. Resolved
by reading the source papers on 2026-09-17: O-3, O-12, O-21, and the second
bullet of O-10. Resolved by D13–D16: O-19, and the demo half of O-29. Newly
raised by them: O-30 and O-31, and a second scope in O-7. Raised by D17
(2026-09-18): O-33 and O-34; D17 also records what had overtaken items 2 and 3
of O-21. O-35 records stale text outside this spec. The rest remain open.

- **O-3. Resolved 2026-09-17.** The three sources behind the layer are now in
  `docs/SOURCES.md` under a new Tier 0, and two of the three PDFs are on disk in
  `docs/reference/`. Li et al. (2025) and Rott et al. (2021) have been read;
  Schoenfeld (1985) is a book, is not in the repo, and has **not** been opened,
  which is recorded in SOURCES.md — every definition this project uses comes
  from Li et al.'s guidebook rather than from the book. See O-28 for the licence
  problem one of those PDFs brings with it.
- **O-4. Codebook not yet split per INTENT.md.**
  - 2.0.0 keeps `example` and mathematical vocabulary in the general file.
  - `requires_timestamps` is present on no code since 2.1.0.
  - Splitting is a version bump and the owner's call. Until then, the loader
    reads 2.0.0 as-is and treats an absent `requires_timestamps` as false [OURS].
- **O-5.** Is a generated, validator-checked codebook snapshot inside the
  report file acceptable under "exactly one definition"?
- **O-7. Two thresholds, neither with a value.**
  - `MIN_TURNS_REPORTABLE`, the session gate (§5.5). No value and no source.
  - `MIN_TURNS_AGREEMENT`, below which §5.4 refuses to compute a κ at all. New
    with the agreement gate, and also without a value. A κ over a handful of
    turns is arithmetic, not evidence, and the refusal is what keeps it from
    being reported as though it were.
  - `MIN_TURNS_AGREEMENT` now has two scopes to apply to (D15). One session's
    turns are the smaller number, so the same value refuses far more often per
    session than pooled. Does one value serve both, or does the session scope
    get its own? Recommended: one value, applied at each scope, and a session
    refused for being short is still visible as a refusal in §7.3 — two values
    would be two [OURS] numbers where there is currently no source for one.
  - Both are [OURS] until a source is named.
- **O-8. Student agreement control.** Keep it, now that claims are about
  sessions? If it is kept, `schema/agreement-response.schema.json` needs
  rewriting either way: it requires `report_schema_version`, which the contract
  in §5 does not define and which only the deleted 0.1.0 schema gave meaning
  to, and it addresses a claim by `claim_id` + `layer_id`, while §5.6 defines a
  claim without a `layer_id`. A record written against the current contract
  cannot populate either field.
- **O-10. Threshold rationale, half resolved.**
  - Still open: "the most widely used threshold in discourse coding" needs a
    source or an [OURS] tag wherever it reaches a reader. Neither paper read on
    2026-09-17 supplies one.
  - Resolved: the earlier note said "Sandpiper labels κ above 0.60 as
    Substantial, so 0.60–0.61 is in the band but below the gate". That is true
    of `vendor/sandpiper/getKappaInterpretation.ts`, which returns Moderate for
    `kappa <= 0.6`, but not of Sandpiper as published: the Evaluations dashboard
    in Hedley et al. (2026), Fig. 5, p. 6, bins κ ≥ 0.61 as Substantial. The
    threshold and the product agree; only that one helper's boundary is off by
    a hundredth, and it is used for the band name, not for the gate.
- **O-11. Missing research docs.** `docs/00-SYNTHESIS.md` and `01`–`04` are
  not in the repo. INTENT.md's wording rules are sourced to
  `docs/03-open-learner-models.md` with no note that it is absent, and
  INTENT.md outranks every document that does carry the caveat.
- **O-12. Resolved 2026-09-17: three.** Rott et al. (2021), p. 743, states that
  a new type was added inductively when Schoenfeld's deductive types did not
  fit, and that this happened three times: organization, writing, digression.
  Two of the three are used here; writing was dropped in codebook 2.1.0.
  There is no fourth, so nothing was dropped. `codebook.v2.json`'s top-level
  `source` field is the one place that says four and is wrong; NOTICE §2 and §3
  above already say three. Fixing it is a codebook edit and a version bump, so
  it is the owner's call (see the codebook decisions in README.md).
- **O-13. LessonLink figures still have no source.** The counts in
  `codebook.v2.json`'s `deviation_from_paper` fields — a floor of 1,187 rows;
  977 of 3,576 segments; 40,152 rows; 27% — appear in neither paper read on
  2026-09-17. Li et al. never mention a tutoring corpus at all, and Hedley et
  al. name no corpus and report no counts. They need a source or an [OURS] tag
  naming who measured them, or they come out of the codebook.
- **O-14. Setting extrapolation, source now read.** docs/DEVIATIONS.md D-022
  no longer rests on repo text alone: Li et al. (2025) has been read and its
  setting is confirmed. It annotated DeepSeek-R1 reasoning traces on SAT
  Mathematics items — 38 responses, 915 paragraphs, 3,087 sentences, three
  trained annotators after a pilot (§3.1–3.2, pp. 3–4) — with no human speech,
  no dialogue and no tutoring anywhere in the annotated data. The extrapolation
  to two-speaker tutoring turns stands as D-022 describes it, and is now
  citable. What remains open is O-27, a second extrapolation the reading
  exposed.
- **O-15. Resolved 2026-09-17, in two steps, and not where it first landed.**
  The first correction resolved it in INTENT.md's favour: no annotators, no
  kappa, config-driven suppression. The second reversed most of that. What is
  settled now: the annotation interface ships (D3, D8); a κ is computed
  internally between an annotation run and an LLM run and gates what surfaces
  (D7, D11); the figure never reaches a learner-facing surface; INTENT.md's
  sentence "There are no human annotators on this project. No kappa will be
  computed." was removed by the owner, whose clarification was that it meant no
  claim of having already validated the model. The repo is the apparatus for
  that validation. No part of this makes a reliability or validity claim, which
  is the constraint that actually held throughout.
- **O-18. Boundary agreement.** No longer moot: §5.4 computes a turn-level κ,
  so the question is live again. Should a boundary measure be reported beside
  it? Turn-level κ over two tilings is insensitive to how badly the boundaries
  are placed, as long as the labels match; two runs can agree on nearly every
  turn while carving the session into different episodes. The
  codebook-injected-segmentation paper in SOURCES.md Tier 2 proposes
  label-free boundary metrics. Hedley et al. (2026) offers nothing here:
  segmentation is listed as future work in that paper (§5, p. 6). Not gating
  either way, and the review gate's coarse segmentation error rate
  (docs/SPEC-review.md §5) is a different instrument for the same worry.
- **O-19. Resolved 2026-09-17c by D13.** Files on disk, written through the
  endpoint of §2. The page never writes; the endpoint is the only writer,
  because it is already the only holder of the API key, and that keeps one
  path for the annotation runs saved from §7.2, the LLM runs generated from
  §7.2, the agreement objects of §5.4 and the reports.
  - The shape of the write path stands as recommended: direct file IO with every
    read and write behind one module, so a remote store can be added later
    without touching callers. An adapter contract with only one implementation
    is the abstraction CLAUDE.md warns about. PLAN-gate0.md P2 already records
    this as the working answer.
  - What the endpoint does *not* settle is whether a second generate replaces a
    run or adds one. That is O-31.
- **O-21. Schematic node set — built, four decisions awaiting the owner.** The
  schematic ships (§7.1 item 3), so the question is no longer whether but
  whether these four choices stand:
  1. `planning` and `implementation` share one split box, as the figure has
     them, with counts per half and the moves between them drawn inside it.
     Nothing is merged in the data.
  2. `reading` and `monitor` get boxes the figure has no counterpart for, drawn
     dashed. `monitor` sits in the middle, the only position from which a
     juncture code can reach every box.
  3. The three non-content codes are not drawn (D4), but the route steps over
     them rather than breaking, and the count stepped over is stated.
  4. The figure's "(Verified) Solution" is relabelled as the end of the work.
     Nothing in an episode code establishes that a solution was reached, let
     alone verified, so the original label would assert something the codes
     cannot support. This is the one most worth arguing with.
  The edges are observed transitions, not the figure's model of what is
  possible, and the caption says so.
  **Items 2 and 3 overtaken; recorded 2026-09-18 with D17.** The schematic draws
  only the five `in_problem_process` codes (`app/Schematic.tsx`, its note 5):
  reading and monitor get no boxes, and the codes it steps over are neither
  named nor counted. Items 1 and 4 stand.
- **O-22. Identity manifest for real data.** Sandpiper's intake has no
  `student_id`, `session_index`, `session_date` or lead role. Proposed: a
  manifest per student listing its sessions with those fields. Format to agree.
  D13 makes this blocking rather than tidy: a transcript dropped into the page
  carries none of those fields, and they are never inferred (§5.8), so either
  the page collects them in the drop or the drop takes a manifest beside the
  file. Which of the two is the owner's call, and it is the first thing a
  stranger's transcript will hit.
- **O-23. Handling real student data.** Consent, de-identification and where
  real data lives are unspecified. It stays out of the repo until they are.
- **O-24. Stack, reopened.** React 19 / React Router 7 / Vite / Tailwind 4 /
  shadcn "new-york" was adopted because the UI came from Sandpiper. §10 removes
  that, so the stack is a decision on its own merits again. shadcn/ui is
  available directly from upstream and owes nothing to Sandpiper, so it remains
  a reasonable default. The build plan decides. D13 narrows it in one respect:
  whatever is chosen has to provide the server side that holds the key and does
  the writing (§2), so a client-only build is out. Files and JSON only still
  holds; it is a server, not a database.
- **O-25. Resolved 2026-09-17b.** The divergence is gone, from both ends. The
  owner removed INTENT.md's "There are no human annotators on this project"
  sentence, and the annotation interface makes the codebook's `note_on_editing`
  accurate again: the dropdown and the annotator guide are real consumers of
  the loader (§4). One wording point survives, and it is cosmetic:
  `note_on_editing` says "a sheet generated under a different version will not
  import", which describes a spreadsheet round trip this project does not have.
  The rule it states is right; only the word "sheet" is borrowed from
  Sandpiper's CSV workflow.
- **O-26. Typed examples and a production version.** §10 item 1 takes
  Sandpiper's codebook structure, which includes examples typed as
  HIT / NEAR_HIT / NEAR_MISS / MISS and a designated production version.
  `codebook.v2.json` 2.0.0 has neither: seven of the ten codes carry one plain
  `example`, three carry none, and the only version marker is
  `codebook_version`. Adopt both, adopt neither, or adopt typing without the
  production flag? It is a codebook edit and a version bump, so it is the
  owner's call, and it interacts with O-4. Hedley et al. (2026) confirms both
  halves exist in the shipped product: Fig. 2, p. 4 shows a prompt version
  flagged Production and one named for near-hit examples. That the structure
  exists is settled; whether it earns its keep here is not.
- **O-27. A hierarchy flattened.** Li et al. annotate at two levels: Appendix D
  defines three paragraph-level categories (General, Explore, Verify) and
  Appendix E the seven sentence-level ones this project uses, and the paper
  presents them as deliberately hierarchical (pp. 18, 22). This project has one
  flat layer of ten codes. Collapsing a two-level scheme into one is an
  EXTRAPOLATION beyond the source's design, distinct from the setting
  extrapolation in D-022, and it needs its own docs/DEVIATIONS.md entry. It may
  also bear on the episode-length question: a paragraph is closer to an episode
  than a sentence is.
- **O-28. Resolved 2026-09-17b.** `docs/reference/2509.14662v1.pdf` (Li et al.)
  carries only the arXiv perpetual non-exclusive distribution licence 1.0, with
  copyright retained by the authors, so it is gitignored and cited rather than
  shipped (NOTICE §4, docs/CITATIONS.md). The other two PDFs and Fig. 5 are
  CC BY 4.0 and are tracked (NOTICE §3).
- **O-29. Which run does the report default to? Half resolved 2026-09-17c.**
  D12 says either an annotation run or an LLM run can be the source, and that the
  provenance card names which. What it does not say is what happens when a
  student has both.
  - Resolved for the loop: D13 builds the report from the LLM run just
    generated, and D14 keeps that run's episodes when the annotation changes. So
    on the demo path the source is the LLM run, and the question does not arise
    at the moment generate is pressed.
  - Still open: whether an annotation run may be the source at all in Gate 0,
    given that the loop never selects one, and whether the choice stays explicit
    per report. Recommended, unchanged: require it explicitly and record it on
    the report. PLAN-gate0.md P7 assumes that answer.
- **O-30. Where does `unmeasured` come from now? Raised 2026-09-17c by D16.**
  D1 and §8 give the third demo set no annotation run so that the `unmeasured`
  state has something to render in. D16 says a report covers only annotated
  sessions. A student with no annotation run therefore has no sessions in the
  report at all, so the state INTENT.md calls first-class is left reachable only
  through §5.4's refusals, or through a session annotated but not yet run.
  Options: keep the third set and let a report that covers nothing render the
  unmeasured state as its entire content; or drop that set and reach the state
  through a refusal; or let the un-annotated session of D13's launch state carry
  it in the annotation interface instead of the report. Recommended: the first.
  INTENT.md names the state "no annotation run to compare against", and a report
  that says exactly that is the honest rendering of it; a refusal renders a
  different sentence, about a comparison that could not be made rather than one
  that was never asked for. Not resolvable without the owner, because it is
  D1's demo-set structure that moves either way. The same gap has a smaller
  case inside it: a session that is annotated but not yet run is covered by
  D16 and has no episodes to render and no per-session figure. Every session
  in the loop passes through that state between save and generate, and nothing
  says what the report shows for it.
- **O-31. The live loop: what a second generate does. Raised 2026-09-17c by
  D13.** Nothing has decided whether generating again on a session replaces the
  LLM run on disk or adds another beside it. It is load-bearing in three places:
  which run §5.4 compares against, which run the report renders (D12, O-29), and
  what "the episodes the last LLM run produced" refers to in D14, which
  presupposes that there is a last. Recommended: append, never overwrite — each
  generate writes a run with its own `run_id` and `created_at`, and the newest is
  what the κ and the report follow unless the report names another. A run is
  evidence of what the model did on a date, and overwriting it destroys the only
  record of a comparison someone may already have looked at.
  - The same decision has a second half nobody has taken either: what the page
    and the disk are left with when a live run fails, or when §6 step 3 rejects
    its output. Under a script that was a stack trace in a terminal; from a page
    it is a person waiting, with a previous report still on screen. Recommended:
    write the attempt with its rejection rather than discarding it, and never
    leave the previous report rendering while the page implies a new one was
    produced.

- **O-32. Who initiated each step. Deferred to Gate 1 by the owner, 2026-09-17.**
  The owner asked for each model run to label whether the tutor or the student
  initiated each step. That is the elicited-versus-spontaneous split INTENT.md
  and CLAUDE.md rule 13 both forbid in Gate 0, because the episode layer cannot
  attribute a step to one speaker. It is the question the NTO Tutor Move
  Taxonomy layer exists to answer, so it waits for that layer, and so does the
  definition of "initiated" (the model's judgement, or the first speaker). When
  it returns, it needs its own agreement figure before it reaches a family, as
  every other label here does.

- **O-33. Does a large residual class inflate κ or deflate it? Raised
  2026-09-18 by D17.** The κ the gate acts on is now over six classes, and one
  of them, `not_problem_solving`, is defined by exclusion: whatever a tutor left
  unmarked, and four of the model's codes merged. Where that class is a large
  share of the turns, two effects pull κ in opposite directions, and nothing in
  this repo says which wins.
  - **Up.** Confusions among the four no longer count: a turn the model calls
    monitor that a tutor would have called reading is now agreement. And a turn
    both sides leave outside the five is agreement that asked nothing of the
    tutor, because an unmarked turn agrees with the model's non-process codes by
    default.
  - **Down.** When one class dominates both runs' marginals, expected agreement
    rises, so the same observed agreement yields a lower κ, and a few
    disagreements over the five codes weigh more. This is the prevalence effect
    Feinstein & Cicchetti (1990, J Clin Epidemiol 43(6):543–549) describe as
    high agreement with low κ. That paper is not in docs/SOURCES.md and has not
    been opened here.
  - **Observed 2026-09-18, the demo workspace.** Three simulated annotation runs
    against three model runs, 170 pooled turns. The residual is 30 turns under
    the annotation runs and 42 under the model runs, a minority on both sides;
    observed agreement 0.776, expected 0.199, κ 0.721. So the demo is not yet
    the case this question is about. A real session with long stretches of
    reading aloud, logistics or off-topic talk may be.
  - Recommended: keep κ as the one figure the gate acts on (the threshold is not
    re-litigated, INTENT.md), and show beside it in §7.3 the residual's share of
    turns under each run, observed and expected agreement, and κ over only the
    turns at least one run places in the five [OURS]. That shows when a κ is
    carried by the residual, without adding a second gate. What would settle the
    direction for this design: recompute κ on the same pairs with the turns both
    runs put in the residual removed, over sessions where the residual is small
    and where it is large, and see which way it moves.

- **O-34. What an unmarked turn means. Raised 2026-09-18 by D17. First half resolved 2026-09-18 by D18: a saved annotation records the turns it was shown, and agreement compares those only. Still open: whether an empty marking is a judgement.** D17 reads an
  unmarked turn as a judgement: not problem solving. Nothing records that a
  tutor looked at the turn. Two cases follow, and the second is already in the
  code (found by reading it, not by running it).
  - An omission and a judgement cannot be told apart. A tutor who stops halfway
    leaves turns unmarked that the comparison reads as "not problem solving",
    and any disagreement there counts against the pair as much as a real one.
    README "Next steps", sampling what a tutor is asked to annotate,
    makes this the normal case rather than the careless one: turns outside a
    sampled section were never shown.
  - A marking with no stretches at all. `src/server/api.ts` `putAnnotation`
    accepts one, and the session then counts as annotated for coverage (D16),
    which follows whether the run file exists. But `src/agreement/gate.ts`
    leaves a session out of the pool when the annotation run has no episode in
    it, and the session's own figure is refused for too few turns. So a tutor's
    judgement that none of a session is problem solving is not compared at all,
    and the report covers a session the κ does not.
  - Recommended: treat a saved marking as a judgement over every turn of its
    session, an empty one included, so an empty marking puts every turn in the
    residual and joins the pool. When sampling arrives, record on the run which
    turns were shown, and compare over those only, with the denominator
    recorded. The owner's call, because the first half changes what the gate
    counts.

- **O-35. Stale text this spec cannot amend.** Recorded so it is not left
  unnoticed. Each is the owner's edit.
  - CLAUDE.md rule 5: "Hand-authored values in Gate 0 must be visibly labelled
    as illustrative." Gate 0's demo data is generated, not hand-authored, and
    is labelled `synthetic` (§8, D-011); the illustrative fixture the rule was
    written for was removed on 2026-09-17. The rule's first sentence, that
    illustrative data is marked in the UI and not only in a comment, still holds
    if any is ever added. Recommended: drop the Gate 0 clause, or reword it to
    cover any hand-authored value that reaches a view.
  - `codebook.v2.json` 2.2.0, two notes D17 contradicts. `note_on_content_related`
    says an annotator "must still apply" organization and digression where they
    fit, and `note_on_editing` says the file generates "the annotator dropdown"
    without saying that the dropdown now offers five of the nine codes. Changing
    either is a codebook edit and a version bump (CLAUDE.md rule 10), so it can
    travel with O-4 and O-12.

## 12. Merge record: Gate 0 brief (2026-09-14) → this spec

| Brief item | Here | Reason |
| --- | --- | --- |
| No LLM, no pipeline, no annotation | Replaced: the LLM pipeline, the annotation interface and the report all ship | D3, D8 |
| Hand-authored illustrative JSON | Replaced by simulated demo sets, labelled synthetic | D1 |
| Three layers: PeerMathDial, Levin struggle, NTO prompting | One episode layer | INTENT.md |
| Schoenfeld episodes excluded as cross-study from act codes | Now the layer, coded independently | INTENT.md, D2 |
| Elicited-vs-spontaneous excluded | Kept excluded | INTENT.md |
| Tutor section to compare student and tutor change | Dropped; NTO in Gate 1 | INTENT.md |
| Suppression by Landis & Koch bands from source papers | κ computed on our own two runs against 0.61; the band names the value, internally only | D7, D11 |
| Suppressed state first-class | Kept, plus a separate session gate | INTENT.md |
| Contract: identity fields upstream; stable ids; evidence as turn ids | Kept; evidence is episode spans | INTENT.md |
| Run provenance out of scope until Gate 3 | Pulled in: `runs[]`, kinds `llm` and `human` | D1, D3 |
| Provenance from the file, not hardcoded | Kept | — |
| Student agreement control | Pending | O-8 |
| Wording rules and banned-phrase lint | Kept; session or work as subject; lint covers generated text | INTENT.md, D3 |
| Stack free choice | Was Sandpiper's stack, to reuse its UI; reopened, and the build plan decides (§7, O-24) | D3, as corrected 2026-09-17 |
| No DB, no Docker; MIT; attribution | Kept | — |
| TalkMoves / SAGA22 note | Removed 2026-09-18: the dataset is CC BY-NC-SA 4.0, and the owner removed share-alike sources | — |
| Adopt Sandpiper codebook shape | Replaced by `codebook.v2.json` + `domains/` | INTENT.md |
| Copy `getKappaInterpretation.ts` | Kept (vendored) | — |
| (not in brief) | Functional on real data; README "Next steps" before push | D8, D9 |
| (not in brief) | The loop runs from the page and runs live, behind an endpoint that holds the API key; the report covers annotated sessions only; κ per session as well as pooled | D13, D14, D15, D16 |
