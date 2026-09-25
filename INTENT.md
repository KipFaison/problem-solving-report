# INTENT.md

Why this repo exists and what it is allowed to claim. Read with CLAUDE.md
(standing rules) and docs/LAY-OF-THE-LAND.md (what Sandpiper provides).

When a design decision seems reasonable but contradicts something here,
this file wins. Raise it rather than working around it.

## The product

A learner- and parent-facing report showing how problem-solving in a
student's tutoring sessions changed over time. Warm, personal, legible in
two minutes. Closer to a year-in-review artifact than a progress report.

The student and the parent see the same thing. Design for them reading it
together.

This is a product prototype, not a study. The purpose is to visualize
problem-solving process from session transcripts and demonstrate it as a
feature an online tutoring company could ship. The measurement question is
real and deferred, not answered here.

## The demo is the system

The demo must be the working system, not a set of screens showing what a
working system would look like. This is a decision about what the word means
here, written down because it has been read the other way in this repo before.

The whole loop runs, in a browser, when it is asked to. A tutor opens a
session transcript and marks the problem-solving work in it, leaving the rest
unmarked. They save, and the annotation is
stored rather than downloaded and forgotten. They press generate, and the
model runs on that same transcript, through the API, at that moment. The
agreement figure is computed from those two runs, then and there, against
nothing canned. The report shown is built from the model run just triggered.
Going back to an earlier session and changing its annotations changes the
agreement figure. A transcript file dropped in — ours or anyone's — runs the
same loop.

Some sessions arrive already annotated and already run, so there is something
to look at on opening. At least one arrives un-annotated, so the loop can be
walked from the beginning. The sessions that arrive annotated are locked on
the tutor side: their transcripts are not opened there, and they cannot be
re-annotated or re-run. The report still links each of its claims to the
turns behind it in those sessions. Going back and changing an annotation is
shown on the session the tutor annotates during the demo.

The transcripts are simulated, and so are the annotations that arrive with
them: they come from a simulated annotator, not from a person. Every
computation over them is real — the model call, the agreement figure, the
aggregates, the report. Simulated data, real process. Neither half may be
quietly traded for the other. Canned output presented as a live run is the
failure this section exists to prevent, and a real computation over simulated
transcripts is still not evidence about real tutoring, which is the subject of
"Agreement: apparatus, not evidence" below.

## What a tutor is shown

A tutor is not expected to read every turn of a long transcript. Where a
session holds more than one problem, the tutor is shown one whole problem from
it, drawn at random, and marks the problem-solving work in that. A toggle lets
them annotate the whole session instead. Where a transcript does not mark its
problems, the whole session is one problem, so nothing is left out. How many
problems are drawn, and the seed, are set in config. The unit is deliberately
simple; drawing smaller spans is a later refinement.

What was shown is part of the annotation. A saved annotation records exactly
which turns the tutor was shown, and agreement compares those turns and no
others: a turn the tutor never saw is neither an agreement nor a disagreement.
Inside what was shown, an unmarked turn still reads as not problem solving.
The agreement floors count shown turns.

Sampling decides what a tutor reads, not what the report covers. The report is
built from the model run, which reads the whole session.

## Why the report exists

Problem solving has a mechanism, and it is invisible. Someone reads a problem,
sizes it up, plans something, tries it, checks whether it worked, backs out and
tries again. None of that survives the session. What is left afterwards is an
answer, right or wrong, and eventually a grade. The report exists to make the
mechanism legible — to show the work as work, in the order it happened, to a
student and a parent reading it together. It has not been shown to them before.

The argument the report makes is about the session: that an hour of tutoring is
an hour of problem-solving work, exploring and planning and trying and
checking, rather than an hour of information changing hands. It makes that
argument by showing the episodes and their route, and never by asserting it,
so it is only ever as strong as what the episodes show. Where a session's
episodes do not bear it out, the report shows that as plainly, and nothing is
selected or framed to make the case. This is why the diagrams matter more here
than they would in a progress report. A route through kinds of work is
something a reader can look at and recognise; a sentence claiming a student has
developed skills is something a reader has to be told, and it is a sentence
this project cannot write. The names the report uses are not mathematical ones,
because Schoenfeld's episodes describe problem-solving process rather than
mathematics ("Domain generality" below), though nothing here has tested them
outside it. That is a fact about the codebook, not a claim about anyone. A
reader may take from it what they take. The report does not take it for them.

The report should be exciting to receive, and the excitement comes from the
process being visible for the first time, not from a verdict about the person
reading it. This purpose licenses nothing the next section forbids. Nothing
here may say that a skill was acquired, that it transfers beyond the session,
that anyone improved, or that the work was done well. Nor may it say that the
student, rather than the tutor, did the work: episodes span both speakers, and
who steered is not something the episode layer can say. Layer 2 (below) looks
at one tutor turn per boundary, which does not settle it either. If a
sentence, a label or a diagram would only be exciting because it implies one of
those, it comes out. The mechanism is interesting enough by itself, and the
implication would be a claim this project has no way to support.

