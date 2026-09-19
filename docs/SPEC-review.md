# SPEC — Tutor episode review

**This is a design record, not a build.** Nothing described here is built in
Gate 0. No screen, no record, no rate. It is written down now so that the
decisions behind it survive, and so that a later gate does not re-argue them
from scratch.

**What Gate 0 leaves room for, and only that.**

- Episode ids are stable and addressable. An episode can be pointed at from
  outside the run that produced it.
- `reviewer_id` and `reviewed_at` are present in the Gate 0 data contract
  (docs/SPEC-gate0.md §5.3). Nothing writes them. No code path produces a
  value for either.

That is the whole of the accommodation. There is no hidden review surface, no
disabled button, no stub endpoint.

**This is not the annotation interface.** An annotation interface does ship in
Gate 0. It is a different surface with a different purpose, and this document
is not it. The annotation interface is for authoring: open a session, select a
contiguous turn range, assign a code from the dropdown generated from
`codebook.v2.json`, see which turns are still uncovered, save a full tiling as
a run stamped with `codebook_version`. The screen designed below is for
judging one span that a run already proposed. Three differences carry the
distinction.

- **Coverage.** The annotator tiles a whole session, every turn in exactly one
  episode. The reviewer sees a stratified sample of proposed episodes (§2) and
  never covers a session.
- **What is on screen.** The annotator has the code dropdown and their own
  coverage of the session in front of them. The reviewer is shown one span,
  ten code buttons and an eleventh, and no proposed label (§3, §4).
- **What the record is.** An annotation run is a labelling source, of the same
  shape as an LLM run, and a report can be built from it. A review record is a
  judgement about a span someone else proposed, and no report is built from
  it.

**Precedence.** INTENT.md, then CLAUDE.md, then this file. Where this file and
INTENT.md disagree, INTENT.md wins.

**Definitions.** No code definition is restated here. The codes (nine as
of 2.2.0), their definitions, includes, excludes and flags live only in `codebook.v2.json`.

**No measurement claim.** Nothing in this document claims measured reliability
or validity, for this design or for anything built from it, and nothing here
claims that the model has been validated. One agreement figure does exist in
Gate 0 wherever an annotation run exists to compute it from: a turn-level
kappa between that run and an LLM run, computed internally, held to the
internal non-learner-facing view, and never shown to a learner or a parent. It
is a number about two label sequences. It is not evidence about a learner, and
nothing in this file produces it or reads it.
The rates named below are not computed in Gate 0, and naming a rate is not a
claim that it has been measured.

**Subject.** Every sentence about the data has the session or the work as its
subject. A review record says what a reviewer judged about a span of a
session. It says nothing about a student.

---

## 1. The shape of the task

One question, one episode, one screen, in under thirty seconds.
[OURS: the budget is the design constraint, not a measured figure. Everything
below follows from it. A review that takes longer than this per episode does
not get done at the volume that would make it useful, and a screen that asks
two questions is a screen that gets one of them answered carelessly.]

The reviewer is a tutor. The thing reviewed is a span the model proposed, not
a person and not a session's outcome.

## 2. Sampling

Stratified random over the model's proposed episodes. One or two per code, so
that rare codes get covered rather than drowned by whichever code the model
proposes most often. Roughly ten to fifteen episodes per session review.
[OURS: a simple random sample over proposed episodes would spend most of a
review on the common codes. Stratifying by proposed code is the cheapest way
to put eyes on the rare ones.]

The stratum is the model's proposed code. That is a property of the proposal,
not of the span, and the reviewer is never shown it (§4).

## 3. The screen

The screen shows:

- The episode's turns.
- One or two turns of context on each side, marked as context.
- One row of buttons.

The row is: the question, then ten code buttons, then an eleventh.

**Question.** "What kind of work is happening here?"

**Code buttons.** Read, Analyze, Plan, Implement, Explore, Verify, Monitor,
Organization, Writing, Digression. Ten buttons, one per code. The mapping from
button label to code lives in `codebook.v2.json`; no definition text is
duplicated onto the screen.

**Eleventh button.** "This isn't one thing". §5.

