# Lay of the Land

Phase 0 orientation for reasoning-trajectory: what NTO's Sandpiper actually provides. This document describes; it proposes nothing.

**Sources**

- `National-Tutoring-Observatory/sandpiper` at `b437988` (2026-09-08), MIT.
- `National-Tutoring-Observatory/RnD` at `f66680a` (2025-07-02). See the license note in §3.
- Local clone: `reference/sandpiper` (gitignored). The `reference/RnD` clone was removed on 2026-09-17; the RnD findings below were made from it and are not re-checkable in this repo.

**Citations** are paths relative to the Sandpiper repo root, with `:line` where useful. `RnD/...` means the prototype.

**Scope.** I read the brief's list. The human-feedback trace also required reading outside it: `app/modules/annotations/containers/annotations.route.tsx` (votes), `app/modules/sessions/helpers/*` and `sessions.types.ts`, `app/modules/runs/helpers/getAnnotationExportFields.ts`, `scripts/evaluations/`, `app/config/ai_gateway.json`, and `app/lib/validation/validateTranscript.ts`.

I did not read the skip list, `documentation/de-identification.md`, the tags module, the external Google Docs guides, `localMode/`, `e2e/`, `seeds/`, or git history (the clone is shallow).

---

## TL;DR

1. **You're right: there is no loop.** No code path lets a human's judgment of an AI annotation change a later LLM call.
   - Human labels (CSV upload) end in κ / precision / recall / F1.
   - Human votes (thumbs up/down plus a reason) end in the run's JSON file, the viewer, and CSV exports.
   - Nothing reads either one into a prompt, an example set, or a codebook. Evidence is in §2.
2. **Two features that look like review are not human.**
   - "Verification" is the same model auditing its own output.
   - "Adjudication" is an LLM choosing among other LLM runs' labels. The picker filters human runs out.
3. **Codebooks feed prompts exactly once.** When a person clicks "Create prompt", one LLM call turns a codebook version into prompt prose. Later codebook versions never touch that prompt; the stored link is only displayed.
4. **The data model is built around run files.** Annotations are not records. They are untyped objects inside a per-run copy of each session's JSON. There is no annotation identity, reviewer identity, student identity, session date, or sub-utterance evidence.
5. **What's reusable.** Four things: the codebook structure, the turn-level transcript field names as a compatibility target, and two files copied verbatim — `getKappaInterpretation.ts` and `calculateCohensKappa.ts`, the calculator behind a wrapper of ours that refuses the two inputs it answers wrongly. Everything else is either wired into Mongo, storage adapters, BullMQ and billing, or written for a unit of analysis this project does not use. Revised 2026-09-17; see §3.

---

## 1. Data model

### 1.1 Where things live

| Thing | Stored as | Defined / written in |
| --- | --- | --- |
| Session metadata | Mongo `Session` | `app/lib/schemas/session.schema.ts` |
| Clean transcript | JSON file `storage/<project>/preAnalysis/<sessionId>/<name>` | `app/modules/runs/services/createRunAnnotations.server.ts:21` |
| Annotations | Inside a per-run copy of the session file: `storage/<project>/runs/<runId>/<sessionId>/<name>` | `createRunAnnotations.server.ts:23`, `app/modules/evaluations/helpers/buildEvaluationReport.ts:38` |
| Run, RunSet, Evaluation, Prompt, PromptVersion, Codebook, CodebookVersion | Mongo | `app/lib/schemas/*.schema.ts` |

Every annotation write downloads the whole session file, mutates it, and re-uploads it. That holds for an LLM run, a human upload, and a single vote alike:

- LLM run: `workers/tasks/annotatePerUtterance.ts:59-157`
- Human upload: `workers/tasks/processUploadHumanAnnotations.ts:59-102`
- Vote: `app/modules/annotations/containers/annotations.route.tsx:57-93`

There is no annotation table and no way to query annotations. An evaluation loads every relevant file into memory (`buildEvaluationReport.ts:43-81`).

### 1.2 Transcript / session

Canonical file shape (`app/lib/schemas/json/transcript.schema.json`; `documentation/transcripts.md:83-129`):

```
{
  transcript: [
    { _id, role, content, start_time?, end_time?, timestamp?, session_id, sequence_id, annotations: [] }
  ],
  leadRole?,
  annotations: [],
  session_id?
}
```

- **Utterance `_id`** is the array index as a string, assigned at ingestion (`workers/helpers/mapFileToTranscript.ts:9`). Human CSV rows are matched on `sequence_id` and then mapped to `_id` (`processUploadHumanAnnotations.ts:63-68`).
- **`role`** is a free string (`Tutor`, `STUDENT_1`, …). The only role semantics is `leadRole`, which an LLM infers per file from the set of unique role names (`app/modules/sessions/helpers/getAttributeMappingFromFile.ts:49-76`; `app/modules/sessions/prompts/leadRole.prompt.json`).
- **Session Mongo doc** holds name, project, file, tags, `inputTokens`, and upload/conversion timestamps (`session.schema.ts:3-19`).
  - There is **no student ID, tutor ID, or date of the tutoring session.**
  - A grep for student/learner/tutor identifiers across `app/lib`, `app/modules/sessions`, `app/modules/runs`, `workers/helpers`, and `documentation/transcripts.md` found nothing.