## What is measured, and what is not

MEASURED: the episode structure of collaborative problem-solving. Which
kinds of work happened, in what order, for how long, across sessions.

NOT MEASURED, and never to be implied:
- What the student knows or understands
- What kind of thinker the student is
- Whether the student improved
- Whether the tutor is good

The unit is an episode: a contiguous span of turns during which the
participants are doing one kind of problem-solving work. Episodes span both
speakers. The process coded is the collaborative one.

This is the most consequential commitment in the repo. Three things follow.

1. The subject of every sentence in the report is the session or the work,
   not the student. "In this session the work moved from exploring to
   planning twice." Not "she planned twice."

2. There is no tutor confound to control for, because nothing here claims a
   behaviour belongs to the student. Do not build statistical adjustment for
   tutor influence. Do not add an elicited-versus-spontaneous split. Both
   presuppose an attribution the codebook explicitly refuses. One exception,
   and nothing wider: inside Layer 2 and behind its own agreement gate, a
   stretch of problem-solving work that opened on a student's turn may be
   said to have had no prompt in the turn before it, where that one tutor
   turn is coded NONE ("Layer 2" below). That is a statement about one
   observed turn, not a split of the work into elicited and spontaneous, and
   nothing else may be built on it. Point 1 still holds for that sentence.

3. Segmentation is core, not deferred. Boundary placement is the hard
   problem and the main source of unreliability. It is not a later concern.

## The codebook

codebook.v2.json is the single source of truth. It generates the LLM prompt,
and the tutor's dropdown and guide for the five codes a tutor marks. There is
exactly one definition of each code in the repo.

Changing a definition is a config edit plus a version bump plus a re-run.
Never a code change. Every annotation record stores the version it was
produced under; a sheet generated under a different version does not import.

Nine codes as of codebook 2.2.0. Seven content-related (reading, analysis,
planning, implementation, exploration, verification, monitor) and two not
(organization, digression). `content_related` exists so an analysis
can exclude codes whose base rates come from recording conditions rather
than from the work. It is not a quality judgement.

Five of the nine are the problem-solving work itself: analysis, planning,
implementation, exploration and verification, which the codebook marks
`in_problem_process`. A tutor marks those five and nothing else, and they are
all a reader is shown. The other four (reading, monitor, organization,
digression) exist for the model to segment with. The model gives every turn a
code, so talk that is not problem solving has somewhere to go other than into
the episodes that are. Those four are never asked of a tutor and never shown to
a reader. A turn the tutor leaves unmarked counts as not problem solving, and
when the two runs are compared, so does any turn the model gave one of the
four. The sources count reading and monitor as problem-solving work; setting
them aside is ours (docs/DEVIATIONS.md D-026).

A code may declare `requires_timestamps`, and one that does must not appear
in the dropdown or the prompt when has_timestamps is false. No code declares
it as of codebook 2.1.0: `writing` did, and was dropped, because it is
defined by a duration read off video and a transcript of talk cannot carry
it. Recording a settled result is organization.

## One layer, this gate

Gate 0 was built around one analysis layer: Schoenfeld episodes, via Li et
al. (2025) operational definitions, with two of Rott et al.'s (2021) three
inductive additions, organization and digression. The third, writing, was
dropped in 2.1.0 ("The codebook" above).

The NTO Tutor Move Taxonomy (Zhou et al., 2026), once planned for Gate 1,
arrives as Layer 2 (next section), after the episode layer works end to end.
It stays a separate layer with its own provenance — it does not merge with,
redefine, or get crosswalked against the episode codes.

Anything not from a source paper is tagged per CLAUDE.md. The codebook
already does this via `adaptation` and `deviation_from_paper`. Keep that
discipline for anything added.

## Layer 2: tutor prompting at episode boundaries

A second, independent analysis layer, not needed for a report to be
complete. Its codebook is codebook.tutor-moves.json, with a version of its
own, separate from the episode codebook's.

What it adds. The episode layer shows where a stretch of problem-solving work
began and whose turn opened it, and no more: on its own it supports "This
stretch of `<kind of work>` opened on the student's turn." Layer 2 looks at the
one turn immediately before each problem-solving episode, in the model's run,
that a student's turn opens. If that turn is the tutor's, it gets one of five
codes: PROMPTING_SELF_EXPLANATION, PROMPTING_SELF_CORRECTION or
GIVING_ANSWER, taken verbatim from the twenty-eight of the NTO Tutor Move
Taxonomy (Zhou et al., 2026); OTHER_TUTOR_MOVE, for any other move in that
taxonomy, next-step prompts, hints and probing included; or
NONE, for a tutor turn with no prompting move at all. The last two are ours.

What it may claim. One sentence, and only where that turn is coded NONE:
"…opened on the student's turn, with no prompt in the turn before it." The
stretch of work is still its subject. It reaches the Student Report only when
the layer's own pooled agreement reaches 0.61; tutor and internal views show the
layer straight away. It may never say "unprompted" or "took initiative", or
that the student decided, chose, led or initiated anything: one turn is
observed, and a tutor who prompted three turns earlier, paused, or waited
still shaped what followed. It describes one tutor turn and is not an
evaluation of the tutor.