Nothing else is on the screen. No progress bar of past answers, no notes
field, no free text.
[OURS: a free-text field would be the obvious thing to add and is the reason
this line exists. Free text is not analysable without a second pass of coding,
and its presence lengthens every screen whether or not it is used.]

## 4. What the reviewer is not shown

The model's proposed label is not shown before the reviewer chooses.

If it is revealed afterwards, the pre-reveal answer is the one that counts,
and the two are stored separately. A post-reveal change is a different datum
from a first answer and is never written over it.
[OURS: showing a proposed label before the choice turns the question from
"what kind of work is this" into "is this label acceptable", and the second
question is answered yes more often than the first would have been.]

## 5. The eleventh button

"This isn't one thing" is load-bearing. It is not an escape hatch bolted on
for completeness.

Without it, a reviewer looking at a badly segmented span — two kinds of work
run together, or a boundary in the wrong place — still has to press something.
They press the closest of the ten. The system then records an answer to a
question that had no right answer, and that answer flows into whatever is
computed from these records as though it were a judgment about a well-formed
span.

Recording the rejection as its own outcome keeps those cases out entirely.

**Record.**

    { label: null, flagged_not_one_episode: true, split_at_turn_id: <id|null> }

`split_at_turn_id` is a turn id, of the kind the transcript schema already
carries, or null. §6.

**What it feeds.** An episode the reviewer rejected has no label to agree
about, so it cannot sit in a numerator or a denominator of anything about
labels. It goes in the denominator of a separate rate: the coarse segmentation
error rate.

None of that touches the Gate 0 kappa. That kappa compares two full tilings
turn by turn and never reads a review record; the coarse segmentation error
rate would be computed from review records alone. Two measurements of
different things, never combined and never reported as one number.

That rate is the only segmentation signal this design produces, and it is
enough until someone is actually working on the segmenter. A boundary-distance
measure, a span-overlap score, a per-boundary review pass — none of those are
here, and none should be added before there is a segmenter change waiting on
them.

## 6. The optional split tap

After the eleventh button is pressed, the episode's turns become tappable. The
reviewer may mark roughly where the second thing starts. One tap. That tap is
`split_at_turn_id`.

It is optional. Skipping it is a complete and valid answer, and a rejection
with `split_at_turn_id: null` is not a partial record.

Not in this design: drag handles, a boundary editor, a second screen, a
confirm step, or any way to mark more than one split.
[OURS: the thirty-second budget in §1. A boundary editor is a different
product with a different reviewer and a different amount of their time. Asking
"roughly where" is answerable in one tap; asking "exactly where" is not.]

## 7. Every record carries reviewer_id and reviewed_at

Every review record carries `reviewer_id` and `reviewed_at`. Both fields are
already in the Gate 0 data contract (docs/SPEC-gate0.md §5.3), unwritten. That
contract is prose in the spec; no schema file holds it yet.

Unwritten means no review record exists in Gate 0, not that nothing human is
written anywhere. The annotation interface writes human-authored labels, as a
run; a run is not a review record and carries neither of these two fields.

A record is attributable to a person and placed in time, or it is not a review
record. Without those two fields a set of reviews cannot be split by reviewer,
cannot be ordered, and cannot be re-examined after a change to what the model
proposes.

The episode is referenced by its stable episode id, `episode_id`, specified in
docs/SPEC-gate0.md §5.3. The field name a review record uses to hold that
reference, and the field name for a post-reveal answer (§4), are not fixed here;
those belong to whoever builds the review records.

## 8. Why this is not modelled on Sandpiper's vote

Sandpiper has something that looks adjacent: a vote on one AI annotation,
`markedAs: "UP_VOTED" | "DOWN_VOTED"` plus a free-text `votingReason`, defined
in `app/modules/sessions/sessions.types.ts:51-52` and rendered in
`runSessionViewerAnnotation.tsx`. This design does not build on it. Four
verified facts, each one disqualifying on its own:

1. **No reviewer identity.** The vote carries no reviewer id. It cannot be
   attributed to a person.
