# Deviations log

Every EXTRAPOLATION, CROSS-STUDY, and consequential OURS decision, with what we
did, why, what evidence would support or refute it, and where it lives. See
CLAUDE.md for the tag definitions.

Status: **Open** means a decision is still owed before the entry is settled.

IDs D-003, D-004, D-009 and D-014 are unused.

**Revised twice on 2026-09-17.** Entries were retired, revised and added in two
passes on this date, the second correcting part of the first. Neither pass
rewrote the log from scratch: every entry keeps its number, its heading and its
original text, nothing is renumbered, and a **Status.** line or a dated note
says what happened and when.

**First pass.** Two changes drove it.

1. The struggle layer and the two taxonomy layers — Yue et al. PeerMathDial
   reasoning acts, Zhou et al. tutor moves — were removed. Gate 0 now has
   exactly one analysis layer: Schoenfeld episodes, via Li et al. (2025)
   operational definitions, with three inductive additions from Rott et al.
   (2021) (INTENT.md, "One layer, this gate"; docs/SPEC-gate0.md §3). Zhou et
   al. returns in Gate 1 as its own independent layer and will need fresh
   entries then.
2. The owner corrected this project's relationship to NTO Sandpiper
   (docs/SPEC-gate0.md §10). Three things are taken and nothing else: the
   codebook structure, `getKappaInterpretation.ts` verbatim, and the turn-level
   transcript field names as a compatibility target. There is no schema fork
   and no adopted pipeline. The second pass added one more copied file,
   `calculateCohensKappa.ts` (D-023), so the count is four rather than three.
   That pass also recorded no human annotators, no computed kappa, and a
   suppression state driven by a config flag; the second pass reversed those
   three, and the rest of the item stands.

**Second pass.** The owner corrected the first pass on two points, both now
settled. First, the annotation interface ships in Gate 0 after all. D3 as
written said it did not, which conflicted with D8, and the owner's correction
was: "I just won't have real annotators to use it, but I should be able to
become an annotator and influence the data." It is an authoring surface, and
never the review screen of docs/SPEC-review.md, which remains a later gate
(D-025). Second, a kappa is computed, internally, through Sandpiper's own
`calculateCohensKappa.ts`, vendored verbatim at the owner's instruction
("compute kappa internally. use sandpiper for this") behind a wrapper of ours
(D-023, D-024). The figure never reaches a learner- or parent-facing surface,
and nothing here claims measured reliability, validity, or a validated model:
this repo is the apparatus that would produce such evidence, not the evidence.
What the first pass established about Sandpiper's unit of analysis, and about
the review screen belonging to a later gate, is unchanged.

Entries touched by the second pass: D-002 (retirement reason corrected),
D-010, D-011, D-017, D-018, D-019, D-020, D-022, and the new D-023, D-024
and D-025.

**2026-09-18.** D-026 added, for docs/SPEC-gate0.md D17. D-024 and D-025 carry
a dated note pointing at it; their original text is unchanged.

**2026-09-18, later.** D-027 to D-031 added for Layer 2, tutor prompting at
episode boundaries (INTENT.md, "Layer 2"). D-005 stays retired and carries a
dated note pointing at them; its original text is unchanged.

Entries below point at `data/report.json` (schema version 0.1.0),
`scripts/validate-report.mjs` and `schema/transcript.extended.schema.json`,
in retired entries and in the revised D-001 and D-011. Those files were
superseded by the data contract in docs/SPEC-gate0.md §5 and have since been
removed from the repo. The references are kept so the history stays readable.

---

## D-001 · OURS · Extended transcript shape

**Revised 2026-09-17.** The fork is abandoned. This entry described a copy of
Sandpiper's `transcript.schema.json` with fields added to it; there is no such
copy in the design any more. The transcript shape is ours. What follows is the
current decision; the field rationales survive because the requirements that
produced them did.

**What.** The transcript shape is ours, and it is not derived from any upstream
schema. Two things are true of it at once:

| Field | Level | Status |
| --- | --- | --- |
| `_id`, `role`, `content`, `session_id`, `sequence_id`, `annotations` | turn | Names match Sandpiper's, as a compatibility target **at the turn level only**. It keeps open the option of comparing our output against NTO's corpus later. Nothing else is carried over, and no field is kept for its own sake. |
| `student_id` | session | Ours, required. A longitudinal report is about one learner; upstream has no learner identity. |
| `session_index` | session | Ours, required. The report's axis. Supplied upstream, never derived from dates or content. |
| `session_date` | session | Ours, required. Supplied upstream; kept in data, off the chart for now. |
| `session_topic` | session | Ours, optional. Lets a reader recognise a session without opening it. |
| `turn_id` | turn | Ours, required. `_id` is an index within one session and cannot be an evidence target across sessions. |

Also ours and recorded in docs/SPEC-gate0.md §5.3: per-session `has_timestamps`
and `transcript_scope`. Lead role is supplied in the intake manifest and never
inferred (§5.8); Sandpiper infers it with an LLM, which is in the not-taken
list (§10).

**Why.** These are the gap between the turn-level names and what a
learner-facing longitudinal report requires: identity, chronology, and a turn
address stable across sessions so a claim can point at evidence. Episodes span
turns across both speakers and have no Sandpiper analogue, so the shape parts
from upstream above the turn regardless.

**Would refute.** A way to give evidence links and chronology from
Sandpiper-shaped files alone. None is known: upstream annotations are
index-addressed and upstream has no learner identity.

**Where.** docs/SPEC-gate0.md §5.1, §5.3, §5.8.
`schema/transcript.extended.schema.json` was the superseded fork and has been
removed; the shape it encoded is not the one specified in §5.1.

---

## D-002 · OURS · Suppression rule `source-irr-v0`

**Status.** Retired 2026-09-17. Replaced by D-020.

**Retirement reason corrected 2026-09-17**, in the second pass of that date.
The reason first recorded — that nothing here computes or consults an agreement
figure — is wrong: a turn-level figure is computed internally (D-024), and
D-020 as revised derives the suppression state from it. The entry stays retired
on its own terms. Its policy selects a figure *from the source papers* and maps
that to a band; what is built instead compares one annotation run against one
LLM run over this project's own transcripts, which is a different figure about
a different thing, and no source figure gates anything. Where a source paper
reports its own agreement figures they are still shown as that paper's,
attributed, and never as ours.

*Original entry, kept for the record:*

**What.** A layer is reported only if its source reports a chance-corrected
agreement statistic between human coders from a `pre_discussion` phase or a
`coding_round`. The lowest such value is the basis, mapped to a Landis & Koch
band via Sandpiper's `getKappaInterpretation`. Minimum band: **Moderate**.
Post-discussion figures are shown but never the basis.

**Why.**

- Consensus figures measure agreement after coders reconciled, not how
  consistently the codebook is applied independently.
- Taking the lowest eligible value removes producer discretion over which figure counts.
- Moderate was chosen as the lowest band that is not Slight or Fair.

**Source check.** Zhou et al. describe each reliability round as independent
coding followed by discussion (Section 2.4, p. 3), so both figures are recorded
as pre-discussion.

**Sensitivity.**

| Minimum band | Yue (no IRR) | Zhou (0.65) |
| --- | --- | --- |
| Moderate (current) | suppressed | reported |
| Substantial | suppressed | reported |

**Would refute / revise.** This is a policy, not an empirical claim. Revisit
when this project has its own held-out agreement figures (Gate 3).

**Status.** Open. The minimum band is a decision for the project owner.

**Where.** `data/report.json` `suppression_policy` and each `layers[].suppression`;
`scripts/validate-report.mjs`; `vendor/sandpiper/getKappaInterpretation.ts`.

---

## D-005 · EXTRAPOLATION · Zhou et al. taxonomy: preliminary version, unreported grades, overall-only reliability

**Status.** Retired 2026-09-17. The Zhou et al. tutor-move layer is not in Gate
0 (INTENT.md, "One layer, this gate"), so nothing applies the taxonomy and this
extrapolation is not live. It returns in Gate 1 as its own independent layer,
with its own provenance; the mismatches below will need fresh entries written
against whatever version is used then, rather than this one being reinstated.

**Note 2026-09-18.** The taxonomy is applied again, by Layer 2 (INTENT.md,
"Layer 2"; `codebook.tutor-moves.json` 1.0.0), and this entry stays retired as
it said it would. Its third mismatch, reliability reported for the full scheme
and not for the moves used, is entered afresh as D-028. The other two, a
taxonomy its authors call a living framework and grades and corpus counts the
authors do not report, have no fresh entry yet. The layer's provenance card
(`codebook.tutor-moves.json` `provenance`) states the living framework and the
missing corpus counts; it says nothing about grades.

*Original entry, kept for the record:*

**What.** Three moves from the tutor move taxonomy applied to grade 7 one-to-one tutoring.

**Why it's a mismatch.**

- The authors describe the taxonomy as preliminary and a living framework.
- The grade levels and corpus size of the coded sessions are not reported.
- Cohen's κ (.65, then .78) is reported for the taxonomy overall, not for the
  three moves shown (arXiv 2603.05778, p. 4).

**Would settle it.** Record the taxonomy version used. Report per-move Cohen's κ
from independent double-coding of grade 6–8 one-to-one tutoring.

**Where.** `data/report.json` layer `tutor-prompting-zhou-2026`, `not_validated_on`.

---

## D-006 · EXTRAPOLATION · Yue et al. taxonomy (layer suppressed)

**Status.** Retired 2026-09-17. The Yue et al. reasoning-act layer was removed
from the build and is in no planned gate, so no annotation, claim or suppression
decision rests on it.

*Original entry, kept for the record:*

**What.** The reasoning-act taxonomy is listed as a layer for tutoring.

**Why it's a mismatch.**

- It was developed on small-group collaboration among students, with classroom teachers facilitating (Yue et al., BEA 2026, §2.1–2.2).
- Labels were induced and applied by GPT-5.4.
- Two reviewers audited 100 turns; no human–human agreement is reported (Appendix C, p. 16).

**Would settle it.** Independent human double-coding of tutoring student turns
with all 20 acts, with chance-corrected agreement reported.

**Where.** `data/report.json` layer `reasoning-acts-yue-2026`. Suppressed under
D-002, so no annotations or claims exist for it.

---

## D-007 · OURS · Code subsets shown