Its agreement is its own: a separate Cohen's kappa between the tutor's marks
and the model's codes for those turns, per session and pooled, through the
same wrapper and in the same three states, with an item floor of its own
because the episode floors count turns [OURS: placeholder floors in
config/gate0.json]. Its provenance card gives the authors' figures as
theirs. No index spans the two layers. A claim about whose turn opened a
boundary, beside a codebook that declines to assign episodes to a speaker,
is a real tension [CROSS-STUDY: Rott et al. (2021) + Zhou et al. (2026) →
the two claims sit side by side, in separate layers, never combined into one
statement about the student], and it must carry its justification in
docs/DEVIATIONS.md.

## Domain generality

Schoenfeld's episodes describe problem-solving process, not mathematics.
The construct should transfer to physics, chemistry, programming, formal
logic, and structured writing. The operational definitions do not transfer
as written — Li et al. annotated mathematical reasoning, and the
include-lists and examples are full of equations, substitution, and
theorems.

Concretely, split each code's fields across two files:

  codebook.v2.json               domain-general, one entry per code
    code, name, origin, content_related, requires_timestamps
    definition        stated as the KIND OF WORK, naming no mathematical
                      object. "Executing the chosen approach with concrete
                      values, symbols or objects", not "substituting into
                      the equation"
    include/exclude   the same test, minus mathematical vocabulary
    adaptation, deviation_from_paper

  domains/math.json              domain-specific, keyed by code
    example           the worked illustration
    keywords          surface phrasings ("substituting x = 2", "expanding
                      the expression")
    include_extra     domain-specific clarifications layered on top of the
                      general include list

The prompt builder and the annotator guide compose the two at load time
from `domain` in the run config. A second domain is then a new file in
domains/, not an edit to any definition.

Do not implement a second domain in Gate 0, and do not claim transfer. No
reliability evidence exists for these definitions outside mathematics.
Generalising them is an EXTRAPOLATION requiring its own validation.

## Agreement: apparatus, not evidence

This repo computes a kappa. It does not show it, and it does not claim the
model's labelling has been validated.

That distinction is the point. Agreement is computed internally, at the turn
level, between an annotation run and an LLM run over the same sessions, and it
decides whether the episode layer surfaces at all. It never appears on a
learner- or parent-facing surface, and no figure here is evidence that the
model reads a session correctly. What ships is the apparatus for establishing
that, not the establishment of it.

There is no annotator corps. The project owner may annotate, and those labels
are a run like any other. No inter-rater reliability has been established, and
no claim about validity or reliability is made anywhere in this repo or its UI.

The threshold is 0.61 — the floor of Landis & Koch's "substantial" band, and
inside the "Substantial" band of Sandpiper's own getKappaInterpretation.ts,
which begins just above 0.60 rather than at 0.61. It lives in config as
`AGREEMENT_THRESHOLD = 0.61` and is not re-litigated.

Every layer's provenance card states plainly: no inter-rater reliability has
been established for this layer in this project, and a construct does not
surface unless agreement reaches 0.61. Where a source paper reports its own
figures, show them as the paper's, clearly attributed, never as ours. For the
episode layer there is nothing to show — Li et al. (2025) report no agreement
figure for annotation under their guidebook, only that annotators were trained
until reliability reached an unnamed level.

Three states, and none of them substitutes for another:

- computed, at or above the threshold: the layer surfaces;
- computed, below it: the layer is suppressed, and the report says so without
  showing the number;
- no annotation run to compare against: nothing is computed. The state follows
  from the absence of that run, and someone annotating a session changes it
  while the system is running; it is not a flag set in config. That is not a
  failure and must not look like one.

Build the suppression state as a first-class UI component. It is what the
system does when agreement is unknown or below threshold, and showing it is
the honest core of the demo.

The other gate is independent and also visible: a session is reportable only
if it has enough turns for a metric to have stabilised. Two gates, two
reasons, never merged.

## Wording rules

From docs/03-open-learner-models.md, not yet in the repo (SPEC O-11). Person- and ability-focused feedback is
documented to induce fixed beliefs about one's own ability and reduced
persistence.

- Describe what happened in a session. Never characterise the student.
- No noun phrase naming a type of student, in body text, headings, or labels.
- No comparison to other students, including implicit: "typical", "average",
  "on track".
- Nothing framed as a deficit without something actionable attached, or omit
  it.
- Claim process visibility, not learning gains.
- Simpler representations beat richer ones. Resist the dashboard.

Enforced by a lint script on a banned-phrase list, not by review.

## Out of scope

Not in this repo: soft recommendations to students or parents, tutor
evaluation or coaching, predicting assessment outcomes, cross-student
comparison or norming, inferring affect or engagement, any claim about
knowledge or understanding, and any claim of measured reliability.

Some are good later features. None are this.
