# CLAUDE.md

Standing rules for this repository. These apply to every file, every commit,
and every gate.

## The core rule

This project's only real asset is that its claims are traceable. A learning
report that a parent reads is a claim about a child. Every such claim must be
followable to a published source, to a measured number, or to an explicitly
marked judgment of ours.

So: anything that extrapolates beyond, deviates from, or combines the source
papers must be labelled as such, at the point where it happens.

## How we work

Repo structure, and how Claude works with the project owner, follow the
AI-native SDLC playbook (Claxton, 21 August 2026):
https://claude.com/blog/the-ai-native-sdlc-playbook

Go through each step, in order, whenever it applies. Do not begin a step until
the project owner has approved the artifact from the step before it.

1. Plan: the problem and intended outcome, recorded as intent (INTENT.md).
2. Design: requirements and design derived from the intent, recorded as a
   spec (docs/SPEC-gate0.md for this gate).
3. Build: an implementation plan agreed before any code, then the change.
4. Test: Claude verifies its own work against success criteria written down
   in advance, before reporting it as done.
5. Deploy: review before anything ships.
6. Maintain: findings and problems become new intent.

Interview the project owner for feedback. This is the default, not the
exception.

- At every step, ask before assuming. Put open questions to the owner as
  short, structured interview questions, a few at a time, most consequential
  first.
- Give a recommended option and its tradeoff; the owner decides.
- Record each answer in the artifact it changes (intent, spec, plan, or
  docs/DEVIATIONS.md) before moving on.
- Where the playbook's repo layout differs from this repo, raise it rather
  than moving files.

## Provenance tags

Use these in code comments, in JSON metadata, in docs, and in UI copy where
the distinction reaches the reader.

`[SOURCE: <citation>]`
  Taken directly from a published paper. Codes, definitions, examples,
  reported reliability figures, thresholds. Verbatim or near-verbatim. Give
  authors, venue, year, and a page or section where you can.

`[DERIVED: <citation> → <what we did>]`
  Computed from source material by a transformation we chose. Counts, rates,
  aggregations, groupings. The source is real; the operation is ours.

`[EXTRAPOLATION: <what, why, and what would test it>]`
  Applied beyond the setting the source validated. Example: using a codebook
  developed on grade 4–5 whole-classroom transcripts to code one-to-one
  middle-school tutoring. State the mismatch and what evidence would settle it.

`[CROSS-STUDY: <sources> → <what we combined>]`
  Any inference that spans two or more source studies. Banned in Gate 0.
  Permitted later only with this tag and a written justification in
  docs/DEVIATIONS.md. A layer whose codes come from different papers, each
  code naming its own origin, is not CROSS-STUDY; see rule 1.

`[OURS: <rationale>]`
  Our own invention with no source behind it. Design decisions, thresholds we
  picked, schema fields, metrics we made up. Not a problem — an unlabelled one
  is.

## Rules

1. One construct per analysis layer. Each code in a layer comes from one
   named paper, recorded in that code's `origin`, and uses that paper's
   definition as adapted in the codebook. A layer may draw codes from more
   than one paper only when every code names its origin and the combination
   has an entry in docs/DEVIATIONS.md. Do not merge definitions of the same
   code from different papers, crosswalk labels between layers, or compute an
   index spanning layers or sources unless explicitly asked, and then tag it
   CROSS-STUDY.

2. Never launder an extrapolation into a source. If a codebook was validated
   on classroom discourse and we apply it to tutoring, that is EXTRAPOLATION,
   not SOURCE, no matter how reasonable the transfer seems.

3. Report reliability as its authors reported it. Name the statistic. If a
   paper reports pre- and post-adjudication figures, show both. Never quote
   only the flattering number.

4. Agreement is computed, internally, and never shown to a learner or a
   parent. One gating Cohen's kappa per report, at the turn level, pooled
   over the turns of the student's reportable sessions, plus one per session,
   between one annotation run and one LLM run: the LLM run's tiling gives
   every turn exactly one code and, across the turns the tutor was shown, an
   unmarked turn counts as not problem solving (SPEC-gate0 D17, D18), so the
   two label sequences are equal-length and positionally aligned. It is
   computed by Sandpiper's calculateCohensKappa.ts, vendored verbatim with
   attribution beside getKappaInterpretation.ts (NOTICE). Vendoring it does
   not mean inheriting its two defects, both verified against the source
   (docs/LAY-OF-THE-LAND.md §3): it returns 0 on a length mismatch rather
   than raising, and returns 1 whenever expected agreement is 1, so two runs
   that use a single identical label throughout score a perfect 1. A thin
   wrapper of ours refuses unequal-length input and that degenerate case
   instead of returning a number [OURS: in a gate, a silent wrong number is
   worse than a refusal]. The value reaches only the internal,
   non-learner-facing view. `AGREEMENT_THRESHOLD = 0.61` is now compared
   against it: below 0.61 the episode layer does not surface. Where there is
   no annotation run, nothing is computed and the state follows from the
   absence of that run — a third state, visibly distinct from computed and
   below threshold. A kappa is a number about two label sequences: not
   evidence about a learner, and not a validation of the model. This repo is
   the apparatus that would do the validation, not the validation, and makes
   no claim of reliability or validity anywhere in it or its UI. Show a
   source paper's own figures as that paper's, attributed, never as ours.
   Report our own figure held-out, never development-set;
   docs/02-expert-feedback-loops.md, not in this repo, puts that gap at 0.78
   against 0.91–0.93.