- **Latent schema mismatch.** The JSON Schema sets `additionalProperties: false` at both utterance and root level (`transcript.schema.json:64,91`). But annotated run files carry `preVerificationAnnotations` at root (`workers/tasks/annotatePerUtterance.ts:132`). The validator isn't called during upload (`documentation/transcripts.md:190`), so nothing trips on it today.

### 1.3 Annotation

Annotations have no schema, only a TypeScript type (`app/modules/sessions/sessions.types.ts:48-53`):

```
{ _id, identifiedBy, markedAs?: "UP_VOTED" | "DOWN_VOTED", votingReason?, [field]: unknown }
```

- **PER_UTTERANCE** annotations are appended to `transcript[i].annotations`, with `_id` equal to the utterance `_id` (`annotatePerUtterance.ts:135-143`). Several annotations on one utterance therefore share an `_id`; only their array position tells them apart.
- **PER_SESSION** annotations go in the root `annotations[]`, with `_id` equal to the array index (`workers/tasks/annotatePerSession.ts:141-144`).
- **System fields.** Every prompt schema gets three: `_id`, `identifiedBy` (default `"AI"`), and `reasoning` (`app/modules/prompts/helpers/defaultPrompts.ts:10-19`; enforced on save in `app/modules/prompts/containers/promptEditor.route.tsx:112-121`).
  - On LLM output, `identifiedBy: "AI"` is a value the model is asked to echo, not something code sets.
  - Human uploads set `"HUMAN"` (`app/modules/humanAnnotations/helpers/buildAnnotationsForUtterance.ts:40-44`).
- **Provenance** (model, prompt version) lives on the run, not the annotation. Exporters attach `_metadata` at export time (`app/functions/outputRunSetDataToJSON/app.ts:97-108`).
- **Evidence** consists of the utterance `_id` the annotation hangs on plus the model's free-text `reasoning`.
  - There are no spans, offsets, or verbatim quotes.
  - Session-level "evidence" exists only if a prompt asks for a string field, such as the `*_evidence` fields in the sample rubric (`defaultPrompts.ts:194-215`). It is not linked to utterance IDs or checked against the transcript.

**From annotation schema to output contract:**

1. `AnnotationSchemaItem = { fieldKey, value, isSystem, fieldType?, codes? }` (`app/modules/prompts/prompts.types.ts:69-75`).
2. Flattened into one example object, `{ annotations: [{ fieldKey: value, ... }] }` (`createRunAnnotations.server.ts:32-38`).
3. Converted to JSON Schema, with `codes` becoming an `enum` (`app/modules/llm/helpers/buildAnnotationSchema.ts:18-67`).
4. Sent as `response_format: json_schema` (`app/modules/llm/helpers/applySchemaToRequest.ts:1-16`).

Field types are limited to boolean, string, and number (`app/modules/prompts/services/suggestPromptAndAnnotationSchemaChanges.server.ts:48-51`). Codes are bare strings; their definitions exist only in prompt prose.

### 1.4 Run

Defined in `app/lib/schemas/run.schema.ts`:

- `annotationType`, `prompt` and `promptVersion` refs, and `sessions[]` with a status per session (`:22-36`).
- **Three kinds of run:**
  - LLM run.
  - Human run: `isHuman`, `annotator.name` (`:13-16`).
  - Adjudication run: `isAdjudication`, `adjudication.sourceRuns` (`:17-21`). `adjudication.disagreements` is declared but never written; it appears only in the schema and `app/modules/runs/runs.types.ts:22`.
- **`snapshot`** is built at creation (`app/modules/runs/services/buildRunSnapshot.server.ts:42-120`):
  - `snapshot.prompt`: name, userPrompt, annotationSchema, annotationType, version, systemPrompt, verifySystemPrompt, adjudicateSystemPrompt.
  - `snapshot.model`: code, name, provider (`:37-53`).
- `shouldRunVerification` (`:59`).

**The snapshot records what was configured, which is not necessarily what ran.**

- Jobs re-read the live PromptVersion at start (`createRunAnnotations.server.ts:25-38`).
- Workers read system prompt files from disk when the module loads (`annotatePerUtterance.ts:15-16`).
- The UI blocks editing a saved PromptVersion (`app/modules/prompts/components/promptEditor.tsx:121,176`), but the server action never checks `hasBeenSaved` (`promptEditor.route.tsx:111-133`).

**Human runs** have `snapshot.prompt.userPrompt = ""`, a schema built from CSV headers (no codes, no types), and no prompt ref (`app/modules/humanAnnotations/services/createHumanRun.server.ts:35-54`; `app/modules/humanAnnotations/containers/humanAnnotations.route.tsx:93`).

### 1.5 Run set

`runSet.schema.ts` holds `sessions[]`, `runs[]`, and `annotationType`. A run set is purely a grouping; its runs must share sessions and annotation type (`documentation/run-sets.md:16-21`).

### 1.6 Evaluation

`evaluation.schema.ts` holds `baseRun`, `runs[]`, `annotationFields[]`, and `report` / `verificationReport` (both Mixed). The report types are in `app/modules/evaluations/evaluations.types.ts:1-24`.

**Compatibility:** runs must have identical session sets and share at least one non-system `fieldKey` (`app/modules/evaluations/helpers/getEvaluationCompatibleRuns.ts:16-37`).

