# Multi-customer/multi-topic page segmentation — proposal

## Problem

Today's Notes Intake pipeline (`lib/ai/notes-classify.ts` / `scripts/notes-ingest.mjs`)
assumes **one note/page → one client**. Real backlog material breaks this constantly:

- A daily work log written across multiple customers, one after another on the same page.
- A single Freeform/photo page mixing configuration printouts, credentials, and serials
  for more than one client site visited that day.
- Historical Apple Notes where "folder = client" mostly holds, but a note titled
  e.g. "This week's calls" or "Misc configs" spans many clients with no folder signal at all.

Forcing these through the current single-client classifier means either the AI guesses
wrong for entities that belong to the *other* customer mentioned lower on the page, or a
human has to pre-split the page manually before it ever reaches the intake queue.

## Design

Insert a **segmentation pre-pass** ahead of the existing per-note classification, only for
notes that need it. Two new pieces, both additive to the current model — no route/behavior
change for notes that don't need splitting.

### 1. Schema (additive to `NoteSuggestion`)

```prisma
model NoteSuggestion {
  // ...existing fields unchanged...
  parentSuggestionId String?          // set on a child produced by segmentation
  parent              NoteSuggestion?  @relation("NoteSegments", fields: [parentSuggestionId], references: [id])
  children             NoteSuggestion[] @relation("NoteSegments")
  segmentIndex        Int?            // 0-based order within the parent page
  segmentLabel        String?         // AI's short label for this segment, e.g. "Braddock Medical — daily log 6/3"
}
```

The **parent** row is created exactly like today (one row per uploaded file / walked note),
but instead of running `classifyNote` directly on it, a segmentation step runs first. If the
segmenter finds only one segment, the parent is classified in place (today's path, zero
overhead). If it finds N>1 segments, the parent is marked `status: "SEGMENTED"` (new status,
excluded from the normal review tabs) and N child `NoteSuggestion` rows are created — each
independently classified/extracted through the *existing* `classifyNote` logic, scoped to
just that segment's text. Review, commit, reject, merge — all existing UI and API paths work
unchanged on the children; the parent is just provenance (and "view original page" / "view
all segments from this page" links).

### 2. Segmentation call (`lib/ai/notes-segment.ts`, new file)

Runs once per note, before classification. Cheap heuristic gate first (skip the AI call
entirely when clearly single-topic):

- Text notes: if the note is under ~400 chars, or `clientHint` folder name gives high
  confidence and no other client/company name appears in the body, skip straight to
  `classifyNote` (current path).
- Otherwise (or always, for uploaded images/PDFs where folder structure gives no hint):
  one Claude call against the *same extracted content* already produced for classification
  (so no double OCR/vision cost for images — the segmenter and classifier can share the
  transcription step; only the classification call is duplicated per segment).

Segmenter schema:

```ts
const SegmentSchema = z.object({
  segments: z.array(z.object({
    label: z.string(),                 // short human label, e.g. "Braddock Medical Group"
    clientHint: z.string().nullable(), // best guess company name/alias for this segment, if any
    text: z.string(),                  // the exact slice of the source text/transcription for this segment
  })).min(1),
})
```

System prompt instructs: "This page may contain notes about more than one client, and/or
more than one unrelated topic for the same client (e.g. a daily log entry followed by a
separate printer configuration). Split the content into the smallest set of segments such
that everything in one segment belongs to the same client AND the same topic/task. Do not
split within a single coherent record (e.g. do not split a device's IP/serial/credential
away from its device name). Preserve original wording verbatim inside each segment's `text`
— do not summarize or omit anything; every character of the source should appear in exactly
one segment."

### 3. Wiring

- `scripts/notes-ingest.mjs` (host CLI walk) and `app/api/notes-intake/upload/route.ts`
  (web upload) both call the segmenter after `extractForAI(...)` and before `classifyNote(...)`.
- If 1 segment: today's exact behavior (single `NoteSuggestion`, classified in place).
- If N segments: create the parent row with `status: "SEGMENTED"`, then loop the existing
  create-and-classify logic once per segment, setting `parentSuggestionId`/`segmentIndex`/
  `segmentLabel` on each child. Reuses 100% of `classifyNote` + `sealEntities` + the review
  queue — no new UI required beyond a "part of a multi-segment page" badge and a link back
  to sibling segments (nice-to-have, not required for v1).

### 4. Cost/complexity tradeoff

One extra Claude call per note that needs splitting (skipped for the common single-topic
case via the heuristic gate). Multi-segment notes do N (not N+1) classification calls
instead of 1 — acceptable given this is a one-time backlog cleanup, not a live hot path.

### 5. Rollout

1. Add the schema fields (`prisma db push` — additive, zero risk to existing rows).
2. Add `lib/ai/notes-segment.ts` + a small CLI test script to run it standalone against a
   handful of the messiest real notes in `~/notes-intake-work/` and eyeball the output
   before wiring it into the live upload route.
3. Wire into `scripts/notes-ingest.mjs` first (host-side, offline, `NOTES_INTAKE_WRITES`
   still gates any DB writes) — validate against the full historical backlog in dry-run.
4. Wire into the web upload route once step 3's output looks right.
5. UI: SEGMENTED parent rows hidden from PENDING/etc. tabs by default; optional "Pages"
   view grouping children by `parentSuggestionId` for review-by-source-page instead of
   review-by-entity, if that ends up being a more natural way to work through the backlog.
