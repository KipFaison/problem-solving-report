# SPEC — Layer 2: tutor prompting at episode boundaries

**Playbook step.** Design (CLAUDE.md, "How we work"). This file records the
owner's Layer 2 specification as amended by the owner's decisions of
2026-09-18. The core was built against those decisions before this file
existed; §11 lists where the build and this spec still leave something for the
owner to decide.

**Status.** Draft 1, 2026-09-18. Not yet approved by the owner.

**Precedence.** INTENT.md, then CLAUDE.md, then this spec. INTENT.md
("Layer 2: tutor prompting at episode boundaries", and point 2 under "What
is measured, and what is not") and CLAUDE.md rule 13 already carry the
amendment D-C asks for.
Where this spec and docs/SPEC-gate0.md meet (the κ wrapper, the three states,
rule 12), SPEC-gate0 governs the episode layer and this file governs Layer 2;
neither changes the other.

**Not yet read for this spec.**

- `docs/2603.05778v1.pdf` (Zhou et al., 2026). The code names and the κ
  wording in §2 rest on the owner's check of 2026-09-18 against that PDF, and
  on docs/DEVIATIONS.md D-002 and D-005 (retired) for page references. Not
  re-read here.
- The sections of docs/SPEC-gate0.md beyond its header, §0 and O-29/O-32.

Nothing below restates a code definition. Each code's meaning lives only in
`codebook.tutor-moves.json` (CLAUDE.md rule 10).

---

## 0. Owner decisions recorded

The owner's specification (below, "L2-S") is authoritative except where a
later decision amends it. The rows after it win where they differ.

| # | Question | Decision |
| --- | --- | --- |
| L2-S | What is Layer 2? | **Owner's specification.** A second, independent layer that looks at the turn immediately before each episode a student's turn opens and classifies it if it is the tutor's. Its own provenance card, its own codebook version; never merged with, redefined by, or crosswalked against the episode codes, and no index across the two layers. Ships only after the episode layer works end to end; not required for a report to be complete. Three codes verbatim from the NTO Tutor Move Taxonomy (Zhou, Vanacore, Thompson, St John & Kizilcec, 2026, arXiv), plus NONE. One call per session. |
| D-A | How many codes? | **2026-09-18. Amends L2-S: five, not four.** With three codes and NONE, NONE would silently absorb every other prompting move in the taxonomy (next-step prompts, hints, probing, and others), and "no prompt in the turn before it" would be false exactly where it is most often said. Codes: PROMPTING_SELF_EXPLANATION, PROMPTING_SELF_CORRECTION, GIVING_ANSWER (verbatim, Zhou et al.); OTHER_TUTOR_MOVE and NONE (ours). NONE now means the tutor turn contains no prompting move at all. Only NONE licenses the report clause. |
| D-B | Is the layer gated? | **2026-09-18. Adds to L2-S.** Yes, like the episodes. A tutor can mark the move in each item; a separate Cohen's κ is computed for this layer, per session and pooled; the layer reaches the Student Report only when its own pooled κ is at or above 0.61. Tutor and internal surfaces show the layer straight away. Same three states, same refusals, same wrapper around the vendored calculator, and its own item floors (§8), because the episode floors count turns and do not transfer. |
| D-C | What may the report say? | **2026-09-18. Amends L2-S; amends INTENT.md and CLAUDE.md rule 13; keeps rule 8.** The one boundary statement in §9 is permitted inside this layer and behind its gate, and nothing wider. The owner's "went first" phrasing becomes a sentence whose subject is the stretch of work. "Unprompted", "took initiative", and any wording that the student decided, chose, led or initiated stay forbidden. |
| Boundaries | Which boundaries? | **2026-09-18.** Those in the model's run, opening an episode whose code is one of the five `in_problem_process` codes, whose first turn is spoken by a student. §4. |
| Storage | Where is it stored? | **2026-09-18.** Nested `tutor_prompting` on each such episode of the model run, because an episode already carries the episode codebook's `codebook_version`. The tutor's marks for this layer are stored apart from the tutor's episode annotation, keyed by `preceding_turn_id`. §6. |
| Paper check | What does the card say? | **2026-09-18, the owner's check against the bundled PDF.** All three code names appear verbatim in Table 1. Cohen's κ was .65 in the first round and .78 in the second, "after clarifications and minor alterations"; the card says that, not "improved" (CLAUDE.md rule 3). "Living framework" is the authors' phrase. CC BY 4.0. Each code's meaning is stated in this project's own words with its origin cited, not copied from the authors. |

---

## 1. What the layer answers

The episode layer shows where a stretch of problem-solving work began and whose
turn opened it. That supports "This stretch of `<kind of work>` opened on the
student's turn", and no more. It does not support any claim about prompting:
that no prompt came before cannot be observed from the fact that a student
turn opened the stretch.

Layer 2 supplies one observed turn of that missing evidence: what, if
anything, the tutor did in the turn immediately before. It describes one tutor
turn. It is not an evaluation of the tutor (INTENT.md, "Layer 2").

It also answers, in narrowed form, docs/SPEC-gate0.md O-32 ("who initiated each
step"), which the owner deferred to this layer. The narrowing is deliberate:
the layer observes one turn, and says nothing about who initiated anything.

## 2. Source and provenance card

| Field | Content | Tag |
| --- | --- | --- |
| Citation | Zhou, Vanacore, Thompson, St John & Kizilcec (2026). NTO Tutor Move Taxonomy. arXiv:2603.05778v1 | [SOURCE] |
| Licence | CC BY 4.0; the PDF is bundled at `docs/2603.05778v1.pdf` and attributed in NOTICE | [SOURCE] |
| Corpus | Authentic one-to-one tutoring transcripts from multiple providers; the authors do not report corpus counts | [SOURCE] |
| Agreement, as reported | Cohen's κ, two veteran teachers, full scheme: .65 in the first round, .78 in the second round after clarifications and minor alterations. Both are pre-discussion figures (Section 2.4, p. 3) and are for the taxonomy overall, not per move (p. 4) | [SOURCE: Zhou et al. 2026; page references from docs/DEVIATIONS.md D-002 (p. 3) and D-005 (p. 4)] |
| Status | arXiv preprint; the authors call it a living framework | [SOURCE] |
| Not validated on | A three-code subset with two codes of ours added, rather than the full twenty-eight; one-to-one middle-school mathematics tutoring; simulated transcripts | [EXTRAPOLATION] |
| In this project | No agreement established. The layer reaches a family's report only when its own pooled κ reaches 0.61 | [OURS] |

The card's text is `codebook.tutor-moves.json` → `provenance`; the table above
describes it and is not a second copy to maintain. The authors' κ belongs to
the authors and is never shown as this project's.

## 3. Codes

Five codes, `codebook.tutor-moves.json` version **1.0.0**, separate from the
episode codebook (`codebook.v2.json`, currently 2.2.0).

| Code | Origin |
| --- | --- |
| PROMPTING_SELF_EXPLANATION | Zhou et al. (2026), Table 1 [SOURCE] |
| PROMPTING_SELF_CORRECTION | Zhou et al. (2026), Table 1 [SOURCE] |
| GIVING_ANSWER | Zhou et al. (2026), Table 1 [SOURCE] |
| OTHER_TUTOR_MOVE | [OURS: D-A] |
| NONE | [OURS: D-A] |

Meanings: `codes[].definition`, `include`, `exclude`, and `note_on_none`.
The layer is not CROSS-STUDY by rule 1's test: every code names its own
origin. The combination with the episode layer is (§10).

## 4. Item definition

An **item** is one (episode, preceding turn) pair, selected by
`selectItems` (`src/moves/items.ts`):

1. The episode is in the **model run** (`kind: 'llm'`). Annotation-run
   episodes never produce items. [OURS: the report is built from model runs,
   D13]
2. Its code is one of the five `in_problem_process` codes of
   `codebook.v2.json` (analysis, planning, implementation, exploration,
   verification).
3. Its first turn's role begins with `STUDENT`, case-insensitively.
4. The preceding turn is the turn immediately before it in the session, by
   `sequence_id`. An episode that opens the session has none and yields no
   item.
5. If the preceding turn's role begins with `TUTOR` or `TEACHER`, the item is
   **classifiable**: the model classifies it and a tutor may mark it.
   Otherwise (a student's turn, or any other role) `tutor_move` is `null`,
   nothing is classified, marked or compared. [OURS: `TEACHER` counted as
   tutor]

The window is one turn. [OURS: a convenience, not a theoretical claim about how
far tutor influence reaches; L2-S]

Items depend on the model run. A new generate can change which turns are
items; a stored mark whose turn is no longer an item is kept on disk and left
out of the comparison.

## 5. Mechanics

- One model call per session, over every classifiable item at once. A session
  with no classifiable item makes no call.
- The prompt is composed from `codebook.tutor-moves.json` alone. Episode codes
  never reach it: the layer classifies a tutor turn and never labels an
  episode.
- Output that answers an item twice, misses one, names a turn not asked about,
  or uses a code outside the five is rejected, not repaired
  (`src/moves/classify.ts`).
- Generate runs the episode pipeline, then Layer 2 on what it produced, and
  reports `moves: MovesOutcome` (`{ ok, items, classified }` or
  `{ ok: false, error }`). `classifyMoves` re-runs Layer 2 alone on the stored
  model run.
- Counts are computed in code (CLAUDE.md rule 11).

## 6. Storage shape

On each item's episode in the model run, `data/live/runs/<session>.llm.json`
(`Episode.tutor_prompting`, `src/contract/types.ts`; values illustrative):

```json
"tutor_prompting": {
  "preceding_turn_id": "t41",
  "preceding_speaker": "TUTOR",
  "tutor_move": "NONE",
  "codebook_version": "1.0.0"
}
```

- `preceding_speaker` is the role string as the transcript has it.
- `tutor_move` is one of the five codes, or `null` when the preceding turn is
  not the tutor's.
- `codebook_version` is the Layer 2 codebook's. Nested so it does not collide
  with the episode's own `codebook_version`.
- An episode that is not an item carries no `tutor_prompting`. Re-classifying
  strips a stale one first.

The tutor's marks, `data/live/runs/<session>.moves.json` (`MovesMarks`), apart
from `<session>.human.json`:

```json
{
  "session_id": "demo-a-s02",
  "codebook_version": "1.0.0",
  "annotator_id": "…",
  "simulated": false,
  "created_at": "…",
  "marks": { "t41": "NONE" }
}
```

`marks` maps `preceding_turn_id` to one of the five codes. The API view of an
item is `MoveItemView`; of a session, `SessionMoves` (`app/api.ts`). The
layer's agreement is `WorkspaceState.moves_agreement`, never merged with
`agreement`.

## 7. The gate and its three states

**Comparison.** For each session with both model labels and tutor marks, pair
the model's `tutor_move` with the tutor's mark on the same `preceding_turn_id`
(`src/moves/agreement.ts`). One κ per session, and one pooled over those
sessions in `session_index` order. Only the pooled figure gates.

**Unmarked items.** An item with a model label and no tutor mark is left out,
not counted as a class. [OURS: unlike D17, where an unmarked turn states that
it is not problem solving, an unmarked item here is only unfinished work]

**Wrapper.** The same one as the episode layer: `agreementKappa`
(`src/agreement/kappa.ts`) around Sandpiper's vendored `calculateCohensKappa`,
passed this layer's floors. It refuses rather than returning a number for:
unequal lengths; fewer items than the floor (checked first); a single code
throughout either sequence. Layer 2 adds one more: marks and model labels made
under different Layer 2 codebook versions.

**Threshold.** `config.agreement.threshold`, 0.61. [SOURCE: Landis & Koch
(1977), floor of "substantial", as implemented in
vendor/sandpiper/getKappaInterpretation.ts]

| State | When | Student Report | Tutor Annotation | Internal |
| --- | --- | --- | --- | --- |
| `unmeasured` | No session has tutor marks for this layer. Nothing is computed; reason `no_annotation_run` | No Layer 2 clause | Items shown for marking | State and reason |
| `suppressed` | Marks exist, and either the pooled κ is below 0.61 or the wrapper refused (too few items, a single code, a version mismatch) | No Layer 2 clause | Items shown for marking | κ or refusal reason, per session and pooled |
| `shown` | Pooled κ ≥ 0.61 | §9 clause on NONE items | Items shown for marking | κ, per code, per session |

- The value and its band never reach a learner- or parent-facing surface
  (CLAUDE.md rule 4, D11).
- The Tutor Annotation screen shows the items and takes marks; it does not show
  the model's code for an item, only how many it coded. [OURS: marks made
  blind to the model are the only ones worth comparing]
- This gate is separate from the episode gate and from the session gate
  (CLAUDE.md rule 12): no shared pool, no shared decision, no index across
  them. A κ is a number about two label sequences, not a validation of the
  model or evidence about a learner.

## 8. Item floors

`config/gate0.json` → `moves`:

| Key | Value | Acts on | Tag |
| --- | --- | --- | --- |
| `minItemsForAgreement` | 15 | The pooled κ, the one the gate acts on | [OURS: placeholder, no source] |
| `minItemsForSessionAgreement` | 4 | One session's κ, internal, gates nothing | [OURS: placeholder, no source] |

The episode floors (`minTurnsForAgreement` 100, `minTurnsForSessionAgreement`
30) count turns. A session of 40–80 turns yields a handful of items, so those
floors would refuse every Layer 2 comparison. Both values here are guesses to
be replaced when this project has its own data to set them from.

## 9. Report sentences

The subject is the stretch of work, never the student (CLAUDE.md rule 8).
`<kind of work>` is the episode code's `name` from `codebook.v2.json`.

**Permitted**

| Sentence | Where | Evidence link (rule 7) |
| --- | --- | --- |
| "This stretch of `<kind of work>` opened on the student's turn." | Episode layer alone, where that layer surfaces; needs no Layer 2 | The episode's turn span in the run the report was built from |
| "This stretch of `<kind of work>` opened on the student's turn, with no prompt in the turn before it." | Only when Layer 2 is `shown`, only on an item whose model `tutor_move` is `NONE`, and only on a stretch the episode layer surfaces | The preceding tutor turn and the opening student turn, in the model run |

The other four codes add nothing to the report. [OURS: L2-S licenses one
clause, on NONE]

**Forbidden, at any point**

- "unprompted", "took initiative", "initiative", "spontaneously", "without
  being asked", "on their own" (`lint/banned-phrases.json`,
  `asserted-initiative`).
- Any wording that the student decided, chose, led or initiated anything.
- Any sentence whose subject is the student.
- The NONE clause on any code other than NONE, on a tutor mark rather than the
  model run the report was built from, or while the layer is `suppressed` or
  `unmeasured`.
- Any count, rate or share of stretches with or without a prompt, or any split
  of the work into elicited and spontaneous (CLAUDE.md rule 13: "nothing
  wider").
- Any statement combining Layer 2 with the episode codes into one claim about
  the student, or any index across the layers.
- Any evaluation of the tutor.
- The Layer 2 κ or its band.

## 10. docs/DEVIATIONS.md entries this layer needs

None exists yet (the last entry is D-026). Each needs its own entry before the
layer ships:

- **CROSS-STUDY: Rott et al. 2021 + Zhou et al. 2026.** The episode codebook
  attributes episodes to the dyad and declines to assign work to a speaker;
  this layer uses the episode layer's boundaries to make a claim about one
  turn at a boundary. Justification (owner, L2-S): separate layers, separate
  provenance, and the report never combines them into a statement about the
  student. Would test it: whether human coders asked "which turn opened this
  episode" agree at a rate comparable to their agreement on the episode label.
- **OURS.** Three codes of twenty-eight, plus OTHER_TUTOR_MOVE and NONE (D-A).
  The authors' κ is for the full scheme; a subset's reliability is not
  established by it.
- **OURS.** A one-turn window.
- **EXTRAPOLATION.** A taxonomy developed on authentic tutoring, grades and
  corpus size unreported, applied to simulated one-to-one middle-school
  mathematics. Would settle it: per-code κ from independent double coding of
  grade 6–8 one-to-one tutoring.
- **OURS.** The item floors (§8); unmarked items left out (§7); `TEACHER`
  counted as tutor (§4); marks made blind to the model (§7).

## 11. Open questions

Most consequential first. Each has a recommendation; the owner decides.

- **L2-O1. The seeded demo cannot reach `shown`.** Checked 2026-09-18 by
  reading `GET /api/session/<id>/moves` on the running dev server: the four
  seeded sessions yield **4 items in total** (demo-a-s01: 1, demo-a-s02: 3,
  demo-a-s03: 0, demo-a-s04: no model run), all classifiable, none yet
  classified or marked. That is below the pooled floor of 15, and no session
  reaches even the per-session floor of 4. So once a tutor marks them, the
  layer is `suppressed` with reason `too_few_turns`; before that, it is
  `unmeasured`. With so few items, a single code throughout is also likely,
  which refuses as well. Options: (a) change the demo generator so sessions
  contain more student-opened problem-solving episodes; (b) lower the
  placeholder floors; (c) accept that the demo shows only `unmeasured` and
  `suppressed`. **Recommended: (a)**, because lowering a floor to fit the demo
  is choosing the number for its result. Tradeoff: a generator change and a
  re-seed, and the demo still depends on how the model segments.
- **L2-O2. Which gate is this?** CLAUDE.md bans CROSS-STUDY in Gate 0, and §10's
  first entry is CROSS-STUDY. L2-S says the layer ships only after the episode
  layer works end to end. **Recommended:** record Layer 2 as Gate 1 work and
  this file as its design, so the ban and the entry do not collide. Tradeoff:
  Gate 0's done criteria then say nothing about Layer 2.
- **L2-O3. Which sessions does the pooled κ cover?** As built, every session
  with Layer 2 marks. The report covers only annotated, reportable sessions
  (D16, the session gate). A Layer 2 κ could then rest on sessions the report
  does not contain. **Recommended:** pool over the report's sessions only.
  Tradeoff: fewer items, which makes L2-O1 worse.
- **L2-O4. A report built from an annotation run.** Layer 2 lives on the model
  run, so a report built from an annotation run (D12, O-29) has no item to
  link to. **Recommended:** no Layer 2 clause in such a report, and the
  provenance card says the layer applies to model runs only.
- **L2-O5. What the report shows when Layer 2 does not surface.** L2-S says the
  report is complete without it. **Recommended:** no clause, and one line on
  the provenance card with distinct copy for `suppressed` and `unmeasured`,
  never a number. Tradeoff: one more card line for a family to read.
- **L2-O6. Not built yet.** No code renders either §9 sentence, including the
  episode-layer one (checked by searching `src`, `app`, `scripts`). The gate,
  items, storage, marks and internal view exist; the report integration does
  not.
- **L2-O7. Internal copy says "turns".** The refusal reads "N turns compared"
  and `Agreement.unit` is `turn`, because each item is one tutor turn.
  **Recommended:** keep it; the unit is still a turn. Tradeoff: a reader may
  compare it with the episode floors in turns.
- **L2-O8. Should the tutor ever see the model's code?** As built, no.
  **Recommended:** keep it that way until the tutor's marks for that session
  are saved.

- **L2-O9. How many items does a tutor mark?** As built, at most
  `moves.maxItemsPerSession` (5) per session, drawn with a seed; all of them
  where there are five or fewer. The model classifies every item. The owner
  asked for fewer; five is ours (docs/DEVIATIONS.md D-037).