**How the numbers are computed** (`buildEvaluationReport.ts`):

- **Sessions:** only sessions marked DONE in every run count (`:83-98`).
- **Labels:**
  - Per utterance and field, the label is the first annotation on that utterance that has the field, otherwise `""` (`extractAnnotationValues.ts:20-27`). Further annotations, and CSV slots above 0, are ignored.
  - PER_SESSION produces one label per session (`:12-18`).
- **Alignment:** labels for all sessions are concatenated per run. Two runs are then compared by position after truncating to the shorter list (`:182-184`). Nothing aligns on utterance ID.
- **Empty labels:** `""` counts as a category by default (`shouldIncludeUnannotatedSamples: true`, `:27-29`). For sparse codes, the statistic is therefore mostly agreement on "nothing here".
- **Kappa edge cases:** `calculateCohensKappa` returns 1 when expected agreement is 1, so two runs that annotate nothing score κ = 1 (`calculateCohensKappa.ts:37`). It returns 0 on a length mismatch (`:6`).
- **Types:** values are stringified before comparison.
- **Statistics:**
  - Cohen's κ for every pair of runs.
  - Macro-averaged precision/recall/F1 only for pairs that include the base run, with the base treated as gold (`:207-220`).
  - Rounded to 2 decimal places.
- **What's missing:** Fleiss' κ (explicitly deferred, `documentation/evaluation-equations.md:259`), confidence intervals, a per-code confusion matrix, and any stored list of item-level disagreements.
- **`verificationReport`:** κ/P/R/F1 of pre- versus post-verification labels against the base run, for each verified run (`app/modules/evaluations/helpers/buildVerificationReport.ts:37-129`).

### 1.7 Unit of analysis, and what it makes hard

A run is one prompt version × one model × a fixed session set. Each labeled unit is either **one utterance**, addressed by its index-derived `_id`, or **one whole session**. For the two things you're building, this makes several things hard:

- **Across sessions.** Nothing ties a session to a learner or orders sessions in time. A trajectory needs identity and chronology that Sandpiper doesn't store. Tags might offer grouping (see §4).
- **Multi-turn reasoning episodes.** These are neither per-utterance nor per-session. A per-utterance prompt can label each turn, but an episode is not an object anywhere.
- **Focus on the student.** Nothing stops a prompt from targeting non-lead roles. But the system prompts foreground `leadRole` (`workers/prompts/annotatePerUtterance.prompt.md:11`), and every sample prompt is a tutor-move taxonomy.
- **Pointing at evidence.** Granularity stops at the utterance, and session-level claims carry no structured pointer to utterances.
- **Reviewing one specific annotation.** Annotations have no ID of their own.
  - Votes are addressed by array index (`annotations.route.tsx:64-83`).
  - The pre/post verification diff keys on `_id`, so multiple annotations on one utterance collapse into one (`app/modules/sessions/helpers/getVerificationChanges.ts:27-28`).
- **Item-level agreement.** Agreement is stored only pooled, per field and per run pair. Stored data can't answer "which items did the experts and the model disagree on?"

### 1.8 Codebooks: representation, versioning, and prompt generation

**Representation** (`app/lib/schemas/codebook.schema.ts`, `codebookVersion.schema.ts`):

```
Codebook        { name, description ("Intention"), productionVersion }
CodebookVersion { version, hasBeenSaved, categories: [
  { name, description, codes: [
    { code, description, definition,
      examples: [ { example, exampleType: HIT | NEAR_HIT | NEAR_MISS | MISS } ] } ] } ] }
```

**Versioning:**

- A new version deep-copies `categories` from the source version, and its number is the version count + 1 (`app/modules/codebooks/codebookVersion.ts:83-99`).
- A saved version is read-only in the editor (`app/modules/codebooks/components/codebookEditor.tsx:40`).
- There is no diff, no change rationale, and no per-code history.
- The copied objects carry their subdocument `_id`s, so code IDs probably survive across versions. I have not verified this by running it.

**Codebook → prompt** (`app/modules/codebooks/services/createPromptFromCodebook.server.ts`), triggered only by a user action (`app/modules/codebooks/containers/codebook.route.tsx:159-168`):

1. `buildCodebookSummary` renders markdown (`app/modules/codebooks/helpers/buildCodebookSummary.ts:56-98`). It includes the codebook name and intention, each category's name and description, each code's `code` and `definition`, and examples as `- HIT: "..."`. **The code's `description` field is left out.**
2. `buildAnnotationSchemaFromCategories` creates one string field per category (name becomes `UPPER_SNAKE`, codes become an enum), or one flattened field (`:16-54`).
3. One LLM call writes the prompt prose and is told to include code definitions and examples (`:75-104`). It uses the task model `codebookImport`, which `app/config/ai_gateway.json` maps to `anthropic.claude-4.6-opus`.
4. A new Prompt and PromptVersion v1 are created, storing `codebook` / `codebookVersion` refs (`:110-126`).

**After that, the link is display-only.**

- The prompt editor looks it up solely to show the codebook name and version (`promptEditor.route.tsx:58-71`).
- No other code reads `promptVersion.codebookVersion` (grep).
- Examples reach the annotating model only if the generating LLM copied them into the prose. Nothing injects them at annotation time.

### 1.9 Prompts, versions, library, and what the model actually receives

**Data:**

