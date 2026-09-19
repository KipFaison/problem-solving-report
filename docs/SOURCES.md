# Sources

Four PDFs are now on disk: docs/2603.05778v1.pdf (CC BY 4.0, NOTICE §3) and
three in docs/reference/. All four are read locally and cited, not
redistributed (NOTICE §3, §4). Their licences differ and it matters, because
two of the three in docs/reference/ may be redistributed and one may not:

- `docs/reference/s11858-021-01244-3 (2).pdf` — Rott et al. (2021). CC BY 4.0,
  stated on p. 752. Redistributable with attribution; so are its figures.
- `docs/reference/2603.08406v2.pdf` — the Sandpiper paper. CC BY 4.0, but
  asserted only in the PDF's embedded metadata, not printed on any page.
- `docs/reference/2509.14662v1.pdf` — Li et al. (2025). **Not
  redistributable**, and therefore **gitignored** as of 2026-09-17: it carries
  only the arXiv perpetual non-exclusive distribution licence 1.0, again only
  in embedded metadata, and the authors retain copyright. Keep the local copy
  for reading; it is cited rather than shipped (O-28 resolved).
- `docs/reference/rott-2021-fig5.png` — Fig. 5 of the Rott et al. article,
  tracked and redistributed, under that article's CC BY 4.0 licence
  (NOTICE §3).

Everything else is paywalled or licensed in ways that do not permit
redistribution. This file is the citation list and where to obtain each.

Undermind workspace with all four literature searches and full ranked paper
lists:
https://app.undermind.ai/projects/14b01a56-c9b1-4c14-966c-7b9caa9e0a0e

---

## Tier 0 — the Gate 0 layer

The one analysis layer Gate 0 builds. Added 2026-09-17, resolving O-3.

**Schoenfeld's episode categories**
Schoenfeld, A. H. (1985). *Mathematical Problem Solving*. Academic Press.
The origin of the episode construct: six categories, per Li et al. §2.2.
Not in this repo and **not opened**. Every definition this project uses comes
from Li et al.'s operational guidebook, not from the book.
→ Print; not open access.

**Li, Zhang, Fan, Jiao, Fu, Peters, Xu, Lissitz, Zhou (2025)**
*Understanding the Thinking Process of Reasoning Models: A Perspective from
Schoenfeld's Episode Theory.* arXiv:2509.14662v1 [cs.AI], 18 Sep 2025.
The source of the operational definitions in codebook.v2.json, via its
Appendix E (Sentence-level Annotation Guidebook, pp. 18–22), which defines
seven categories: Read, Analyze, Plan, Implement, Explore, Verify, Monitor.
Six are Schoenfeld's; Monitor is this paper's addition (§2.2, p. 3).
What it annotated: DeepSeek-R1 reasoning traces on SAT Mathematics items —
38 responses, 915 paragraphs, 3,087 sentences, by three trained annotators
after a pilot (§3.1–3.2, pp. 3–4). No human speech, no dialogue, no tutoring.
**No agreement figure is reported**: §1 (p. 2) says only that annotators were
trained until inter-rater reliability reached a level it does not name.
Appendix D defines a separate three-category paragraph level (General,
Explore, Verify); this project uses the sentence level only, which is a
hierarchy this project flattens (docs/DEVIATIONS.md).
→ arXiv: https://arxiv.org/abs/2509.14662 — local copy in docs/reference/,
  gitignored, not redistributable. Full citation in docs/CITATIONS.md.

**Rott, B., Specht, B., & Knipping, C. (2021)**
*A descriptive phase model of problem-solving processes.* ZDM — Mathematics
Education, 53(4), 737–752. doi:10.1007/s11858-021-01244-3. CC BY 4.0 (p. 752).
The source of three inductive additions — organization, writing, digression —
added when Schoenfeld's deductive types did not fit (p. 743). Three, not four:
this settles O-12. `writing` is defined by a video duration threshold of 30 s,
which has no analogue in a text-only log (p. 743).
What it coded: video, not transcripts (p. 743) — 33 problem-solving processes,
25 hours, groups of university pre-service teachers in an Elementary Geometry
course in Northern Germany (§4.1–4.2, pp. 741–742). Ages are not stated.
Fig. 5 (p. 746), "Descriptive model of problem-solving processes", is the design
reference for the report's visual schematic; transcribed in
docs/reference/rott-2021-fig5.md.
→ Open access; local copy in docs/reference/.

---