**Status.** Retired 2026-09-17. Both taxonomies it subsets are out of Gate 0.
The one layer that ships uses all ten codes of `codebook.v2.json`, with no
subset and no display filter over codes — the summary view omits episodes whose
code has `content_related: false`, which is a different decision recorded in
docs/SPEC-gate0.md §3.

*Original entry, kept for the record:*

**What.** Six of 20 Yue et al. acts and three of 28 Zhou et al. moves, as named
in the Gate 0 brief.

**Why.** Scope of the Gate 0 brief.

**Consequence for later gates.** Coding must use the full taxonomy and filter
for display. Offering an annotator only the subset changes the task: Yue et al.
assign exactly one act per turn from all 20.

**Where.** `layers[].code_subset`, `layers[].annotation_schema_item.codes`.

---

## D-008 · OURS · Field keys

**Status.** Retired 2026-09-17. Neither key exists: both layers were removed,
and Gate 0's only annotation field is `EPISODE` on a session-level episode
record (docs/SPEC-gate0.md §5.3). Zhou et al. returns in Gate 1 as an
independent layer and will need a fresh entry for whatever field key it uses
then.

*Original entry, kept for the record:*

**What.** `DIALOGUE_ACT` (Yue) is our name.
`LEARNING_SUPPORT` (Zhou) follows Sandpiper's `codifyName` convention applied to
the source's family name, LEARNING SUPPORT.

**Why.** Sandpiper's annotation shape is `{ [fieldKey]: value }` and needs a key.

**Where.** `layers[].annotation_schema_item.fieldKey`; annotation objects.

---

## D-010 · OURS (upstream) · "Perfect" band and band use

**What.** Sandpiper's `getKappaInterpretation` returns "Perfect" at exactly 1.0,
which is not a Landis & Koch band. The bands themselves are
[SOURCE: Landis & Koch (1977), Biometrics 33(1):159–174]; the extra return value
is upstream's addition, and the vendored file's header says so.

**Revised 2026-09-17.** Still true of the vendored file, which is copied
verbatim and unchanged. What changed is its role here. Gate 0 computes no
kappa, so nothing calls the function and no band is applied to any value in this
project — there is no value to band. The file is kept because it is the citable
source of `AGREEMENT_THRESHOLD = 0.61`, the floor of the "substantial" band
(docs/SPEC-gate0.md §10 item 2, §5.4). It is the origin of a policy number, not
a measurement tool.

**Revised again 2026-09-17**, in the second pass of that date. The paragraph
above says nothing calls the function and no band is applied to any value here.
Something does now. A turn-level figure is computed (D-024), so the function
has a call site: the internal per-code view bands that value, and
`AGREEMENT_THRESHOLD = 0.61`, the floor of "Substantial", is compared against
it (D-020). Three things follow.

- The "Perfect" return is now reachable by a value this project produced — two
  tilings whose codes match on every pooled turn. It is still not a Landis &
  Koch band, and the vendored file's header still says so.
- Our wrapper (D-023) refuses the input that yields a 1 without any
  disagreement having been possible: fewer than two distinct codes across both
  label sequences. It does not otherwise change what either vendored file
  returns, and it neither clamps a value nor relabels a band.
- A band name is rendered only in the internal, non-learner-facing view, beside
  the value it interprets. Neither reaches a learner- or parent-facing surface
  (D-020, D-024). A band is a reading of two label sequences: not evidence
  about a learner, and not a claim that the model is validated.

**Would refute.** A band name, or a banded value, rendered on a learner- or
parent-facing surface. "Perfect" presented as a Landis & Koch band. A call to
either vendored file from outside the wrapper of D-023.

**Where.** `vendor/sandpiper/getKappaInterpretation.ts` header; NOTICE;
docs/SPEC-gate0.md §10 item 2 and §5.4. The call site is the internal per-code
view (docs/SPEC-gate0.md §7.3). (`scripts/validate-report.mjs`, named in the
original entry, belonged to the superseded 0.1.0 contract and has been
removed.)

---

## D-011 · OURS · Marking illustrative and synthetic data

**Revised 2026-09-17.** The hand-authored fixture this entry described is
superseded. Gate 0's demo data is generated, not hand-written, and is marked
`synthetic` rather than `illustrative`.

**Revised again 2026-09-17**, in the second pass of that date, on the two
points that the restored D1 and D6 falsify: a demo set now carries a simulated
annotation run beside its simulated sessions, and a human-authored label
exists.

**What.** Gate 0's demo sets are simulated tutor–student sessions, each
generated from a planted episode plan kept beside it. Every set carries
`data_provenance.status: "synthetic"` with a `ui_label`, and the label is
persistent in every view that renders the data (CLAUDE.md rule 6). Real
transcripts dropped in are `authentic`, labelled the same way, and are never
committed to the repo.

Two further constraints belong to the same decision:

- The planted plan is not compared with a run. It is the input to the demo
  set's simulated annotation run: D6 derives that run from the plan with
  controlled boundary and label noise, tuned so that one demo set lands above
  0.61 and one below (docs/SPEC-gate0.md D1, D6). A demo set's figure is
  therefore engineered by construction. It shows what the gate does on each
  side of the threshold, and it measures nothing
  [OURS: the noise parameters, and the choice to tune them to a side of the
  threshold]. The plan is also kept as written, so a reader can see what the
  generator intended.
- Generator fidelity and pipeline recovery are two quantities, not one. A
  figure computed between a demo set's simulated annotation run and its LLM run
  is neither of them, and is never reported as either — the more so because
  that annotation run descends from the planted plan (CLAUDE.md rule 6).
  Whenever either quantity is measured, it is reported separately and the two
  are never collapsed into one number.

Episodes carry `identifiedBy: "AI"` under an LLM run and `"HUMAN"` under an
annotation run (D-025). Simulated status stays on the run and never on the
episode, so a view rendering a demo set's figure reads the runs to know that
both sides of the comparison are simulated, and says so.

**Would refute.** Any view that renders report content without the label; a
validator pass over a file whose `status` is `synthetic` and whose `ui_label` is
absent (docs/SPEC-gate0.md §9.1); a rendered figure from a demo set that does
not say that both runs behind it are simulated.

**Where.** docs/SPEC-gate0.md §5.1, §7.1 item 8, §8, §9.1. `data/report.json` was
the superseded 0.1.0 fixture, marked `illustrative`, and has been removed.

---

## D-012 · DERIVED · Per-session counts over excerpts

**Status.** Retired 2026-09-17. It counts per-utterance annotations from the
removed layers, over transcript excerpts, in the superseded `data/report.json`.
Gate 0 counts episodes over full sessions. Replaced by D-017.

*Original entry, kept for the record:*

**What.** Counts of annotations per code per session, and claims of the form
"in sessions …", computed from annotations. Every session is an excerpt
(`transcript_scope: "excerpt"`), so counts are excerpt counts, not session totals.