- `Prompt { team, name, annotationType, productionVersion, library?, copiedFrom? }` (`app/lib/schemas/prompt.schema.ts:40-56`).
- `PromptVersion { version, userPrompt, annotationSchema, codebook?, codebookVersion?, hasBeenSaved, inputTokens }` (`promptVersion.schema.ts`).
- A new version copies `userPrompt` and the schema (`app/modules/prompts/promptVersion.ts:79-98`).

**Save flow:**

- Opening the save dialog runs an LLM alignment check: do the prompt text and schema fields agree, and does the prompt contain injection attempts? (`app/modules/prompts/containers/savePromptVersionDialogContainer.tsx:31-49`)
- Save is enabled only when the score is ≥ 0.8 and no injection is flagged (`:78-81`).
- An optional "Get suggestions" button asks an LLM to rewrite the prompt and schema based on the alignment reasoning. A human accepts or rejects the rewrite (`:51-69`; `promptEditor.route.tsx:188-204`).

**Production version** is set by hand (`promptEditor.route.tsx:134-137`). It only preselects a version in the run creator (`app/modules/prompts/containers/promptSelectorContainer.tsx:71-72`).

**Library:**

- Publishing flags a prompt with a description, authors, and paper refs.
- Copying forks the production version into another team, recording `copiedFrom` (`app/modules/prompts/prompt.ts:141-243`; `app/modules/promptLibrary/helpers/copyPromptToActiveTeam.server.ts`).
- No evaluation results travel with a library prompt.

**What one annotation call contains** (`annotatePerUtterance.ts:72-97`; per-session has the same shape):

- **System message:** `workers/prompts/annotatePerUtterance.prompt.md`, with `{{annotationSchema}}` and `{{leadRole}}` substituted.
- **User message:** `<PromptVersion.userPrompt>\n\nConversation: <transcript JSON>`. The transcript is reduced to `_id, role, content`, and times (`app/modules/sessions/helpers/getConversationFromJSON.ts:5-18`).
- **Response format:** the JSON Schema built from the annotation schema.

That is the entire message list: no few-shot turns, no example store, no retrieval.

**LLM plumbing** (`app/modules/llm/llm.ts`):

- The provider comes from `LLM_PROVIDER` (`:66`): `AI_GATEWAY` (Cornell/LiteLLM, OpenAI-compatible, streaming) or `OPEN_AI` (`app/modules/llm/providers/*.ts`).
- Every call checks the team's credit balance and writes a billing ledger entry (`:86-153`).
- An optional "orchestrator" message makes the model score its own output and retry using its own critique (`:159-203`). Only file conversion uses it (`app/functions/convertSessionDataToJSON/app.ts:51`).

### 1.10 `app/functions`

- **Live:**
  - `splitDataToSessions`, imported by `app/modules/uploads/services/convertFileToFiles.tsx:3`.
  - The four `output*` exporters, called from the export workers.
- **Dead:** `annotatePerSession/`, `annotatePerUtterance/`, `convertSessionDataToJSON/`, and `annotateRunSessions.tsx`.
  - Grep finds no importers outside these files themselves.
  - They are the RnD handlers ported to TypeScript, with older system prompts (no `reasoning` requirement, no `leadRole`).
  - The live annotation path is `workers/tasks/annotatePer*.ts`, dispatched by `workers/runners/tasks.ts:29-49`.
- `annotatePerUtterance/prompts.json` is an RnD fixture. Each entry has an `examples: [{ _id: "0", text: "" }]` placeholder that no code in either repo reads. A few-shot slot was sketched and never wired in.

### 1.11 RnD in brief

RnD is the same loop without the application:

```
split → convert (LLM) → annotate per utterance/session (LLM) → merge human + AI → CSV
```

- It is driven by a task list (`RnD/shared/pipeline/runLocal.js`, reading `tasks.local.json`).
- Human annotations are simply more objects in the same array, with `identifiedBy: "HUMAN"` (`RnD/exampleOutput.json:51-115`; `RnD/functions/mergeHumanAndAISessionData/app.js:25-33`).
- Comparison happens by eye, in a CSV with hardcoded `teacherMove` columns (`RnD/functions/outputSessionDataToCSV/app.js:22-31`).
- There are no metrics and no loop.

**Bugs seen while reading:**

- `splitDataToSessions`: the skip/limit test is wrong (`app.js:36`), and records are JSON-encoded twice (`:45`).
- `mergeHumanAndAISessionData`: `return`s out of the whole loop at the first missing human file (`app.js:22`).
- Per-utterance handler: iterates the parsed response directly, but `json_object` mode makes that an object, not an array (`annotatePerUtterance/app.js:39`).
- Per-session handler: writes `annotation` instead of `annotations` (`annotatePerSession/app.js:39`).

Sandpiper fixed the split bugs.

---

## 2. Human feedback: every path in, and where it ends

### 2.1 Answer

You're right. **Expert judgment about AI output never changes a subsequent LLM call.**

**What I checked in `app/modules/prompts` and `app/modules/promptLibrary`.** I read the models, helpers, services, and main routes in full, and grepped all 58 non-test files for cross-module imports and API calls.

- **Cross-module imports** are limited to:
  - annotation-type enum helpers
  - codebook services, for the display link only (`promptEditor.route.tsx:11-12,58-71`)
  - `RunService.count` in the delete guard (`app/modules/prompts/containers/prompt.route.tsx:176-180`)
  - a `PromptReference` type