## Tier 1 — codebooks from the superseded three-layer plan

None of these is the episode layer. Gate 0 was built around one layer,
Schoenfeld episodes (INTENT.md, "One layer, this gate"). The NTO Tutor Move
Taxonomy, once planned for Gate 1, is now used by Layer 2, an independent layer
with its own codebook, `codebook.tutor-moves.json` (INTENT.md, "Layer 2"); the
other two are not used in this project. The citations stay for the record.

**PEERMATHDIAL — student collaborative problem-solving acts**
Murong Yue, Desmond Alexander Mcglone, Emily Slutz, Wenhan Lyu, Yixuan Zhang,
Jennifer Suh, Ziyu Yao. BEA 2026.
20 acts across six functional stages. 55 middle-school math sessions, 6,406
turns. GPT-5.4 induced and applied labels; two experts audited 100 turns; no
chance-corrected IRR.
→ ACL Anthology, BEA 2026 proceedings.

**Classification of Student Struggle in Mathematics**
Hannah Levin, Madhura Padwal, Nchimunya Mwiinga. BEA 2026.
Four mutually exclusive states. Grade 4–5 math classrooms, NCTE Classroom
Transcript Analysis. 98-item validation set; Fleiss' kappa 0.534
pre-discussion, 0.961 post-consensus.
→ ACL Anthology, BEA 2026 proceedings.

**NTO Tutor Move Taxonomy**
Zhuqian Zhou, Kirk Vanacore, Tamisha Thompson, Jennifer St John, René Kizilcec.
arXiv, 2026.
28 tutor moves in four families. Authentic one-to-one tutoring, multiple
providers; corpus counts not reported. Two veteran teachers, full scheme;
Cohen's kappa .65 in the first round and .78 in the second round, after
clarifications and minor alterations (p. 4). Used by Layer 2: three of the
twenty-eight moves, plus two codes of ours (docs/DEVIATIONS.md D-028, D-030).
The authors' agreement is not established for that subset.
→ arXiv; local copy at docs/2603.05778v1.pdf (CC BY 4.0), cited, not
  redistributed.

## Tier 2 — read before Gate 1 and Gate 2

**Codebook-injected segmentation**
Jinsook Lee, Kirk Vanacore, Zhuqian Zhou, Bakhtawar Ahtisham, René Kizilcec.
arXiv 2601.12061 / ACL 2026.
The span-versus-utterance argument, plus gold-label-free segmentation metrics.
Code: github.com/National-Tutoring-Observatory/codebook-injected-segmentation

**Sandpiper**
Hedley, Pietrzak, Dias, Burden, Ahtisham, Zhou, Vanacore, Marland, Slama,
Reich, Koedinger, Kizilcec (2026). *Sandpiper: Orchestrated AI-Annotation for
Educational Discourse at Scale.* arXiv:2603.08406v2 [cs.HC], 5 Apr 2026, 7 pp.
Cite as a preprint; no venue is printed. Section and figure numbers below are
v2's.
Code: github.com/National-Tutoring-Observatory/sandpiper (MIT)
Read 2026-09-17. It corroborates, from the authors' side, what
docs/LAY-OF-THE-LAND.md established from the code: the unit of annotation is
the utterance (Fig. 2, p. 4), and segmentation is listed as future work (§5,
p. 6), so there is no span or boundary concept to inherit. Fig. 5's legend
(p. 6) bins κ ≥ 0.61 as Substantial in the shipped dashboard, which
corroborates AGREEMENT_THRESHOLD = 0.61 as the authors' own boundary. Fig. 2
also shows both halves of the codebook structure this project takes but has
not implemented — near-miss examples and a prompt version flagged Production
(docs/SPEC-gate0.md §11, O-26).
See docs/LAY-OF-THE-LAND.md for what the code does versus what the paper
claims.
→ arXiv; local copy in docs/reference/2603.08406v2.pdf.

**Million Tutoring Moves (MTM v1)**
Kizilcec, Vanacore, Zhou, Pietrzak, Dias, Zhang, Ahtisham, Marland.
arXiv 2605.08092.

## Tier 3 — the four research briefs, by brief

Full ranked lists (122 / 151 / 225 / 150 papers) are in the Undermind
workspace. These are the items most worth reading.

### Brief 1 — trajectory and the tutor confound
- White, Zahner & White (2024). Catalyzing teacher moves in small-group
  problem solving: a quantitative discourse analysis. IJRME. — the Poisson
  exposure-response method. Read in full before implementing conditional rates.