**Tag.** [DERIVED: each source's codes → count per session; the operation is ours]

**Where.** `scripts/validate-report.mjs` summary output; `layers[].claims`; UI (next step).

---

## D-013 · OURS · Student agreement record

**Status.** Open, pending docs/SPEC-gate0.md §11, O-8: whether to keep this
control at all, now that every claim is about a session rather than about a
person. Carried into the Gate 0 data contract at §5.7 unchanged, and nothing
consumes the records.

**Note 2026-09-17.** The separate question — a tutor reviewing the model's
proposed episodes — is now designed in docs/SPEC-review.md. That is a later
gate and ships nothing in Gate 0; the only accommodation Gate 0 makes for it is
D-019. The record described here is a different record, with a different
responder and a different question, and the two are not merged. The
reviewer-identity question the original entry deferred to Gate 3 is now open in
docs/SPEC-review.md §10.

**What.** `schema/agreement-response.schema.json` holds one append-only record
per response:

- its own `response_id` and `responded_at`
- addressed by stable `claim_id`
- response: `agree`, `not_sure`, or `disagree`
- an optional comment

The only responder is the student. Nothing consumes these records yet.

**Why.** Sandpiper's `markedAs` / `votingReason` fields have no id and no
timestamp, are addressed by array index, and overwrite earlier votes.

**Would revise.** Reviewer-identity requirements, once they are settled.

**Where.** `schema/agreement-response.schema.json`; docs/SPEC-gate0.md §5.7.

---

## D-015 · OURS · Evidence selection

**Status.** Retired 2026-09-17. Its rules are per-move evidence rules for the
removed Zhou et al. layer, written against per-utterance annotations. Gate 0's
evidence unit is the episode's turn span, which is not a selection at all.
Replaced by D-018.

*Original entry, kept for the record:*

**What.** Evidence lists are:

- **Zhou PROMPTING_SELF_EXPLANATION:** the host turn only.
- **Zhou GIVING_ANSWER and PROMPTING_SELF_CORRECTION:** the host turn plus the
  preceding student turn.
- **All evidence:** stays within one session.

**Why.** Evidence lists the turns a reader needs in order to check the label.

**Where.** `annotations[].evidence`; `scripts/validate-report.mjs`.

---

## D-016 · OURS · Wording of claims and context notes

**Status.** Retired 2026-09-17. It governs the strings of the superseded
`data/report.json` 0.1.0 fixture, including a context note about a layer that
no longer exists. The wording constraint itself survives and is restated
against the generated text Gate 0 actually produces. Replaced by D-021.

*Original entry, kept for the record:*

**What.** All `title`, `summary`, `claims[].text` and `context_notes[].text`
strings. They describe episodes and name no type of student.

One note is ours, not sourced: `note-tutor-no-relationship`, which states that
no tutor–student relationship is computed.

**Would refute.** A failure of the wording lint (to be added with the UI).

**Where.** `data/report.json` `layers[]`.

---

## D-017 · DERIVED · Episode aggregates

**Note 2026-09-17**, second pass of that date. The aggregates are computed from
the episodes of the run the report is built from, which may be an annotation
run as well as an LLM run (D-025). Read the tag's "applied by the LLM run" as
"applied by that run": the arithmetic is the same either way, the separate
summary call still counts nothing itself, and where a report is built from an
annotation run there is no LLM tiling in the path at all.

**What.** Three aggregates are computed from a run's episodes, in code:

- the number of episodes per code per session
- episode length, in turns, and in seconds where the session has timestamps
- the location of each episode within the session's turn order

**Tag.** [DERIVED: Schoenfeld episodes via Li et al. (2025) definitions as
adapted in `codebook.v2.json`, applied by the LLM run → counted per code per
session, measured in turns and in seconds, and located in the session's turn
order; the operation is ours]

The LLM produces episodes and nothing else. A separate LLM call writes the
report summary from the aggregates it is handed, and counts nothing itself
(docs/SPEC-gate0.md D10). Every summary sentence carries the episodes it rests
on; a sentence that fails validation or the wording lint is dropped, not
rewritten silently.

**Why.** Episodes can shift quickly within a session, so the summary describes
aggregate trends across sessions rather than individual shifts (D5). Keeping the
arithmetic in code keeps the number and the sentence separable: a number can be
recomputed from the run files, and a phrasing can be regenerated without
changing a count.

**Replaces.** D-012, retired the same day, which counted per-utterance
annotations from the removed layers over transcript excerpts.

**Would refute.** A count in the report that recomputing from the run's
episodes does not reproduce; or a summary sentence carrying a figure that the
aggregates handed to it do not contain.

**Where.** docs/SPEC-gate0.md §6 step 4; rendered in §7.1 items 1–2 and §7.3.
The binning of episode location within the turn order is marked
[OURS] in §6 and is chosen in the build plan, not here.

---

## D-018 · OURS · Evidence is the episode's turn span

**Note 2026-09-17**, second pass of that date. Read "episodes of an LLM run"
below as "episodes of the run the report was built from", which may be an
annotation run (D-025). The two hops, the span rule and the bar on citing a
turn outside a span are unchanged.

**What.** Evidence resolves in two hops and no others. A claim carries
`evidence_episode_ids[]`, which resolve to episodes of an LLM run; an episode
carries `start_turn_id`, `end_turn_id` and an `evidence[]` list that is exactly
the contiguous turns of that span, both speakers included. Nothing selects a
subset of a span, and nothing cites a turn outside one.

**Why.** A reader checking a claim needs the turns the label was applied to, not
a sample of them. The unit coded is the collaborative process across both
speakers (INTENT.md), so evidence that showed one speaker's turns would not be
the thing the label was applied to. CLAUDE.md rule 7: no claim reaches a
learner-facing surface without an evidence link to the turns behind it.

**Replaces.** D-015, retired the same day, which set per-move evidence rules for
the removed Zhou et al. layer.

**Would refute.** A claim whose evidence does not resolve to an `episode_id`, an
episode whose `evidence` is not exactly its span's turns, a span crossing a
session boundary, or a claim citing a non-reportable session. `yarn validate`
rejects each of these.

**Where.** docs/SPEC-gate0.md §5.3 (episode record), §5.6 (`claims[]`), §9.1
(the checks); surfaced in §7.1 item 4, where an episode or claim opens its turn
span.

---

## D-019 · OURS · Stable episode ids and unwritten review fields

**Note 2026-09-17**, second pass of that date. The annotation interface now
ships in Gate 0 (D-025), so a human-authored episode exists. This entry is
unchanged by that. The annotation interface authors labels; it does not review
them, and it writes neither `reviewer_id` nor `reviewed_at`, which stay present
and `null` on every episode record of every run, human or LLM. "No hidden
review surface" below means the review screen of docs/SPEC-review.md —
stratified sampling, one question per episode, the model's label hidden before
the choice, the eleventh "This isn't one thing" button, the coarse segmentation
error rate — and none of that ships here.

**What.** Two things, and only these two, are the room Gate 0 leaves for the
review gate:

- `episode_id` is composed from the run id, the session and the episode's
  ordinal within that session (`ep-run-llm-001-s03-002`), so it is stable and
  addressable from outside the run that produced it.
- `reviewer_id` and `reviewed_at` are present on every episode record and are
  always `null`. No code path in Gate 0 writes either.

There is no hidden review surface, no disabled button and no stub endpoint.

**Why.** A review record has to point at one episode and keep pointing at it
across reads; an id derived from array position does not survive a re-run that
reorders the array, which is one of the four reasons docs/SPEC-review.md §8
gives for not building on Sandpiper's vote. Adding the two fields now costs
nothing and avoids a schema migration across every stored run later. This is a
deliberate exception to writing only what the current gate needs, and it is
recorded here because it is one.

**Would refute.** Two validator runs over the same report resolving an
`episode_id` to different episodes; a non-null `reviewer_id` or `reviewed_at` in
any Gate 0 output; a missing one. `yarn validate` rejects all three
(docs/SPEC-gate0.md §9.1, "Review fields").

**Where.** docs/SPEC-gate0.md §5.3, §7.2, §9.1; docs/SPEC-review.md, "What Gate
0 leaves room for, and only that", and §7.

---

## D-020 · OURS · Config-driven suppression state

**Revised 2026-09-17**, in the second pass of that date. The entry as first
written said the state is read from the demo set's config, `measured` always
`false`, `value` always `null`, `state` set by configuration alone, because
nothing computes a figure. Something does now (D-024), so the state is derived
from that figure wherever one exists. The heading is kept per this log's
conventions; it now names only the third of three states. What follows is the
current decision.

**What.** Three states, each visibly distinct from the other two.

| `measured` | `value` | `state` | When |
| --- | --- | --- | --- |
| `true` | the computed figure | `shown` | an annotation run and an LLM run both exist for this student, and the figure reaches `AGREEMENT_THRESHOLD = 0.61` |
| `true` | the computed figure | `suppressed` | both runs exist, and the figure is below 0.61 |
| `false` | `null` | read from config | no annotation run exists, so there is nothing to compare |

- The figure is the turn-level one of D-024: one annotation run against one LLM
  run, pooled over the turns of the student's reportable sessions, one per
  report (D7).
- Comparing it against 0.61 is the whole of the gate's logic. Nothing else
  moves the state between the first two rows.
- The third row is not a synonym for the second. "Nothing was annotated, so
  nothing was compared" and "a figure was computed, and it is below the floor"
  are different facts about the work. They get different copy and a visibly
  different state; a view that renders them alike is a defect, not a
  simplification.
- The gate acts on the value, and no reader outside the internal view sees it.
  A learner- or parent-facing surface carries the state, its reason and the
  threshold, never the number or its band (D-024, D-010).
- Where a source paper reports its own agreement figures, they are shown as
  that paper's, attributed, and never as ours. No source figure gates anything
  (D-002).
- Separate from the session gate (docs/SPEC-gate0.md §5.5), which asks whether
  a session has enough turns to report on. Two gates, two reasons, never
  merged.

**Why.** 0.61 is the floor of the "substantial" band
[SOURCE: Landis & Koch (1977), Biometrics 33(1):159–174, as implemented in
`vendor/sandpiper/getKappaInterpretation.ts`; see D-010]. Deriving the state
from the figure rather than from a flag is what makes this a gate rather than a
picture of one: with a real transcript and a hand-authored run dropped in (D8),
the layer surfaces or does not surface on what those runs produce, with no
configuration in between. The third state exists because having no annotation
run is the ordinary case here, and absence has to read as absence rather than
as a figure that came out badly.

[OURS: the three states, the rule that the third is visibly distinct from the
second, and the decision to let the figure gate what surfaces while keeping it
out of every learner- and parent-facing view.]

**Replaces.** D-002, retired 2026-09-17. The rule there selected a figure from
the source papers and mapped it to a band; the figure this gate acts on is
computed over this project's own transcripts, and no source figure is
consulted.

**Status.** Open, on one point only: docs/SPEC-gate0.md §11, O-10. INTENT.md
calls 0.61 "the most widely used threshold in discourse coding". That phrase
needs a source or an [OURS] tag wherever it reaches the UI. The threshold value
itself is settled and is not re-litigated.

**Would refute.** With `measured: true`, a `state` that does not follow from
`value` against `threshold`. A `measured: true` with a `null` value, or the
reverse. A `threshold` differing from config. A figure present where no
annotation run exists. A third-state rendering a reader could mistake for the
below-threshold one, or the reverse. Any rendering of `value`, or of its band,
on a learner- or parent-facing surface.

**Where.** docs/SPEC-gate0.md §5.4, §7.1 item 6, §9.1, §10 item 2; D-024 for
the computation, D-023 for the code it runs through. The §5.4, §9.1 and §10
text, and INTENT.md's "Agreement: policy, not evidence", still describe the
superseded config-only state and are being corrected separately.

---

## D-021 · OURS · Wording of report text

**What.** All generated report text — summary sentences, claim text, headings
and labels — takes the session or the work as its subject. Excluded
everywhere: noun phrases naming a type of student, comparison to other students
including implicit comparison ("typical", "average", "on track", "ahead",
"behind"), and learning-gain language ("improved", "progress", "mastered",
"understands", "knows"). Nothing framed as a deficit appears without something
actionable attached, or it is omitted.

Enforcement is a lint, not a review: `yarn lint:wording` runs over UI copy and
over generated report text against `lint/banned-phrases.json` [OURS], and fails
on any banned phrase and on any claim or heading whose grammatical subject is a
person pronoun or a display name. A generated sentence that fails is dropped,
not rewritten silently.

**Why.** INTENT.md's wording rules, which cite `docs/03-open-learner-models.md`:
person- and ability-focused feedback is documented there to induce fixed beliefs
about one's own ability and reduced persistence. INTENT.md states this is an
evidence-based constraint rather than a style preference, and specifies lint
rather than review as the enforcement, so the constraint holds on text generated
after anyone has stopped reading every line. The brief itself is not yet in the
repo (docs/SPEC-gate0.md §11, O-11), so the mechanism above is recorded here as
taken from INTENT.md, not from the source.

The rule follows from what the project measures. Episodes describe collaborative
problem-solving work across both speakers; no claim here attributes a behaviour
to one participant, so a sentence with a person as its subject would assert
something the codebook refuses (INTENT.md, "What is measured, and what is not").

**Replaces.** D-016, retired the same day, which stated the same constraint
against the hand-authored strings of the superseded fixture.

**Would refute.** A banned phrase, or a claim or heading with a person as its
grammatical subject, reaching a rendered view with the lint passing. The lint is
checked by running it against copy carrying each banned phrase and confirming
each one fails.

**Where.** docs/SPEC-gate0.md §9.2, §6 step 4 (the per-sentence gate), §1 done
criterion 5; INTENT.md, "Wording rules"; `lint/banned-phrases.json` (not yet
written).

---

## D-022 · EXTRAPOLATION · Setting: chain-of-thought sentences → tutoring turns

**What.** Gate 0's one analysis layer applies operational definitions written
for a different setting. `codebook.v2.json` records the mismatch in its own
`note_on_adaptation` and in each code's `adaptation` field: the source guidebook
annotates SENTENCES in one reasoning model's chain-of-thought, and this repo
annotates TURNS in a dialogue between a tutor and one or more students. Two
adaptations run through every code and are not optional — the unit is a turn
rather than a sentence, and the actor is the participants jointly rather than a
single solver.

Three codes (organization, writing, digression) come instead from a study that
coded video of problem-solving, and carry their own `deviation_from_paper`
notes. One of them, `writing`, was defined there by a thirty-second duration
threshold that has no analogue in a text-only log, which is why it is
unavailable when `has_timestamps` is false.

**Tag.** [EXTRAPOLATION: operational definitions validated on a reasoning
model's chain-of-thought sentences, applied to turns of collaborative tutoring
dialogue → what would settle it is below]

**Why it's a mismatch.**

- A chain of thought is one voice reasoning alone. A tutoring session is two or
  more voices, and an episode here spans both speakers by design (INTENT.md).
  Keyword cues written in a lone solver's voice ("Let me check") read in
  dialogue as either speaker's, including a tutor prompting a student.
- A sentence is authored; a turn is taken. Turn length, interruption and
  overlap have no counterpart in the source setting, and they are what boundary
  placement has to survive here.
- The source setting has no platform talk, no session logistics and no
  off-topic conversation. Those are three of the ten codes here, and their base
  rates depend on how a session was recorded rather than on the mathematics in
  it.
- Episode boundaries are the hard problem and the main source of unreliability
  (INTENT.md). No evidence exists that boundaries placed under these
  definitions are placed consistently in this setting.

**Would settle it.** Independent double-coding of tutoring transcripts under
these definitions, reported per code and for boundary placement, on held-out
sessions. No such coding exists for this project and none is planned in Gate 0:
there are no human annotators here and no agreement statistic is computed
(INTENT.md; CLAUDE.md rule 4). Until it exists, the layer carries the
suppression state (D-020) and the report makes no validity claim.

**Note 2026-09-17**, second pass of that date. The clause above saying no
agreement statistic is computed is superseded: a turn-level figure between one
annotation run and one LLM run is computed internally (D-024). It does not
settle this entry and is never offered as doing so. What would settle it is
still what the paragraph above describes — independent double-coding under
these definitions, reported per code and for boundary placement, on held-out
sessions. One annotation run compared against a model run is neither
independent double-coding nor held out (CLAUDE.md rule 4), and a turn-level
figure says least about the boundary placement this entry calls the hard
problem. The layer still carries the suppression state and the report still
makes no validity claim.

**Status.** Open, and the entry itself is provisional in one respect. It is
written from text already in this repository — `codebook.v2.json`'s
`note_on_adaptation`, `adaptation` and `deviation_from_paper` fields — and not
from the source papers, which are not in `docs/SOURCES.md` and have not been
opened (docs/SPEC-gate0.md §11, O-3). Settling O-3 may add detail here; it is
not expected to remove the mismatch, which the codebook states plainly.

**Where.** `codebook.v2.json` `note_on_adaptation`, and each code's `adaptation`
and `deviation_from_paper`; docs/SPEC-gate0.md §3 and §11, O-14; INTENT.md,
"One layer, this gate". It reaches the reader through the provenance card's
setting-extrapolation line (docs/SPEC-gate0.md §5.6).

---

## D-023 · OURS · Vendoring `calculateCohensKappa.ts`, and the wrapper over it

**What.** Sandpiper's `app/modules/evaluations/helpers/calculateCohensKappa.ts`
is copied verbatim, below an origin header and listed in NOTICE, to
`vendor/sandpiper/calculateCohensKappa.ts`, beside the already-vendored
`getKappaInterpretation.ts`. Like that file it has zero imports. It takes two
arrays of label strings and returns Cohen's κ. It is vendored on the owner's
instruction, 2026-09-17: "compute kappa internally. use sandpiper for this."
It therefore moves out of the not-taken list — docs/LAY-OF-THE-LAND.md §3(c)
listed it among the metric helpers — and into §3(a), which until now named one
file. Two files are now copied; nothing else is.

**Two defects in the upstream file**, verified against the source at commit
b437988 rather than taken from a summary:

- It returns `1` when expected agreement is 1 (`:37`). Expected agreement
  reaches 1 only when a single distinct label appears across both sequences, so
  two runs that label every turn with the same one code score a perfect 1
  although no disagreement was ever possible. (Upstream this surfaces as two
  runs that annotate nothing scoring 1, because there `""` is a label; under
  our tiling every turn carries a code, so the same defect arrives in the
  one-code form.)
  [OURS (upstream): the early return is the upstream's, not ours.]
- It returns `0` on a length mismatch (`:6`), and on empty input (`:5`), rather
  than raising. A caller passing misaligned sequences gets a number that reads
  as chance agreement.
  [OURS (upstream)]

**Our wrapper.** [OURS: refusing rather than returning, and the three refusal
conditions.] A thin wrapper is the only call site. It raises, rather than
returning a number, when the two sequences differ in length, when either is
empty, or when fewer than two distinct codes appear across the two sequences
together. Otherwise it calls the vendored function unchanged and returns
exactly what that function returns. It does not repair, clamp, round or adjust
any value, and it does not fix the vendored file.

**Why.** Copying it verbatim keeps the arithmetic citable and keeps the copy
honest as a copy; editing it in place would make it a fork while still carrying
an upstream attribution. But a copied defect is still a defect at our call
site, and both defects reach D-020's gate: a 1 from two runs that never had
anything to disagree about would clear 0.61 and surface a layer, and a silent 0
from misaligned sequences would suppress one. Refusing both inputs leaves the
vendored file untouched and stops a wrong number reaching the gate. Under
tiling (D4) the sequences cannot differ in length unless a run fails to tile
the sessions it claims, which the validator already rejects
(docs/SPEC-gate0.md §9.1), so that refusal is a backstop rather than a routine
path.

**Would refute.** A call to either vendored file from outside the wrapper. A
wrapper that returns a number for unequal-length input, for empty input, or for
a single distinct code. A vendored file differing from upstream b437988 by
anything but its header. Each is checked: the wrapper is exercised with all
three inputs and must raise on each, and the copy is diffed against
`reference/sandpiper`.

**Where.** `vendor/sandpiper/calculateCohensKappa.ts` and the wrapper, neither
yet written; NOTICE; docs/LAY-OF-THE-LAND.md §1.6 "Kappa edge cases", §3(a) and
§3(c); docs/SPEC-gate0.md §10. Used by D-024, banded by D-010, and gating in
D-020.

---

## D-024 · DERIVED · Turn-level agreement between one annotation run and one LLM run

**Note 2026-09-18.** The first bullet below, that every turn carries exactly
one code under each run, now holds for the LLM run only. An annotation run may
leave turns unmarked, and both sequences are built over six classes rather than
the codebook's codes: the five `in_problem_process` codes and
`not_problem_solving` (D-026). The sequences stay equal-length and aligned,
because an unmarked turn gets the residual label rather than being dropped. In
**Pool**, "sessions both runs tile" now reads "sessions in which both runs have
an episode". A session whose annotation run has no episode at all is out of the
pool; docs/SPEC-gate0.md §11, O-34 asks whether it should be. The rest stands.

**What.** One figure per report, computed internally and never displayed to a
learner or a parent.

- **Unit: the turn.** Under each run's tiling every turn of a session belongs
  to exactly one episode (D4), so each turn carries exactly one code under each
  run. Expanding both tilings to one code per turn gives two equal-length,
  positionally aligned label sequences, which is what the vendored function
  expects (D-023).
- **Two runs, named.** One annotation run against one LLM run (D-025). Not
  three runs, no mean over pairs, and no run compared with the generator's
  planted plan (D-011).
- **Pool.** The turns of the student's reportable sessions that both runs tile,
  ordered by `session_index` and then by the session's turn order, concatenated
  into one comparison. One figure per report (D7), not one per session.
- **Rendered.** In the internal per-code view only (docs/SPEC-gate0.md §7.3),
  beside a side-by-side rendering of the two tilings and a per-code breakdown,
  with its band (D-010). It reaches no other surface.
- **Consumed.** By the agreement gate, which compares it against
  `AGREEMENT_THRESHOLD = 0.61` (D-020).

**Tag.** [DERIVED: two tilings of the same turns, one from an annotation run
and one from an LLM run → expanded to one code per turn per run, pooled over
the turns of the student's reportable sessions, and passed to Cohen's κ as
implemented in `vendor/sandpiper/calculateCohensKappa.ts` → one figure per
report. The arithmetic is the upstream's; every choice around it is ours.]

**Ours, named:** the turn as the unit of comparison; expanding a span-level
tiling into per-turn labels; pooling across sessions instead of reporting one
figure per session; restricting the pool to reportable sessions and to sessions
both runs tile; comparing exactly two runs; and the decision that this figure
gates what surfaces without ever being shown. (Upstream counts only sessions
marked DONE in every run, docs/LAY-OF-THE-LAND.md §1.6, which is the analogous
rule; its code is not taken.)

**Why the turn.** The episode is the unit of the work, but two tilings of one
session share no common set of spans to compare — where the boundaries fall is
exactly what differs, and INTENT.md calls boundary placement the hard problem
and the main source of unreliability. The turn is the finest unit both tilings
address, and comparing at the turn level is the only way to get aligned
sequences without treating one run's boundaries as the truth. The cost is that
a turn-level figure is least sensitive to the thing that matters most here: two
tilings whose boundaries differ throughout can still agree turn by turn. Whether
a boundary measure is reported alongside it is open (docs/SPEC-gate0.md §11,
O-18) and gates nothing either way.

**What this figure is not.** It is a number about two label sequences.
Specifically it is not: evidence about a learner; a measurement of how
consistently the codebook is applied in this setting, since one run by one
annotator is not an inter-rater study; a held-out figure, since it is computed
over the same sessions the report is built from, and CLAUDE.md rule 4 forbids
reporting a development-set number as ours — which is part of why it stays
internal; or a validation of the model. The owner's clarification, 2026-09-17:
the repo "should compute a kappa but not show it; when I said 'no kappa will
computed' I meant that I wouldn't be trying to claim that the LLM has already
been validated. this serves as a pipeline TO do the validation." So: the
apparatus, not the validation.

**Would refute.** A figure computed from sequences of unequal length, or from
fewer than two distinct codes (the wrapper raises, D-023). A figure whose pool
includes a non-reportable session, or a session only one run tiles. A figure
spanning more than one student, or more than two runs. Any rendering of the
value or its band on a learner- or parent-facing surface. Any presentation of
it as measured reliability or validity, as evidence about a learner, or as
evidence that the model is validated.

**Where.** docs/SPEC-gate0.md D7, §5.4, §7.3; `vendor/sandpiper/` and the
wrapper (D-023); the gate is D-020; the demo-set caveat is D-011. §7.3
currently says no agreement figure is computed and is being corrected
separately.

---

## D-025 · OURS · The annotation interface, and a run as a source the report is built from

**Note 2026-09-18.** Revised by D-026. The surface no longer asks for a tiling.
The dropdown offers the five `in_problem_process` codes, save accepts a marking
that leaves turns unmarked and refuses one whose stretches overlap, and
touching stretches with one code are saved as one episode. In **What.**, "saves
the finished tiling" and "Save refuses an incomplete tiling (D4)" no longer
hold. In **Would refute.**, "a saved annotation run whose episodes do not tile
the session, or leave a turn uncovered" is replaced by "a saved annotation run
with overlapping stretches, or with a code outside the five". The one question
the surface asks is no longer "what is the tiling of this session?" but "where
is the problem-solving work in this session, and what kind is it?". It is still
not the review screen.

**What.** An authoring surface ships in Gate 0. It opens one session, selects a
contiguous range of turns, assigns one code from a dropdown generated from
`codebook.v2.json`, shows which turns of the session are still uncovered, and
saves the finished tiling as a run stamped with `codebook_version`. Nothing
else: no sampling, no proposed label, no judgement of anyone else's label.

A run saved this way has the same shape as an LLM run. `runs[]` gains a second
`kind`; its episodes sit in the same session-level `annotations[]` with the same
fields; `episode_id` is composed the same way (docs/SPEC-gate0.md §5.3);
`identifiedBy` is `HUMAN`; `reviewer_id` and `reviewed_at` stay `null`, because
this surface authors labels rather than reviewing them (D-019). Save refuses an
incomplete tiling (D4). The dropdown offers only codes of the run's
`codebook_version`, and drops `writing` when the session has no timestamps
(INTENT.md; docs/SPEC-gate0.md §4).

**A run is a source the report can be built from.** Either kind of run can be
the report's source: the aggregates (D-017), the claims and their evidence
(D-018) and the rendered views read a run, not specifically an LLM run. The
provenance card names the run the report was built from — its `run_id`, its
`kind`, its `codebook_version` and whether it is simulated — so a reader can
tell whose tiling the report describes, and a report built from hand-authored
labels is never mistaken for one built from model output, or the reverse.

**What it is not.** Not the episode review screen of docs/SPEC-review.md, and
it must not be described as one. This screen shows every turn of a session and
asks for a tiling; that one shows a sampled span and asks a single question
about a label the model proposed, with the model's label hidden until the
answer. None of the review design ships here: no stratified sampling, no hidden
proposed label, no eleventh "This isn't one thing" button, no reviewer
identity, no coarse segmentation error rate.

**Why.** D8 requires the project to be functional if real data were dropped in,
and names two end products: an annotation interface a tutor can use, and the
report. D3 as written said no annotation interface ships, which conflicted with
D8; the owner corrected D3 on 2026-09-17: "I just won't have real annotators to
use it, but I should be able to become an annotator and influence the data." An
authoring surface whose output the report can be built from is what makes both
ends of D8 real — a real transcript can be tiled by hand and reported on from
those labels, with no model in the path — and it is also what gives D-024 a
second sequence to compare. Keeping the surface to one question (what is the
tiling of this session?) is what keeps it distinct from the review screen
rather than a first draft of it.

[OURS: the surface, the requirement that a saved tiling be complete, the
provenance card naming the source run, and the rule that a report may be built
from either kind of run.]

**Would refute.** A report whose provenance card does not name the run it was
built from, or that does not say when that run is simulated. A report path that
requires an LLM run, or an annotation run the report cannot be built from. A
saved annotation run whose episodes do not tile the session, or leave a turn
uncovered. A non-null `reviewer_id` or `reviewed_at` written by this surface. A
dropdown code outside the run's `codebook_version`, or `writing` offered for a
session without timestamps. Any description of this screen as a review screen.

**Where.** docs/SPEC-gate0.md D3 (as corrected), D8, §5.3 `runs[]` and the
episode record, §5.6 `provenance_card`; docs/SPEC-review.md, "What Gate 0
leaves room for, and only that", which is unchanged; D-017, D-018, D-019,
D-024. §2 "Out" and §7.2 of docs/SPEC-gate0.md still exclude an annotation
interface and are being corrected separately.

---

## D-026 · OURS · Five codes a tutor marks and a reader sees; the other four merged into one class for comparison

**What.** One decision with three parts.

- **What a reader sees.** The codebook flags five of its nine codes
  `in_problem_process: true`: analysis, planning, implementation, exploration,
  verification. Only those five reach a learner- or parent-facing surface
  (codebook 2.2.0, `note_on_in_problem_process`). A code the live codebook does
  not carry is treated as outside the five (`app/data.ts` `isProblemProcess`).
- **What a tutor marks.** The same five, and nothing else, and a tutor may leave
  any turn unmarked (docs/SPEC-gate0.md D17, 2026-09-18). Reading, monitor,
  organization and digression are never offered in the tutor's dropdown or
  guide. The model still tiles every turn with all nine. That is how it
  segments, and a gap in its run is still a defect.
- **How the two are compared.** Both runs are mapped to six classes for the
  turn-level κ of D-024: the five codes, and one residual,
  `not_problem_solving`. On the tutor's side an unmarked turn is the residual.
  On the model's side a turn coded reading, monitor, organization or digression
  is. κ is computed over those six through the same wrapper (D-023). The
  residual is never written into a run file and never shown to a reader. It
  appears only in the agreement object's per-code breakdown, for the internal
  view.

**Departure from the sources.** Reading and monitor are problem-solving
categories in the sources this layer cites. Reading is one of Schoenfeld's
episode types, and monitor is Li et al.'s addition, one of the seven categories
of their guidebook [SOURCE per `codebook.v2.json` `origin`: Li et al. (2025)
App. E §1 and §7; `note_on_content_related`]. This project never asks a tutor
for either, never shows either to a reader, and merges both into the residual,
with organization and digression, when the runs are compared. Each code keeps
its definition and its `origin`; what changes is who is asked for it, who sees
it, and what it counts as in the comparison.

**Tag.** [OURS: the five-code split, the rule that a tutor is asked for those
five only, and the residual class. No definition is changed or merged.]

**Not CROSS-STUDY, and why.** The residual groups two codes whose origin is Li
et al. with two whose origin is Rott et al., under one label that has no origin
of its own. That looks like a combination across sources. It is not one in the
sense of CLAUDE.md rule 1. The residual has no definition: it is the complement
of the five, and all five come from Li et al. (2025) App. E. So the comparison
uses no Rott et al. definition directly, and is less mixed than the nine-code
comparison it replaces. One qualification: the model still applies Rott et
al.'s definitions when it segments, so they decide which of the model's turns
land in the residual. Recorded here so the owner can overrule the call.

**Why.** The owner's words, 2026-09-18: "the tutor shouldn't have to annotate
every line to be able to save the annotation", and "I don't think it's helpful
to ask the user to be coding read, monitor, organization, and digression.
Eliminate these features from tutor-facing annotations." Three reasons follow
from those.

- A reader is shown five codes. Asking a tutor to label the other four spends
  the tutor's time on labels no reader sees, and made saving wait on labelling
  talk that is not the subject.
- The model keeps all nine because segmentation needs somewhere to put talk
  that is not problem solving. Otherwise that talk is absorbed into the
  neighbouring episodes (`note_on_content_related`).
- Six classes is the only comparison the two runs support. A tutor supplies
  nothing for the four, so a nine-way comparison would count every turn the
  model called reading or monitor as a disagreement with a turn the tutor was
  never asked about.

**What it costs.**

- Per-code agreement for reading, monitor, organization and digression is gone,
  because a tutor never marks them. What the model does with them can be seen in
  its tiling in the internal view, but it is not measured. D4's reason for
  keeping them, "so model inference on them can be tracked", now holds only by
  inspection.
- Confusions among the four no longer count as disagreement, and a turn both
  sides leave outside the five counts as agreement although the tutor did
  nothing to it. Whether the residual inflates or deflates κ is
  docs/SPEC-gate0.md §11, O-33.
- An unmarked turn cannot be told apart from one nobody read, and a marking with
  no stretches drops its session from the pool: O-34.
- The figure is not comparable with one computed over nine codes. No source
  reports a figure to compare it with in any case (D-020).

**Would refute.**

- A tutor-facing dropdown or guide that offers reading, monitor, organization or
  digression. A saved annotation run that contains one of them.
- A learner- or parent-facing surface that draws, names or counts one of the
  four.
- A save refused because turns are unmarked. A save accepted with overlapping
  stretches.
- An LLM run with a gap that is accepted or scored.
- A κ computed over labels other than the six classes. A residual label written
  into a run file.
- Against the reading of an unmarked turn: evidence that tutors' unmarked turns
  regularly include problem-solving work they did not get to. The residual
  would then mean "not read" rather than "not problem solving".
- Against the departure from the sources: a session whose work was mostly
  reading or monitoring, which the report renders as a few short stretches with
  nothing shown between them, in a way a reader takes as the whole session.

**Status.** Open on O-33 and O-34. Two notes in `codebook.v2.json`
(`note_on_content_related`, `note_on_editing`) still describe an annotator who
applies every code. Changing them is a codebook edit and a version bump:
docs/SPEC-gate0.md §11, O-35. This entry is what `note_on_in_problem_process`
points at with its "[OURS: docs/DEVIATIONS.md]" tag. Until 2026-09-18 this log
had no entry for it.

**Where.** `codebook.v2.json` `in_problem_process` on each code, and
`note_on_in_problem_process`; `src/codebook/load.ts` `problemProcessCodes()`;
`app/data.ts` `isProblemProcess`; `src/server/api.ts` `putAnnotation` (accepts
unmarked turns, refuses a code outside the five and refuses overlaps, joins
touching same-code stretches); `src/agreement/gate.ts` `pairedLabels`,
`comparedLabels`, `NOT_PROBLEM_SOLVING`; `src/generator/sets.ts` (the simulated
annotator marks the five only); `scripts/check-agreement.ts` cases L and L2;
`app/Report.tsx` and `app/Schematic.tsx` (the reader-facing filter);
`scripts/validate.ts` (a gap is a defect in a model run only). As of this
entry, `scripts/validate.ts` does not reject an annotation run that carries a
code outside the five; the endpoint does. docs/SPEC-gate0.md D4, D17, §3, §4,
§5.3, §5.4, §7.2, §7.3, §8, §9.1, O-33, O-34, O-35; INTENT.md, "The codebook".

---

## D-027 · CROSS-STUDY · Whose turn opened an episode, beside a codebook that gives episodes to the participants jointly

**What.** Layer 2 takes each problem-solving episode in the model's run whose
first turn is a student's, and codes the one turn before it (D-029). That rests
on a claim about whose turn opened the episode and, where the turn before is
the tutor's, about what that turn did. The episode codebook makes no claim of
that kind. It attributes an episode to the participants jointly and declines to
assign the work to a speaker: a tutor asking "what should we do first?" and a
student answering is one planning episode.

**Tag.** [CROSS-STUDY: Rott et al. (2021) + Zhou et al. (2026) → a claim about
whose turn opened a problem-solving episode, and what the tutor's turn before
it did, set beside an episode layer that attributes each episode to the
participants jointly; the two sit in separate layers, with separate provenance,
and are never combined into one statement about the student]

**Where the joint attribution is written.** The owner's tag names Rott et al.
(2021). In this repo the attribution is stated in `codebook.v2.json`
`unit_of_analysis` and `note_on_adaptation`, as an adaptation of Li et al.'s
(2025) definitions to dialogue (D-022). Recorded so the tag can be checked
against the codebook, not to change it.

**Why.** The owner's specification for Layer 2 calls this "a real tension, not
a refinement". Its justification, also the owner's: the two claims are kept in
separate layers with separate provenance, and the report never combines them
into a single statement about the student. INTENT.md ("Layer 2") and CLAUDE.md
rule 13 were amended on 2026-09-18 to permit one boundary sentence, inside this
layer and behind its own agreement gate, and nothing wider. Rule 8 still holds
for it, so the stretch of work is the subject: "This stretch of <kind of work>
opened on the student's turn." and, only where the turn before is coded NONE
(D-030), "…opened on the student's turn, with no prompt in the turn before it."

**What it costs.**

- Speaker role now matters at one point, the first turn of a problem-solving
  episode, in a construct whose unit says speaker role does not bound an
  episode. Where the model places a boundary one turn early or late, the
  opening turn changes, and so does whether there is an item at all.
- The layer inherits the episode layer's boundary errors. Its items come from
  the model's run, and its own agreement compares codes for the turns before
  the model's boundaries. It says nothing about whether those boundaries are
  right.

**Would test it.** The owner's test: whether human coders asked "who opened
this episode" agree at a rate comparable to their agreement on the episode
label itself.

**Would refute the justification.**

- Learner- or parent-facing copy that combines the two layers into one
  statement about the student, or says the student decided, chose, led or
  initiated anything. "Unprompted" or "took initiative" anywhere in the copy.
- An index, score or crosswalk computed across the two layers.
- A Layer 2 sentence on the Student Report while the layer's own pooled κ is
  below 0.61, refused, or not measured (D-031).

**Status.** Open. The owner's test has not been run.

**Where.** INTENT.md, "Layer 2"; CLAUDE.md rules 8 and 13;
`codebook.tutor-moves.json` `note_on_independence`; `src/moves/items.ts`
`selectItems`, `isStudent`, `isTutor`; `src/contract/types.ts`
`Episode.tutor_prompting` and `TutorPrompting`; `src/moves/agreement.ts`, which
keeps its own figure and shares no pool with `src/agreement/gate.ts`.

---

## D-028 · OURS · Three codes taken from a twenty-eight-code taxonomy

**What.** Layer 2 takes three moves from the NTO Tutor Move Taxonomy (Zhou,
Vanacore, Thompson, St John & Kizilcec, 2026, arXiv:2603.05778v1, Table 1):
PROMPTING_SELF_EXPLANATION, PROMPTING_SELF_CORRECTION and GIVING_ANSWER. The
names are verbatim from Table 1. Each code's meaning is stated in this
project's own words in `codebook.tutor-moves.json`, with its origin cited,
rather than copied from the authors. The taxonomy's other twenty-five moves are
not coded one by one; a turn that carries one of them is coded OTHER_TUTOR_MOVE
or NONE (D-030).

**Tag.** [OURS: three codes used from a twenty-eight-code taxonomy. The
authors' reported agreement is for the full scheme; a subset's reliability is
not established by it.] The wording is the owner's.

**Agreement as the authors report it.** Two veteran teachers coded with the
full scheme. Cohen's κ was .65 in the first round and .78 in the second round,
after clarifications and minor alterations (arXiv:2603.05778v1, p. 4). Both
figures are the authors', both are shown, and neither is this layer's. This
layer's own figure is computed separately (D-031); none has been established in
this project.

**Why.** The owner's choice, in the specification for Layer 2. The
specification does not say why these three, and this entry does not supply a
reason.

**What it costs.**

- The authors' κ does not transfer. It is for twenty-eight moves in four
  families; three of them plus two codes of ours is a different scheme, with
  different marginals.
- The three meanings are paraphrases. Where a paraphrase narrows or widens a
  move, the model and a tutor apply this project's reading, not the authors'.
- The authors report no per-move agreement for any of the three.

**Would refute.**

- Any surface that shows .65 or .78 as this layer's agreement, or shows .78
  without .65.
- Evidence that the three cannot be coded apart from the rest of the taxonomy:
  coders using all twenty-eight and coders using this layer's five often
  disagreeing about which turns carry one of the three.

**Would settle it.** Per-code Cohen's κ for the three, from independent
double-coding of one-to-one tutoring transcripts of the kind this project
takes, reported held-out.

**Status.** Open.

**Where.** `codebook.tutor-moves.json` `source`, `provenance` and each code's
`origin`; `src/moves/codebook.ts`; `src/moves/classify.ts`
`movesCodebookBlock`, which gives the model the codebook's definitions and
include and exclude lists; NOTICE §2 and §3; docs/CITATIONS.md, "Layer 2";
D-005, retired, for the earlier version of this point.

---

## D-029 · OURS · A one-turn window

**What.** Only the turn immediately before a student-opened problem-solving
episode is examined. If that turn is the tutor's, it is classified. If it is a
student's, `tutor_move` is null and nothing is classified. An episode that
opens the session has no turn before it and yields no item. Boundaries come
from the model's run, and only episodes coded with one of the five
problem-solving codes count.

**Tag.** [OURS: only the immediately preceding turn is examined. A one-turn
window is a convenience, not a theoretical claim about how far tutor influence
reaches.] The wording is the owner's.

**Why.** The owner's specification. That a student's turn opened an episode
says nothing about whether the tutor prompted it; this layer supplies evidence
about one turn, and the report sentence names that one turn: "in the turn
before it".

**What it costs.**

- A prompt two or more turns earlier, a pause, or a tutor who waited is not
  seen. Any of them may still have shaped what followed. NONE says only that
  the one turn before carried no prompt.
- Where the turn before is a student's, the layer records who spoke and
  nothing else, and licenses no sentence beyond "opened on the student's turn".

**Would refute.** Coding the two or three turns before the same items, and
finding that many items coded NONE have a prompt just before that turn. The
sentence would then be true of its one turn and still mislead a reader about
the stretch.

**Status.** Open.

**Where.** `src/moves/items.ts` `selectItems` and its header comment, which
points here; `codebook.tutor-moves.json` `unit_of_analysis`;
`src/contract/types.ts` `TutorPrompting`.

---

## D-030 · OURS · OTHER_TUTOR_MOVE and NONE

**What.** Two codes of ours beside the three from Zhou et al. (D-028), making
five.

- OTHER_TUTOR_MOVE: any other tutor move that invites, directs or supplies
  content for the next piece of work. Next-step prompts, hints and probing are
  included.
- NONE: the tutor's turn contains no such move at all.

Only NONE licenses "…opened on the student's turn, with no prompt in the turn
before it." Neither code has a source. Their definitions are in
`codebook.tutor-moves.json` and nowhere else.

**Tag.** [OURS: with the three named codes and NONE alone, NONE would absorb
every other prompting move, and the report sentence would be false exactly
where it is most often said. Owner decision D-A, 2026-09-18.]

**Why.** Owner decision D-A amends the specification, which had four codes: the
three, and NONE for a tutor turn that is none of them. As specified, NONE would
have taken in PROMPTING_NEXT_STEP, GIVING_HINT, PROBING_UNDERSTAND,
PROBING_PRIOR_KNOWLEDGE, PROMPTING_ALTERNATIVE_REPRESENTATION,
PROMPTING_RELATED_CONCEPTS and ASKING_TO_CLARIFY_CONTEXT, all moves in the
taxonomy, so "no prompt in the turn before it" would have been said of turns
that carried one.

**Where the line falls is ours.** The taxonomy has no category for a move that
invites, directs or supplies the next piece of work. Which of its other
twenty-five moves count as one is this project's judgement. Read against the
taxonomy's move names, the codebook's include lists put explanations and
examples (EXPLAINING_CONCEPTUAL, EXPLAINING_PROCEDURAL, GIVING_EXAMPLE) in
OTHER_TUTOR_MOVE, and feedback on correctness, praise and social talk
(FEEDBACK_CORRECT, FEEDBACK_INCORRECT, PRAISING_OUTCOME, PRAISING_PROCESS,
PRAISING_TRAITS, BUILDING_RAPPORT) in NONE. The codebook does not name the
authors' moves; that reading is this entry's.

**What it costs.**

- NONE claims an absence within one turn, and it rests on the line above. A
  bare "not quite" is NONE (the codebook's exclude list for
  PROMPTING_SELF_CORRECTION puts it there), although a reader may hear it as a
  request to try again.
- OTHER_TUTOR_MOVE is a residual with no definition of the authors' behind it,
  and it pools unlike moves: a hint and a request to clarify are one code here.
- A κ over five codes, two of them ours, is not comparable with any figure the
  authors report (D-028).

**Would refute.**

- A tutor and the model often splitting the same items between NONE and
  OTHER_TUTOR_MOVE, in this layer's per-code agreement. The one sentence rests
  on that line being drawn consistently.
- Evidence that tutors routinely read a bare "not quite" as a request to try
  again. NONE would then carry prompts, and the sentence would overstate.
- "With no prompt in the turn before it" shown for any code but NONE, or on
  the Student Report while the layer is below its gate.

**Status.** Open.

**Where.** `codebook.tutor-moves.json` `note_on_none` and the codes
OTHER_TUTOR_MOVE and NONE; `src/moves/codebook.ts` `NO_PROMPT`; INTENT.md,
"Layer 2"; CLAUDE.md rule 13.

---

## D-031 · OURS · Item floors for this layer's agreement

**What.** Layer 2's Cohen's κ, between a tutor's marks and the model's codes
for the same items, goes through the same wrapper as the episode layer's
(`src/agreement/kappa.ts` `agreementKappa`, over the vendored calculator,
D-023), in the same three states, with floors of its own, counted in items
rather than turns:

- `moves.minItemsForAgreement`: 15, for the pooled figure. The pooled figure
  is the one the gate acts on: the layer reaches the Student Report only when
  it is at or above 0.61 (owner decision D-B, 2026-09-18).
- `moves.minItemsForSessionAgreement`: 4, for one session's figure.

Below a floor the wrapper refuses rather than returning a number. An item
counts only when it has both a model code and a tutor mark. An item the tutor
has not marked yet is left out, not treated as a class of its own
(`src/moves/agreement.ts`, header comment).

**Tag.** [OURS: placeholder values with no source. The episode floors, 100
turns pooled and 30 per session, count turns and do not transfer: a session
yields a handful of items, one per problem-solving episode that a student's
turn opens.]

**Why.** Owner decision D-B: this layer gets its own floor for how many items a
κ needs, because the episode floors are in turns; the values are placeholders
in `config/gate0.json`, tagged OURS, and this entry says so.

**What it costs.**

- [OURS: illustrative arithmetic, not a finding.] At 15 items, one changed mark
  moves observed agreement by 1/15, and κ by that divided by (1 − expected
  agreement): about 0.11 when expected agreement is 0.4. A pooled figure near
  0.61 on so few items can cross the threshold on one mark.
- With few items, both sides using one code throughout is likelier. The
  wrapper refuses that case rather than scoring it 1 (CLAUDE.md rule 4).
- At 4 items a session's figure is a working aid at most. It is not the figure
  the Student Report gate acts on.

**Would settle it.** Values chosen from how wide an interval around κ the owner
will accept at a given number of items, or from how far the pooled figure moves
as items are added to a real annotation set. Either would replace the
placeholders with a stated reason.

**Would refute.** A pooled figure that crosses 0.61 and back as single items are
added near the floor.

**Status.** Open. Placeholders, the owner's to set, as the episode floors are
(docs/SPEC-gate0.md O-7).

**Where.** `config/gate0.json` `moves.minItemsForAgreement`,
`moves.minItemsForSessionAgreement` and `moves.$comment`, which cites
docs/SPEC-layer2.md, a file not in the repo when this entry was written;
`src/moves/agreement.ts` `movesAgreement` and `computeMovesAgreement`;
`src/agreement/kappa.ts` `agreementKappa`; `scripts/check-moves.ts`.

## D-032 · OURS · Three quotes per step, chosen by agreement between the two readings

**What.** Each step's evidence panel on the Student Report, in the timeline
strip and in the diagram, quotes at most three of the step's turns, by one rule
applied to every step. First, turns where the tutor's annotation and the
model's reading put the turn in the same one of the six classes the agreement
is computed over (the five problem-solving codes, and "not problem solving" for
a turn the tutor left unmarked or the model coded outside the five, D-026).
Within that, the student's turns before the tutor's; then turn order. A step
with fewer than three agreed turns is filled from the rest in the same order,
so a step with turns always has quotes. The chosen turns are shown in
transcript order, with a line saying how many of the step's turns they are.
One quote may carry a star and the words "Key move": the student's turn that
opens a step whose model episode has Layer 2's NONE, and only while that
layer's own agreement is `shown`. At most one per step, and a starred turn is
always among the three. Under the starred quote, in smaller muted text, goes
the report's plain description of what was done in that exchange,
`Report.quote_descriptions[turn_id]`, when the server has written one; nothing
shows when it is absent. No model call is added on this page.

**Tag.** [OURS: the limit of three, the order of the keys, and the use of turn
agreement as a filter are ours. No source paper selects quotes. "Key move" is
the owner's wording and an evaluative label of ours: no source calls a turn
opened with no prompt before it key, and the word "move" is also Layer 2's
term for what a tutor does, which a reader may conflate with it.]

**Why.** A panel showing every turn of a long step buries the evidence. A rule
applied uniformly, keyed on where the two readings agree, is a reliability
filter: it prefers the turns whose class two independent readings share, the
same comparison the gate computes κ over. It is not a choice of the most
flattering or most telling lines, and no one picks turns by hand. Student turns
come before the tutor's because the student's turns are what the panel quotes
as evidence; the tutor's are context.

**What it costs.** Agreement on a turn is agreement about its class, not about
what the turn shows; an agreed turn is not thereby more representative of the
step. The quotes lean to stretches both readings found easy to classify, which
may be the less ambiguous parts of the work. With no annotation run in the
report, no turn is agreed and the rule falls back to student turns first, then
turn order.

**Would refute.** Evidence that turns the two readings agree on are
systematically unrepresentative of their step, for example a review of a
sample of steps in which reviewers blind to the rule judge the three chosen
quotes less faithful to the step than three drawn at random from it.

**Status.** Open. The owner's decision of 2026-09-18.

**Where.** `app/quotes.ts` `chooseQuotes`, `starredOpener`,
`QUOTES_PER_STEP`, `KEY_MOVE_LABEL`, `descriptionsOf`; used by `app/Report.tsx` `Detail` and
`app/Schematic.tsx` (`Step.quotes`, `Said`).

## D-033 · OURS · A model's plain description of one exchange, under a "Key move" quote

**What.** `Report.quote_descriptions` maps a student turn's `turn_id` to one
plain line describing what was done in that exchange, for example "Worked out
that one part is 4 cups, by dividing 12 by 3." The family-facing report shows
it in smaller muted text under a "Key move" quote (D-032). Lines are written
for the opening student turn of every model-run episode that carries
`tutor_prompting`, whether or not Layer 2 has surfaced, so they are ready when
it does.

**Tag.** [OURS: a model's paraphrase of one exchange. It is not a code, not a
count and not evidence about a learner; no source paper describes turns this
way. Its evidence link is the turn it is keyed by, which is quoted directly
above it.]

**How it is guarded.** One batched model call per report build, beside the
summary call. Per item the model is given only that student turn, the turn
immediately before it and the turn after it, if any: no codes, no aggregates,
no other sessions. The prompt carries the wording rules (a verb phrase with no
subject or with the work as subject; no judgement of quality; no claim about
what anyone knows or understands; none of "unprompted", "initiated", "on their
own", "decided", "chose", "led"; under about 20 words). Every returned line is
checked with `checkText` of src/lint/wording.ts, and with a short list of the
owner's banned words that lint/banned-phrases.json does not cover; a line that
fails either is dropped, never rewritten, and the drop is logged. A missing,
duplicated or rejected answer, or a failed call, leaves the report without that
description; it never fails the build. `scripts/lint-wording.ts` does not yet
scan this field in a saved report.

**What it costs.** Nothing checks a line's accuracy against a person. The lint
guards wording, not truth: a line can pass it and still misdescribe the turn.
The subject-name check is run with no names, because the workspace carries
only a student id, so a name the model copies from the transcript is not
caught.

**Would refute.** A line describing something not in the quoted turns: an
action, number or step that the student turn, the turn before it and the turn
after it do not contain. A review of a sample of lines against their three
turns would find these.

**Status.** Open. The owner's request of 2026-09-18.

**Where.** `src/pipeline/describe.ts` `describeItems`, `describeQuotes`,
`RULES`, `FIELD_BANNED`; called from `src/server/api.ts` `buildReport`; the
field is `Report.quote_descriptions` in `src/contract/types.ts` and
`schema/report.schema.json`; read by `app/quotes.ts` `descriptionsOf`.

## D-034 · OURS · Model-written demo dialogue, stored as fixed files

**What.** The demo transcripts' lines are written by a model, one call per
session, from the session's planted plan turn by turn: speaker, planted code,
boundary cue and problem (the `schedule` in each
`data/demo/<set>/plans/<session>.plan.json`). The lines are stored under
`src/generator/dialogue/<session_id>.json` with the sha256 of the schedule they
were written for, and `yarn generate:demo` uses a stored file only while that
hash matches. The pool lines of `src/generator/dialogue.ts` are the fallback,
for a session with no stored file and for `--pool-lines`. Plans, turn ids,
timestamps and the simulated annotation run are byte-identical whichever lines
are used; only `content` changes. Each set's `set.json` records which sessions
used which (`dialogue.model_written`, `dialogue.pool`).

**Why.** The pools hold four lines per code and role, and a session needs up
to fourteen turns of one code and role, so every session repeated lines, some
up to four times. The owner chose model-written dialogue stored as files, so a
later run gives the same transcript.

**Tag.** [OURS: model-written demo dialogue. Simulated, not from any
transcript. The writer's code meanings come from the codebook loader
(`promptView`, CLAUDE.md rule 10); the prompt's other rules are ours.]

**What it costs.** The writer is given the planted code for every turn, but
nothing checks that a line fits its code. The checks in code are about shape
and repetition only: one line per turn, indices in order, no empty line, none
over 280 characters, no two lines equal once lower-cased with punctuation and
whitespace removed. The simulated annotation run is still the planted plan plus
noise, so a demo kappa between it and an LLM run now also reflects how well the
writer followed the plan, not only how well the pipeline recovers it. Generator
fidelity stays separate from pipeline recovery (CLAUDE.md rule 6): neither is
measured here, and neither is folded into the other.

[EXTRAPOLATION: the same model family writes the lines and segments them
(`config/gate0.json` model.id for both). Lines written by a model told the code
may carry the cues a model of that family looks for, which could make recovery
easier than on real transcripts. Any reading of a demo kappa as evidence about
real tutoring sessions carries that risk. What would test it: segment the same
schedules written by a different model family, or by people, and compare the
recovery.]

**Would support.** A blind review of a sample of stored lines against their
schedules in which reviewers, given only the codebook, assign most lines the
planted code of their turn.

**Would refute.** The same review finding many lines that read as a different
kind of work from their planted code; or a clear drop in the pipeline's
recovery of the plan when the writer is a different model family.

**Status.** Open. The owner's decision of 2026-09-18. No stored files exist
until `yarn write:dialogue` is run.

**Where.** `scripts/write-dialogue.ts` (the prompt, `checkLines`, the retry);
`src/generator/fixture.ts` (`ScheduleEntry`, `scheduleHash`, `fixtureLines`);
`src/generator/sets.ts` `buildTurns` and the plan file and `set.json` writes;
`scripts/generate-demo.ts` (`--pool-lines`, the WARNING lines); the header of
`src/generator/dialogue.ts`; the stored files in `src/generator/dialogue/`.

## D-035 · OURS · One whole problem per session as what a tutor is shown

**What.** Where a session marks two or more problems (`Session.problems`), the
Tutor Annotation screen shows the tutor one whole problem, from its first turn
to its last, drawn at random with a seed: a number hashed from
`sampling.seed` and the session id seeds the generator's `Prng`, so the same
session under the same config always shows the same problem.
`sampling.problemsPerSession` problems are drawn without replacement and shown
in session order. A session with no problem markers, or only one, is shown
whole, with no sample and no toggle; that includes every uploaded transcript.
A toggle switches between the sampled problem and the whole session. The
tutor chooses, and the saved annotation records the choice and exactly which
turns were shown (`shown` on the run). The server recomputes the sample itself
and never trusts turn ids from the page; it refuses a stretch that starts or
ends outside the shown turns rather than clipping it. A saved run with no
`shown` record, such as the seeded simulated runs, means the whole session was
shown, so existing data reads as before.

Cohen's κ compares only the shown turns, in both label sequences, per session
and pooled. Inside them an unmarked turn is still not problem solving. The
floors, `minTurnsForSessionAgreement` 30 and `minTurnsForAgreement` 100, are
unchanged and now count shown turns. The Student Report is unchanged: it is
built from the model run, which reads the whole session.

**Tag.** [OURS: the unit, the seeded draw, the toggle, and κ over shown turns
only are our design, with no source behind them. `sampling.problemsPerSession`
1 and `sampling.seed` 20260918 are placeholders with no source.]

**Why.** On a real transcript, reading every turn of every session is more
than a tutor will do. The owner chose the whole problem as the unit as the
simple fix: what a tutor sees is a unit of work rather than an arbitrary
window, and the problem markers already exist. The toggle is also the owner's:
a tutor who wants to annotate the entire session can. κ covers shown turns only
because a turn the tutor never saw is not a judgement. Since D17 an unmarked
turn reads as not problem solving, so counting unshown turns would turn every
turn outside the sample into a mark nobody made, and κ there would compare the
model with a default. (docs/SPEC-gate0.md D18; INTENT.md, "What a tutor is
shown".)

**What it costs.**

- One problem is fewer turns than a session. A sampled annotation falls below
  the per-session floor of 30 more often than a whole-session one, and more
  sessions must be annotated before the pooled floor of 100 is reached.
- A pooled κ can mix sampled and whole-session annotations. Its turns then
  come from spans chosen two ways, and nothing weights them.
- Turns outside every marked problem are never in a sample. If the codes fall
  differently inside problems than between them, κ over sampled problems can
  differ from κ over whole sessions.
- Layer 2 items are not limited to the shown turns.
- An empty marking is still refused; whether it is a judgement stays open
  (O-34, second half).

**Would support.** Sampled and whole-session annotations of the same sessions
giving κ figures close to each other, whichever problem the seed draws.

**Would refute.** Comparing κ over whole-session annotations against κ over
sampled annotations of the same sessions, and finding a gap that puts the two
on opposite sides of 0.61, or one that depends on which problem was drawn.

**Status.** Built 2026-09-18, on the owner's decision D18. The values are
placeholders, the owner's to set. Finer units, markers for uploaded
transcripts, and Layer 2 items are README next steps.

**Where.** `config/gate0.json` `sampling` and its `$comment` fields;
`src/sampling/draw.ts` `drawSample`; `src/agreement/gate.ts`;
`src/server/api.ts` `getSession` (the `sample` field) and `putAnnotation` (the
`shown` body field and the 400s); `app/Annotate.tsx` (the toggle); `shown` in
`src/contract/types.ts` and `schema/run.schema.json`; `pooledShown` in
`src/server/workspace.ts`, which gives the pooled figure and the report's
annotation run the shown turns of every session they pool;
`scripts/validate.ts` rules `episode.outside_shown_turns` and
`run.shown_turn_not_in_session`, with fixtures in `test/fixtures/mutations.ts`;
cases M to Q in `scripts/check-agreement.ts`. [OURS: three details beyond D18.
`putAnnotation` also refuses a stretch whose ends are shown but which crosses
turns that were not, possible only when two problems apart are drawn. The gate
raises, rather than dropping the turn, on a marking outside the shown turns.
The pooled record keeps `sampling` only when every sampled session was drawn
with the same settings, and null otherwise.]

## D-036 · OURS · The seeded demo sessions locked on the tutor side, on pool lines

**What.** In the live demo (demo-a), every session `scripts/seed-live.ts` seeds
with a simulated annotation, sessions 1 to 3, is listed in
`locked_session_ids` in `data/live/workspace.json`. Reset demo re-runs that
script, so the list survives a reset. For a locked session the server refuses
a saved annotation and a model run with a 409, and `getSession` sends the
session without the text of its turns: ids, roles, order and timestamps only.
Tutor Annotation marks its card "Locked" and shows a short panel where the
transcript, the code buttons, Save and Generate would be. The transcripts of
sessions 1 to 3 go back to the generator's pool lines. Session 4 arrives
un-annotated, keeps its model-written transcript (D-034) and is the one a
tutor annotates live; demo-b and demo-c keep their model-written lines too.
Unchanged: the report still links each claim to the turns behind it in every
session, locked ones included (CLAUDE.md rule 7), and the Internal view still
draws their tilings.

**Why.** The simulated annotations of sessions 1 to 3 were built from the
planted plan, and the pool lines follow that plan. The model-written lines
drifted from it, and pooled κ between those annotations and the model fell to
0.37, a figure about the generator's drift rather than about the loop. With
pool lines under them, the seeded annotations again describe the transcripts
they sit on. The lock is the owner's call (SPEC D19): the earlier transcripts
are frozen and kept off the tutor side, and the newest is the one read in
full.

**What it costs.**

- Re-annotating a seeded session is no longer shown. Re-annotation is shown on
  the tutor's own session instead: annotate session 4, save, generate, change
  the marking and save again.
- Sessions 1 to 3 are less nuanced than session 4, and the report quotes
  their pool lines as evidence.
- It is a demo lock, not access control. The report that `/api/state` sends
  carries the turns of every session it covers, locked ones included; the
  session files under `data/live/sessions/` are unchanged on disk, and the dev
  server still serves a file by its path.

**Open, the owner's call.** Layer 2 marking on locked sessions stays
available. Its items show one tutor turn and the student turn after it, the
same exposure as report evidence. It is also the only way Layer 2 reaches its
pooled floor of 15 items (`config/gate0.json` `moves.minItemsForAgreement`),
since one session yields a handful of items; closing it would leave Layer 2's
figure unmeasured in the demo.

**Would support.** After the seed is re-run on pool lines, pooled κ for
sessions 1 to 3 rising well above 0.37, which would place the fall in the
model-written lines and not in the annotations or the model.

**Would refute.** Pooled κ on pool lines staying near 0.37, which would put
the cause elsewhere; or a demo in which the audience needs to see a seeded
session re-annotated.

**Status.** Built 2026-09-18 on D19. `locked_session_ids` appears in the
workspace at the next `yarn seed:live` or Reset demo; a workspace seeded
before this change has none, and nothing in it is locked.

**Where.** `scripts/seed-live.ts` (`locked`); `WorkspaceFile` and `isLocked`
in `src/server/workspace.ts`; `src/server/api.ts` `lockedRefusal`,
`outlineOf`, `getSession` (`locked`, and the outline in place of the
session), `putAnnotation` and `generate` (the 409), `getState` (`locked` per
session); `SessionDetail` and `SessionSummary.locked` in `app/api.ts`;
`app/Annotate.tsx` (the card, the panel, Layer 2 beside it);
`src/generator/sets.ts` `poolLineSessions` for the pool lines.

**Resolved 2026-09-18.** The owner locked Layer 2 marking on the locked sessions as well: the Tutor Annotation page shows no tutor moves for them, and `putMoves` refuses marks on them (409). Consequence: tutor marks can come only from unlocked sessions, at most 5 per session (D-037), so Layer 2 stays below its pooled floor of 15 in the demo and does not surface.

## D-037 · OURS · At most five tutor turns per session for a tutor to mark

**What.** The Tutor Annotation screen's "Tutor moves" section asks a tutor to
mark at most `moves.maxItemsPerSession` (5) of a session's classifiable items,
drawn without replacement with `sampling.seed` hashed with the session id and
"moves", and shown in session order. A session with five or fewer shows them
all. The server recomputes the shown set, refuses a mark on any other item,
and records `shown_item_ids` on the saved marks. The model still classifies
every item, and the Internal view still shows every one. [OURS: placeholder;
no source. The owner asked for fewer items than the 5 to 14 per session the
screen listed; the number five is ours.]

**Why five.** Four seeded sessions of five or more items give 20 marks, above
the pooled floor of 15 (D-031), and each such session clears its floor of 4.

**Would support.** Tutors completing the marks on every session, and, where a
tutor has once marked every item, the pooled κ over the drawn items staying
close to the pooled κ over all of them.

**Would refute.** A pooled κ over five drawn items per session that moves
materially when the draw's seed changes, which would say five is too few to
stand for the session.

**Where.** `config/gate0.json` `moves.maxItemsPerSession`; `src/moves/draw.ts`
`drawMoveItems`; `sessionSeed` exported from `src/sampling/draw.ts`;
`src/server/api.ts` `movesView` (`shown_item_ids`) and `putMoves`;
`MovesMarks.shown_item_ids` in `src/contract/types.ts`; `app/Annotate.tsx`
(`movesToMark`, `TutorMoves`, `savedMarks`); checks I to M in
`scripts/check-moves.ts`.