- **Nothing imports** evaluations, humanAnnotations, sessions, or storage.
- **The only API call** these modules make is to `/api/promptVersionAlignment` (`savePromptVersionDialogContainer.tsx:43,64`). The two services behind it take **only the prompt text, the schema, and the alignment model's own reasoning.** They receive no annotations, human labels, votes, or metrics:
  - `app/modules/prompts/services/checkPromptAndAnnotationSchemaAlignment.server.ts:5-17,88-105`
  - `suggestPromptAndAnnotationSchemaChanges.server.ts:5-21,97-118`
  - Note that the suggestion service's function is also named `checkPromptAndAnnotationSchemaAlignment` (`:5`), a copy-paste name.

**The only improvement loop that exists is manual and unrecorded.** A person reads κ, edits a prompt or codebook, saves a new version, and re-runs. Nothing records which evaluation or which disagreements motivated a version.

### 2.2 Paths by which human judgment enters

| # | What the human does | Where it's written | What reads it | Ends in |
| --- | --- | --- | --- | --- |
| A | Writes codebook codes, definitions, and HIT / NEAR_HIT / NEAR_MISS / MISS examples | CodebookVersion (Mongo) | `createPromptFromCodebook.server.ts:51-104`, on click only | One LLM call that drafts a prompt. **Changes later LLM calls,** but as authored instructions, once, at prompt creation. Later codebook versions don't propagate (§1.8). |
| B | Writes or edits prompt text or schema | PromptVersion | Copied into every annotation call's user message (`createRunAnnotations.server.ts:30,74-78`) | **Changes later LLM calls,** because it *is* the instruction. This is authoring, not feedback on outputs. |
| C | Accepts an LLM-suggested prompt rewrite | PromptVersion | Same as B | Changes later calls. The suggestion is based on prompt/schema consistency, not on output quality. |
| D | Uploads human labels as a CSV with `annotator[name][slot]field` columns | Human Run plus per-session files with `identifiedBy: "HUMAN"` (`humanAnnotations.route.tsx:93-129`; `processUploadHumanAnnotations.ts:63-81`) | `buildEvaluationReport`, `buildVerificationReport`, exporters, viewer | **Metrics only.** |
| E | Picks the base run (usually a human run) | `Evaluation.baseRun` | P/R/F1 pairing (`buildEvaluationReport.ts:213-220`); top-performer ranking (`app/modules/evaluations/helpers/getTopPerformersVsGoldLabel.ts:30-51`) | Metrics and ranking. See the indirect effect below. |
| F | Clicks thumbs up/down and writes a reason (≤280 chars) on an annotation in the run session viewer | Mutates the annotation object inside the run's session file (`annotations.route.tsx:10-23,57-93`; UI in `app/modules/sessions/containers/runSessionViewerContainer.tsx:85-122`, `app/modules/sessions/components/runSessionViewerAnnotation.tsx:115-136`) | The viewer; CSV exporters, which add `markedAs` / `votingReason` columns (`app/modules/runs/helpers/getAnnotationExportFields.ts:4-14`); the offline evaluation script, if pointed at `markedAs` as a field (`scripts/evaluations/README.md:41`) | **Storage and CSV export.** Grep for `markedAs`, `votingReason`, `UP_VOTED`, `DOWN_VOTED` finds no reader in evaluation, prompts, codebooks, adjudication, verification, or any worker. |
| G | Selects runs and a model for adjudication | Adjudication Run | Adjudication worker | An LLM call over those runs' labels. The evaluation then re-runs (`workers/tasks/finishAnnotateRun.ts:36-43`), ending again in metrics. |
| H | Toggles verification, sets the production version, or publishes to the library | Run / Prompt | Worker flag; selector default; library listing | Configuration, not judgment on items. |

**The one indirect influence (D/E → G).**

1. Human labels set the κ ranking.
2. The adjudication dialog preselects the top three **non-human** runs by κ against the base run (`app/modules/evaluations/containers/adjudicationDialog.container.tsx:25-32`).
3. Those runs' labels go to the adjudicator LLM.

The human labels themselves never appear in that call: `workers/helpers/buildAdjudicationPrompt.ts:50-52` loads only the source runs, and the preselection is editable.

**Edge case:** the server action checks only that the selected runs belong to the run set (`app/modules/evaluations/containers/evaluation.route.tsx:122-137`). A hand-crafted request naming a human run as a source would put human labels into an adjudication prompt. The UI never offers that option.

**Problems with vote data, if you wanted to use it:**

- No reviewer ID or timestamp is recorded.
- A second reviewer's vote overwrites the first.
- Re-clicking the same vote clears it, and any vote click wipes the saved reason (`annotations.route.tsx:14-18`).
- Votes are addressed by array index.
- The whole file is read and rewritten, so concurrent reviewers race (last write wins).

### 2.3 Things that look like feedback but are model-on-model