2. **No time.** It carries no timestamp. A set of votes cannot be ordered.
3. **No stable address.** The vote lives on the annotation object, and the
   viewer keys rows by array index. A re-run that reorders the array does not
   preserve it.
4. **Wrong question.** Up or down on a proposed label is the post-reveal
   question of §4, asked as the only question. It cannot express "this span is
   not one thing", which is §5 and the reason the eleventh button exists.

Two further facts about the surrounding system, for whoever is tempted to look
again:

- No component in that app writes a human label. There is no in-app annotation
  authoring surface. Human labels arrive through a spreadsheet round trip —
  the `humanAnnotations` module is CSV plumbing (download template, select,
  preview, upload) plus `analyzeHumanCsv`, `createHumanRun` and
  `uploadHumanAnnotations` — with a coder typing code strings into columns
  named `annotator[name][slot]FIELD` in Excel. The Gate 0 annotation interface
  is built, not taken from there, and none of that CSV plumbing is reused.
- There is no span, segment, episode or boundary concept anywhere in that data
  model or its schemas. The unit is a single utterance, with `_id` assigned as
  the array index at ingestion. Auth is GitHub OAuth and ORCID, researcher
  identities, with no role model and no tutor-facing surface.

Our unit is the episode: a contiguous span of turns, spanning both speakers.
That cannot be represented there. This is not a gap to work around. It is
where the two designs part ways, and it is upstream of everything in this
file.

What we do take from Sandpiper is listed elsewhere and is unaffected by this
document: the codebook structure, the transcript JSON field names as a
compatibility target at the turn level only, and two evaluation helpers
vendored verbatim with attribution — `getKappaInterpretation.ts`, already at
`vendor/sandpiper/getKappaInterpretation.ts`, and `calculateCohensKappa.ts`,
which Gate 0 vendors beside it to compute the turn-level kappa named in the
front matter.

Vendoring verbatim carries over two defects verified against the source
(docs/LAY-OF-THE-LAND.md §3): it returns 1 whenever expected agreement is 1,
so two runs that annotate nothing at all, or that give every turn the same one
code, score a perfect 1; and it returns 0 on a length mismatch rather than
raising. Neither is inherited as a silent wrong answer. A thin wrapper refuses
unequal-length input, and refuses the degenerate single-code case, instead of
returning a number
[OURS: the upstream function stays unmodified so that what we took can be
diffed against its source; the refusals live in our wrapper, not in it].

Episodes have no counterpart there.

## 9. The session-level verdict

One more question sits at the end of the same flow, after the sampled
episodes: does this session's summary look right? One tap.

It is on the same flow because it is the same sitting and the same reviewer,
and because a verdict on the summary is only meaningful from someone who has
just looked at the spans behind it.

## 10. Left open

These are open. This document does not decide them, and whoever builds the
review interface will have to.

- **Storage.** Where review records live. Nothing here assumes a file, a
  table, or a service.
- **Reviewer identity.** Who issues `reviewer_id`, and what it is. Sandpiper's
  auth is researcher identity (GitHub OAuth, ORCID) with no role model, so it
  answers none of this.
- **Sampling seed.** How the stratified sample is seeded, and whether two
  reviews of the same session draw the same episodes.
- **Repeat review.** What happens when the same episode is reviewed twice, by
  the same reviewer or by two. Whether both records stand, how the coarse
  segmentation error rate counts them, and whether a reviewer is ever shown an
  episode they have already answered.
- **Reveal.** Whether the model's proposed label is revealed after the choice
  at all. §4 fixes only what must be true if it is.
- **The writing button.** INTENT.md requires that `writing` not appear in the
  dropdown or the prompt when a session's `has_timestamps` is false. That
  dropdown is the annotation interface's. Whether the same rule reaches this
  button row, and so whether the row is ten buttons or nine for such a
  session, is not decided here.
- **Session verdict record.** What the session-level verdict of §9 is stored
  as, and how it relates to the episode records from the same sitting.
- **Deviations entry.** The OURS decisions in this file are not yet in
  `docs/DEVIATIONS.md`. They belong there when this design leaves the record
  stage.