- van der Steen et al. (2019). The Link between Microdevelopment and Long-Term
  Learning Trajectories in Science Learning. Human Development.
- Powell, Francisco & Maher (2003). An analytical model for studying the
  development of learners' mathematical ideas and reasoning using videotape
  data. JMB. 410 citations.
- Ohlsson et al. (2007). Beyond the code-and-count analysis of tutoring
  dialogues. AIED. — read as a critique of our own method.
- Beal, Mitra & Cohen (2007). Modeling learning patterns with HMMs. AIED.
- Boyer et al. (2011). Dialogue Structure and Tutoring Effectiveness: An HMM
  Approach. IJAIED.
- Abdelshiheed, Jacobs & D'Mello (2024). Aligning Tutor Discourse Supporting
  Rigorous Thinking with Tutee Content Mastery. AIED.

### Brief 2 — expert feedback loops
- Chen et al. (2026). From Tool to Teammate: LLM Coding Agents as
  Collaborative Partners for Behavioral Labeling in Educational Dialogue
  Analysis. arXiv. — THE central result. Held-out 0.78 vs dev 0.91–0.93, and
  regression on further iterations. Read in full.
- Xu et al. (2026). Enhancing LLM-Based Data Annotation with Error
  Decomposition. LAK26. — boundary ambiguity vs conceptual error.
- Ahtisham et al. (2025). AI Annotation Orchestration: Evaluating LLM
  Verifiers. LAK26. — Kizilcec group; what Sandpiper's authors built instead
  of a feedback loop.
- Ganesh et al. (2024). Prompting as Panacea? ICL for Qualitative Coding of
  Classroom Dialog. EDM. — the fine-tuning comparison.
- Chew et al. (2023). LLM-Assisted Content Analysis. arXiv. 174 citations.
- Liu et al. (2025). Qualitative Coding with GPT-4: Where it Works Better. JLA.
- Hao et al. (2024). Automated Coding of Communications in Collaborative
  Problem-Solving Tasks Using ChatGPT. JEM.

### Brief 3 — open learner models
- Bull (2020). There are Open Learner Models About! IEEE TLT. — start here.
- Mitrović & Martin (2007). Evaluating the Effect of Open Student Models on
  Self-Assessment. IJAIED. 193 citations.
- Al-Shanfari et al. (2020). Visualising alignment to support students'
  judgment of confidence in open learner models. UMUAI.
- Matcha et al. (2020). Systematic Review of Learning Analytics Dashboards:
  An SRL Perspective. IEEE TLT. 306 citations.
- Jivet et al. (2018). License to evaluate. LAK. 285 citations. — the
  comparison-harm finding.
- Long & Aleven (2017). Enhancing learning outcomes through SRL support with
  an Open Learner Model. UMUAI.
- Tacoma et al. (2020). Enhancing learning with inspectable student models:
  Worth the effort? CHB. — usage vs access.
- Mueller & Dweck (1998); Kamins & Dweck (1999). — person vs process praise.
  This is the basis for the wording rules in CLAUDE.md.

### Brief 4 — synthetic fidelity
- Scarlatos et al. (2026). Simulated Students in Tutoring Dialogues: Substance
  or Illusion? ACL.
- Do, Sonkar & Sachan (2026). Simulating Students or Sycophantic Problem
  Solving? arXiv. — the misconception failure.
- Ion & Collins-Thompson (2026). Measuring Simulation Fidelity via Statistical
  Detectability. L@S. — potentially usable directly as our synthetic-real gap
  metric.
- Borchers, Vie & Azevedo (2026). LLMs as Students Who Think Aloud: Overly
  Coherent, Verbose, and Confident. arXiv.
- Li et al. (2025). How Real Is AI Tutoring? arXiv.
- Lotterhos, Moore & Stapleton (2018). Analysis validation has been neglected
  in the Age of Reproducibility. PLoS Biology. — standards for recovery studies.
- Wu et al. (2025). Embracing Imperfection: Simulating Students with Diverse
  Cognitive Levels. arXiv. — possible mitigation for low-variance output.

---

## Datasets

**MathDial** — github.com/eth-nlped/mathdial. 2,861 semi-synthetic dialogues.

## Note on the brief summaries

The four research briefs were generated from Undermind searches based on
abstracts and metadata, not full texts. Where a claim in a brief drives a
design decision, read the source paper before relying on it.