| Mechanism | What happens | Where |
| --- | --- | --- |
| Verification | The same model, with the same prompt, reviews its own annotations and returns a corrected set. The original set is saved as `preVerificationAnnotations`. | `annotatePerUtterance.ts:101-133`; `workers/prompts/verifyPerUtterance.prompt.md` |
| Adjudication | Where source runs disagree, an LLM picks the label; agreements are copied through. Disagreement is detected by transcript index, comparing each run's last annotation. | `buildAdjudicationPrompt.ts:128-187`; `workers/tasks/adjudicatePerUtterance.ts:74-148` |
| Orchestrator retry | The model scores its own output (0/1 plus reasoning) and retries with that reasoning. | `llm.ts:159-203` |
| Prompt alignment / suggestions | An LLM checks prompt text against the schema and can rewrite both. | §2.1 |

The adjudicator's user prompt comes from the first non-human run in the evaluation (`evaluation.route.tsx:70-76`), even if the source runs used different prompts.

---

## 3. Reusability

**Revised 2026-09-17.** Sections 1 and 2 above are unchanged and still describe Sandpiper accurately. Only the reusability judgement changed. **Revised again later the same day**, after the decision that the annotation interface ships and that a kappa is computed internally: see (a), the retraction below, and the pointer paragraph in §4.

The reason is one thing, stated here once and referred to below. Our unit of analysis is the episode: a contiguous span of turns, spanning both speakers. Sandpiper has no span, segment, episode, or boundary concept anywhere in its data model or its schemas — the unit is a single utterance, `_id` assigned as the array index at ingestion (§1.2, §1.7). That is not a gap to work around; it is where the two designs part ways, and it sits upstream of nearly everything below. Two things follow. First, an episode tiling is ours to produce, so the machinery that reads Sandpiper's annotations out of per-run session files has nothing to attach to. Second, "droppable into Sandpiper later" is not a constraint on any decision here, so the annotation plumbing is not worth matching either. Almost everything the earlier version of this section listed under (a) is in (c).

One sentence in the earlier version of this paragraph is retracted: it said no kappa is computed in this project. A kappa is computed. It is one Cohen's κ at the turn level, between one annotation run and one LLM run, and it is computed internally — it lives in a non-learner-facing view beside a side-by-side rendering of the two tilings, it acts on whether the episode layer surfaces, and the value itself never reaches a learner- or parent-facing surface. Nothing presents it as evidence that the model is validated; this repo is the apparatus such a validation would need, not the validation. That is why the calculator is in (a) below while the rest of the metric stack stays in (c): Gate 0 compares exactly two runs, once, at the turn level.

**Sandpiper license:** MIT, "Copyright (c) 2025 National Tutoring Observatory" (`LICENSE`). There are no per-file headers. Keep the LICENSE text with anything you copy.

**RnD license:** RnD has no LICENSE file. Its `package.json` says `"license": "MIT"`, with no copyright holder named.

### (a) Files you can copy directly, with attribution

Two files.

| File | Depends on | Test | Notes |
| --- | --- | --- | --- |
| `app/modules/evaluations/helpers/getKappaInterpretation.ts` | — (zero imports) | no | Landis & Koch bands. Already copied verbatim, with attribution, to `vendor/sandpiper/getKappaInterpretation.ts`. It is the source of `AGREEMENT_THRESHOLD = 0.61`, the floor of the "substantial" band. |
| `app/modules/evaluations/helpers/calculateCohensKappa.ts` | — (zero imports) | yes (`app/modules/evaluations/__tests__/calculateCohensKappa.test.ts`) | The turn-level agreement number: two equal-length, positionally aligned label sequences in, one κ out. That is what two tilings of the same session give, each turn carrying exactly one code under each run. Copy verbatim, with attribution, alongside `getKappaInterpretation.ts`. Two verified defects come with it: it returns 1 when expected agreement is 1, so two runs that annotate nothing at all score κ = 1 (`:37`), and it returns 0 on a length mismatch instead of raising (`:6`). Vendoring it does not mean inheriting those answers. A thin wrapper of ours refuses unequal-length input and refuses the degenerate single-category case, rather than returning a number for either [OURS: "not computable" and "computed, and low" are different states and must not arrive as the same float]. Upstream's own test pins the single-category case at 1 (`calculateCohensKappa.test.ts:49-55`), so it cannot be used to check the wrapper. |

Nothing else is copied.

### (b) Designs worth reimplementing, but not copying

Two, both already settled. Take the shape; write the code.

| Design | Why it's worth having | Why not copy the code | Where |
| --- | --- | --- | --- |
| Codebook structure: categories, codes, typed examples (HIT / NEAR_HIT / NEAR_MISS / MISS), versioned with one designated production version | An expert-facing structure that already separates boundary cases from clear ones, and pins each annotation to a stated version. Partly in use in `codebook.v2.json`: nine codes, a plain `example` on seven of them, one `codebook_version`. The typed examples and the designated production version are not in that file (docs/SPEC-gate0.md §11, O-26). | Mongoose-bound. Versions are deep copies, with no diff, no change rationale, and no per-code history (§1.8). | `codebook.schema.ts`, `codebookVersion.schema.ts`; `app/modules/codebooks/codebookVersion.ts:83-99` |
| Transcript field names at the turn level: `_id`, `role`, `content`, `session_id`, `sequence_id`, `annotations` | Shape compatibility keeps open the option of comparing our output against NTO's corpus later. | A compatibility target, not code: only the field names are matched. It holds at the turn level and stops there. Episodes are ours and have no Sandpiper analogue, so nothing above the turn transfers. The validator and its JSON Schema are in (c). | `app/lib/schemas/json/transcript.schema.json`; `documentation/transcripts.md:83-129` |

