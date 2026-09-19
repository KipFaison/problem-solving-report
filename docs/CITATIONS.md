# Citations

Every source this project relies on, in one place, with what it is used for and
whether it may be redistributed.

This is the reference list. `docs/SOURCES.md` is the working companion: it says
where to obtain each item, which pages Claude may read without asking, and what
the four research briefs surveyed. `NOTICE` is the legal notice for the files
actually redistributed here.

---

## The Gate 0 analysis layer

The episode codebook rests on three sources, and only these three.

**Schoenfeld, A. H.** (1985). *Mathematical Problem Solving.* Orlando, FL:
Academic Press.
The origin of the episode construct, with six categories. Not held in this
repository and **not opened**; it reaches this project only through Li et al.
below, which is where every operational definition comes from.

**Li, M., Zhang, N., Fan, C., Jiao, H., Fu, Y., Peters, S., Xu, Q.,
Lissitz, R., & Zhou, T.** (2025). *Understanding the Thinking Process of
Reasoning Models: A Perspective from Schoenfeld's Episode Theory.* In
*Proceedings of the 2025 Conference on Empirical Methods in Natural Language
Processing*, pp. 18267–18288. Association for Computational Linguistics.
https://doi.org/10.18653/v1/2025.emnlp-main.922
Earlier as a preprint, arXiv:2509.14662v1 [cs.AI],
https://arxiv.org/abs/2509.14662, which is the version `codebook.v2.json`
cites.
Appendix E, the Sentence-level Annotation Guidebook (pp. 18284–18288), is the
source of the operational definitions adapted in `codebook.v2.json`: Read,
Analyze, Plan, Implement, Explore, Verify, Monitor. Six are Schoenfeld's;
Monitor is this paper's own addition (§2.2, p. 3 of the preprint). The example sentences in
`codebook.v2.json` are quoted, wholly or partly, from Appendix E.
*Licence:* the EMNLP 2025 version is CC BY 4.0
(https://creativecommons.org/licenses/by/4.0/), ©2025 Association for
Computational Linguistics. The arXiv preprint carries only the arXiv perpetual
non-exclusive licence to distribute v1.0, asserted in the PDF's embedded
metadata, with copyright retained by the authors. Cited here, not shipped
(NOTICE §4).

**Rott, B., Specht, B., & Knipping, C.** (2021). A descriptive phase model of
problem-solving processes. *ZDM – Mathematics Education, 53*(4), 737–752.
https://doi.org/10.1007/s11858-021-01244-3
The source of three inductive additions — organization, writing, digression —
made when Schoenfeld's deductive types did not fit (p. 743). Figure 5 (p. 746)
is the design reference for the report's visual schematic.
*Licence:* CC BY 4.0, stated on p. 752. The paper is cited, not
redistributed; Figure 5 is redistributed (NOTICE §3).

**Landis, J. R., & Koch, G. G.** (1977). The measurement of observer agreement
for categorical data. *Biometrics, 33*(1), 159–174.
The agreement bands. `AGREEMENT_THRESHOLD = 0.61` is the floor of the
"substantial" band. Reached this project through the band implementation in
`vendor/sandpiper/getKappaInterpretation.ts`; the paper itself is cited, not
held here.

**Cohen, J.** (1960). A coefficient of agreement for nominal scales.
*Educational and Psychological Measurement, 20*(1), 37–46.
The statistic computed in `docs/SPEC-gate0.md` §5.4, via the vendored
implementation.

## Layer 2

Tutor prompting at episode boundaries (`INTENT.md`, "Layer 2"): a separate
layer, with its own codebook, `codebook.tutor-moves.json`, its own version and
its own agreement. It rests on one source.

**Zhou, Z., Vanacore, K., Thompson, T., St John, J., & Kizilcec, R.** (2026).
*Tutor Move Taxonomy: A Theory-Aligned Framework for Analyzing Instructional
Moves in Tutoring.* arXiv:2603.05778v1.
https://doi.org/10.48550/arXiv.2603.05778
28 tutor moves in four families, from authentic one-to-one tutoring; the
authors do not report corpus counts. Used by Layer 2: three moves,
PROMPTING_SELF_EXPLANATION, PROMPTING_SELF_CORRECTION and GIVING_ANSWER, are
taken by name from Table 1, each stated in this project's own words, beside
two codes of ours, OTHER_TUTOR_MOVE and NONE (`docs/DEVIATIONS.md` D-028,
D-030). Agreement as the authors report it, for the full scheme: two veteran
teachers; Cohen's κ .65 in the first round and .78 in the second round, after
clarifications and minor alterations (p. 4). It is not established for the
three moves used here (D-028). The authors describe the taxonomy as a living
framework. Once planned for Gate 1.
*Licence:* CC BY 4.0. Cited, not redistributed (NOTICE §3).

## The software this project borrows from

**Hedley, D., Pietrzak, D., Dias, J., Burden, I., Ahtisham, B., Zhou, Z.,
Vanacore, K., Marland, J., Slama, R., Reich, J., Koedinger, K., &
Kizilcec, R.** (2026). *Sandpiper: Orchestrated AI-Annotation for Educational
Discourse at Scale.* arXiv:2603.08406v2 [cs.HC].
https://arxiv.org/abs/2603.08406
Cite as a preprint; no venue is printed on it.
*Licence:* CC BY 4.0, in the file's embedded metadata. Cited, not
redistributed (NOTICE §3).

**NTO Sandpiper** (software), National Tutoring Observatory, commit b437988
(2026-09-08). https://github.com/National-Tutoring-Observatory/sandpiper
*Licence:* MIT, © 2025 National Tutoring Observatory. Two files are copied
verbatim into `vendor/sandpiper/` with attribution: the Cohen's kappa
computation and the Landis & Koch band interpreter (NOTICE §1). What is taken
and what is declined: `docs/SPEC-gate0.md` §10 and
`docs/LAY-OF-THE-LAND.md` §3.

## Codebooks considered and not used

**Yue, M., Mcglone, D. A., Slutz, E., Lyu, W., Zhang, Y., Suh, J., & Yao, Z.**
(2026). *PeerMathDial: A Middle School Dialogue Dataset for Student
Collaborative Math Problem Solving.* Proceedings of the 21st Workshop on
Innovative Use of NLP for Building Educational Applications (BEA 2026),
668–684. https://doi.org/10.18653/v1/2026.bea-1.47
20 acts across six functional stages, from 55 middle-school sessions and 6,406
turns; labels induced and applied by a model, with two experts auditing 100
turns and no chance-corrected reliability reported. Considered as a layer and
dropped. Kept for the record.

**Levin, H., Padwal, M., & Mwiinga, N.** (2026). *Classification of Student
Struggle in Mathematics.* BEA 2026.
Four mutually exclusive states, from grade 4–5 mathematics classrooms. Fleiss'
κ 0.534 pre-discussion and 0.961 post-consensus on a 98-item set, as the
authors report them. Considered as a layer and dropped.

## Read before Gate 1 and Gate 2

**Lee, J., Vanacore, K., Zhou, Z., Ahtisham, B., & Kizilcec, R.** (2026).
*Codebook-injected segmentation.* arXiv:2601.12061 / ACL 2026.
The span-versus-utterance argument, and gold-label-free segmentation metrics —
the live candidate for the boundary question in `docs/SPEC-gate0.md` §11, O-18.

**Kizilcec, R., Vanacore, K., Zhou, Z., Pietrzak, D., Dias, J., Zhang, Y.,
Ahtisham, B., & Marland, J.** *Million Tutoring Moves (MTM v1).*
arXiv:2605.08092.

## Datasets

**MathDial.** https://github.com/eth-nlped/mathdial
2,861 semi-synthetic dialogues.

## Evidence behind the wording rules

The wording rules in `INTENT.md` and `CLAUDE.md` rule 8 are evidence-based, not
stylistic. They rest on:

**Mueller, C. M., & Dweck, C. S.** (1998). Praise for intelligence can
undermine children's motivation and performance. *Journal of Personality and
Social Psychology, 75*(1), 33–52.

**Kamins, M. L., & Dweck, C. S.** (1999). Person versus process praise and
criticism. *Developmental Psychology, 35*(3), 835–847.

**Jivet, I., Scheffel, M., Drachsler, H., & Specht, M.** (2018). License to
evaluate: Preparing learning analytics dashboards for educational practice.
LAK 2018. — the comparison-harm finding behind the ban on "typical", "average"
and "on track".

**Bull, S.** (2020). There are open learner models about! *IEEE Transactions on
Learning Technologies, 13*(2), 425–448.

## A note on the four research briefs

`docs/SOURCES.md` Tier 3 lists roughly forty further papers, by brief. Those
briefs were generated from literature searches over abstracts and metadata, not
full texts, and the briefs themselves are not in this repository
(`docs/SPEC-gate0.md` §11, O-11). Where a claim from one of them drives a
design decision, the source paper is read first, and the reading is recorded in
`docs/DEVIATIONS.md`.