5. Illustrative data is marked in the UI, not only in a comment. Hand-authored
   values in Gate 0 must be visibly labelled as illustrative.

6. Synthetic data is marked persistently in every view that renders it.
   Generator fidelity is reported separately from pipeline recovery; never
   collapse them into one number.

7. No claim reaches a learner-facing surface without an evidence link to the
   turns or the episode span behind it. A report can be generated from an
   annotation run or from an LLM run, so the link resolves within the run the
   report was generated from, and the provenance card names that run.

8. Wording: describe episodes and behaviours, never dispositions. The
   grammatical subject of a claim is the session or the work, never the
   student. No noun phrase that names a type of student. No comparison to
   other students, including implicit. This is an evidence-based constraint,
   not a style preference, and the lint script enforces it.

9. When unsure whether something is SOURCE or EXTRAPOLATION, it is
   EXTRAPOLATION. When unsure whether to tag at all, tag.

10. codebook.v2.json is the single source of truth for every code definition.
    No definition text is written by hand into a prompt, a UI string, this
    file, or a report file. Changing a definition is a config edit, a version
    bump and a re-run, never a code change. Domain wording (examples,
    keywords) belongs in domains/*.json, so that the codebook itself names no
    mathematical object. Version 2.0.0 predates that split and still carries
    examples and mathematical vocabulary; the split is O-4 and is the owner's
    call.

11. Counts are computed in code, never by a model. An LLM may phrase a summary
    from aggregates it is handed; it never counts, and a number it produced
    unaided does not reach any surface.

12. The two gates stay separate and are never merged: whether a construct's
    agreement is known and reaches 0.61 (the suppression state), and whether
    a session has enough turns to report on. The first acts on a computed
    value where there is an annotation run and on the absence of that run
    where there is none; the second counts turns and has nothing to do with
    agreement. Different reasons, different states, different UI copy.

13. No tutor-confound adjustment, and no elicited-versus-spontaneous split.
    Both presuppose that a behaviour belongs to the student, which the
    codebook's unit refuses (INTENT.md). One exception, and nothing wider:
    inside Layer 2 (codebook.tutor-moves.json) and behind its own agreement
    gate, a stretch of problem-solving work that opened on a student's turn
    may be said to have had no prompt in the turn before it, and only where
    that one tutor turn is coded NONE (INTENT.md, "Layer 2"). Rule 8 still
    holds for that sentence: the stretch is the subject, never the student.
    "Unprompted", "took initiative", and any wording that the student
    decided, chose, led or initiated stay banned.

14. The README carries a current "Next steps" section before anything is
    pushed.

## Source access

Claude may open and read any page listed in docs/SOURCES.md without asking
first.

## docs/DEVIATIONS.md

Maintain a running log. Every EXTRAPOLATION, CROSS-STUDY, and consequential
OURS gets an entry: what we did, why, what evidence would support or refute
it, and where it appears in the code. This file is the audit trail and it is
part of the deliverable.

## References

Precedence: INTENT.md, then this file, then the spec. Where a design decision
seems reasonable but contradicts INTENT.md, raise it rather than working
around it.

INTENT.md                 why the repo exists and what it may claim
codebook.v2.json          the nine codes; the single definition of each
domains/math.json         domain wording (not yet present; SPEC-gate0 O-4)
docs/SPEC-gate0.md        the Gate 0 spec, the current design artifact
docs/SPEC-review.md       the episode review screen, recorded for a later
                          gate; none of it ships in Gate 0, and the Gate 0
                          annotation interface is not it
docs/SOURCES.md           pages Claude may access without asking
docs/LAY-OF-THE-LAND.md   what Sandpiper provides, with file paths, and what
                          of it this project uses (§3)
docs/DEVIATIONS.md        the audit trail
docs/reference/           transcribed reference material, such as Rott et al.
                          (2021) Fig. 5
docs/*.pdf                local paper copies kept for reading only; the
                          papers are cited, not redistributed (NOTICE), and
                          docs/**/*.pdf is gitignored
vendor/sandpiper/         the two files copied verbatim from Sandpiper: the
                          kappa computation and the Landis & Koch bands
NOTICE                    third-party notices for copied files

Referred to but not in the repo: docs/00-SYNTHESIS.md and docs/01–04-*.md, the
research briefs. Their findings reached this file and the spec through the deep
searches they summarise, not through the briefs themselves. Until they arrive,
treat any citation of them as a claim that has not been checked against a
document in this repo.