### (c) Things to deliberately not reuse

Everything else, for the reason at the top of this section. The detail below is why each one would not have paid off anyway.

- **The rest of the metric helpers** — `calculatePRF1.ts`, `calculateMeanKappa.ts`, `buildPairwiseMatrix.ts`, `getTopPerformersVsGoldLabel.ts`, `evaluations.types.ts`. Not because no kappa is computed — one is, and `calculateCohensKappa.ts` moved to (a) — but because Gate 0 compares exactly two runs, once. Two runs are one pair, so there is no matrix to build and no mean across pairs to take; no run is treated as gold, so there is no top-performer ranking; and macro-averaged P/R/F1 over every class seen, `""` included (`calculatePRF1.ts:16,46-47`), answers a question nobody here asks. `buildPairwiseMatrix.ts` would be worth a second look in a later gate that compares more than two runs, though `getKappaCellClass.ts` would not, since it returns Tailwind classes naming Sandpiper's own design tokens (`:10-15`).
- **The evaluation report builders** — `buildEvaluationReport.ts`, `buildVerificationReport.ts`, `extractAnnotationValues.ts`, `extractPreVerificationAnnotationValues.ts`. Their semantics are utterance-shaped in a way that does not lift to episodes: labels are aligned by position after truncating to the shorter list, only the first annotation on an utterance counts, and `""` is a class by default (§1.6). `loadAllSessionFiles`, exported from the same file, needs `SessionService`, the storage adapter, and `fs-extra`.
- **The annotation-schema and prompt helpers** — `buildAnnotationSchema.ts`, `applySchemaToRequest.ts`, `buildCodebookSummary.ts`, `codifyName.ts`, `codebooks.types.ts`, `getConversationFromJSON.ts`, `mapFileToTranscript.ts`, and `workers/prompts/{annotate,verify,adjudicate}Per{Utterance,Session}.prompt.md`. Each assumes the per-utterance or per-session unit: `mapFileToTranscript.ts:9` is what assigns `_id` as the array index, and the system prompts are written around `{{leadRole}}` and one label per turn. `buildCodebookSummary.ts` also leaves out each code's `description` field (§1.8), and `applySchemaToRequest.ts` is OpenAI-style `response_format` only.
- **The human-annotation CSV plumbing and its parsers** — the whole `app/modules/humanAnnotations/` module: `parseAnnotationColumns.ts`, `buildAnnotationsForUtterance.ts`, `buildAnnotationTemplateColumns.ts`, `buildAnnotationTemplateRows.ts`, `buildAnnotationSchemaFromHeaders.ts`, and `analyzeHumanCsv` / `createHumanRun` / `uploadHumanAnnotations`. It is a spreadsheet round trip: a coder types code strings into `annotator[name][slot]FIELD` columns in Excel and uploads the file, matched back per utterance on `sequence_id`. No component anywhere in the app writes a human label; there is no in-app annotation authoring surface. Gate 0 builds one, and what it writes is an episode — a contiguous turn range plus one code — which has no column in that format. (`extractAnnotationCsvMeta.ts` also drops escaped quote characters; the worker path uses `csv-parse` instead.)
- **The transcript validator and its JSON Schema** — `app/lib/validation/validateTranscript.ts`, `app/lib/schemas/json/transcript.schema.json`. `additionalProperties: false` at both utterance and root level (`:64,91`) rejects anything added to the shape, including Sandpiper's own annotated run files (§1.2) and certainly our episode records. The turn-level field names are a target in (b); validation is ours.
- **The vote fields** — `markedAs` / `votingReason` on the annotation object. Human input to Sandpiper is exactly this plus the CSV round trip, and neither can carry review: there is no reviewer id and no timestamp, a second vote overwrites the first, any vote click wipes the saved reason, the viewer keys rows by array index so a vote cannot be ordered in time or survive a re-run that reorders the array, and the whole session file is rewritten on every vote (§2.2). The annotation interface that ships in Gate 0 is an authoring surface — open a session, select a contiguous turn range, assign a code — and not a review one. None of the review interface ships; Gate 0 only leaves room for it, with stable, addressable episode ids and `reviewer_id` / `reviewed_at` present in the schema though nothing writes them yet.
- **Download-mutate-upload of whole files for annotation writes** (`annotations.route.tsx:57-93`). Concurrent reviewers will race.
- **The LLM class and providers** — `app/modules/llm/llm.ts`, `app/modules/llm/providers/*`, `modelRegistry.ts`, `registerLLM.ts`, `getLLM.ts`, `app/config/ai_gateway.json`. Every call checks a team's credit balance and writes a billing ledger entry to Mongo (`llm.ts:86-153`); there is a self-scoring retry loop; model output is parsed with a bare `JSON.parse` (`providers/aiGateway.ts:78`); and the model codes and cost headers are specific to the Cornell gateway and LiteLLM.
- **The storage adapters** — `app/modules/storage/`, including `getStorageAdapter.ts` and `registerStorageAdapter.ts`. They exist to serve the per-run copy-of-the-session-file layout in §1.1, which we do not have.
- **The Mongo services** — the Mongoose schemas and `*.server.ts` services behind Session, Run, RunSet, Evaluation, Prompt, PromptVersion, Codebook, and CodebookVersion, plus the BullMQ `TaskSequencer` and the sockets around them. Application plumbing for a multi-team research app.
- **The UI components and `app/uikit`** — routes, containers, components, and the shared kit. Auth is GitHub OAuth and ORCID, i.e. researcher identities; there is no role model and no tutor-facing surface. The reader here is a student and a parent. That reason holds unchanged now that an annotation interface ships: no Sandpiper screen authors a span, so that interface is built rather than borrowed.
- **The run-level designs the earlier (b) listed** — the run snapshot, the pre/post verification diff and κ delta, adjudicate-only-the-disagreements, the prompt/schema alignment and injection check on save, the provider registry keyed by env var, and the RnD task-list pipeline. Each is built around a run of one prompt version × one model over utterances, and each ends in a number we do not compute — the one κ we do compute needs none of them. The snapshot is also not what executes (§1.4), the verification diff keys on `_id` so multiple annotations on one utterance collapse (`getVerificationChanges.ts:27-28`), and adjudication compares by transcript index and never persists disagreements.
- **The dead `app/functions` handlers (§1.10), especially `convertSessionDataToJSON/user.prompt.json`.** It tells the model to estimate missing timestamps, inventing data in evidence-bearing transcripts.
- **LLM-inferred `leadRole`** (`getAttributeMappingFromFile.ts:58-76`). Speaker roles get assigned nondeterministically, in a report about a specific student.
- **The sample taxonomies in `defaultPrompts.ts`** (Talk Moves, Tutor Moves, Tutoring Quality Rubric), unless you first confirm their sources and citation requirements. MIT covers NTO's text; I can't tell whether it covers the underlying frameworks.
- **RnD code** (bugs in §1.11; no LICENSE file).

---

## 4. Open questions

### Things I'm unsure of, or would be guessing

1. **Code IDs across codebook versions** (§1.8). This matters if expert judgments reference a code. Verify by running `createNextVersion` against a test database.
2. **Other versions of Sandpiper.** A deployed instance may differ from `main@b437988`, or NTO may have non-public tooling for prompt and codebook refinement. My "no loop" answer covers this repo only.
3. **The external Google Docs guides** linked from the docs (Prompt Writing Guide, Upload Instructions; `documentation/overview.md:31-32`). They may describe a human refinement process that isn't in code. Not read.
4. **The tags module** (skipped per your list). It may be the only existing way to group sessions by student.
5. **`documentation/de-identification.md` and `mtmDataset.md`** (not read). Unknown whether the MTM data or the de-identification step carries or strips learner identity and session dates.
6. **Transcript length across runs.** Evaluation assumes different runs of the same session have transcripts of equal length (positional alignment). They're all copied from the same `preAnalysis` file, so I expect so, but nothing enforces it.
7. **Whether `identifiedBy` is reliably `"AI"` on LLM output.** The model echoes a schema default; code doesn't set it. I didn't sample real outputs.
8. **The adjudicator's prompt** comes from the first non-human run, whatever prompts the source runs used (§2.3). Whether that's intended can't be determined from code.
9. **Project history and plans.** I read no git history, issues, or PRs, so I can't say how recently votes and verification were added or whether a loop is planned.
10. **RnD license status** beyond the `package.json` field.

### Decisions that are yours

**Answered since this was written (2026-09-17).** The list below is left as
written, because it is the record of what was open after the survey. Where to
find the answers: 1 in docs/SPEC-gate0.md §10 (run standalone; take three
things, copy two files) and 3 in its §5.3 (evidence is turn ids: a start and end
turn plus the span between them); 2 in INTENT.md (the episode, with student and
session order supplied upstream in a manifest); 4 in INTENT.md and
docs/SPEC-gate0.md (one Cohen's κ, at the turn level, computed internally and
never shown to a learner or a parent) and 5, for the eventual reviewer-facing
question, in docs/SPEC-review.md; 9 in NOTICE. Items 6, 7 and 8 are still open.

1. **Relationship to Sandpiper.** Fork and extend its app (Mongo, storage adapters, BullMQ, Cornell gateway)? Consume it as an upstream annotator through its JSONL/CSV exports? Or run standalone, copying only (a)?
2. **Unit of analysis for "reasoning development."** Utterance, multi-turn episode, or session? And how are a student and the order of their sessions established, given Sandpiper has neither?
3. **Evidence representation.** Utterance ID only (as Sandpiper does), or spans or verbatim quotes checked against the transcript?
4. **Which agreement statistic gates report claims.** Pairwise Cohen's κ (what exists) or Krippendorff's α / Fleiss' κ for several experts? Per code or per field? Does `""` count? What minimum sample size? Intervals?
5. **What an expert judgment is.** Accept/reject, relabel, edit evidence, rationale? Stored per reviewer, timestamped, immutable? Sandpiper's vote fields don't answer this.
6. **What "improves the codebook and prompts" means.** Human-approved edits with a rationale, automated prompt revision, few-shot selection from reviewed items, or a mix? And how will items used for improvement be kept out of the set that measures agreement?
7. **Whether LLM verification and adjudication belong in a pipeline that experts review,** given both can change labels before a human sees them.
8. **Model provider and data governance** for student transcripts. Sandpiper routes everything through Cornell's gateway.
9. **How to attribute copied MIT files** (NOTICE file, per-file header, or both), and whether to ask NTO about RnD.
