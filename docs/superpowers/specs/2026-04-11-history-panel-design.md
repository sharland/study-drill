# History Panel — Design Spec

**Date:** 2026-04-11
**Status:** Approved
**Scope:** MCQ first; flashcards identical treatment once MCQ is verified

---

## Problem

Session history is currently ephemeral (resets on page load) and only visible on the review screen after completing a test. There is no way to see past performance without running another session first.

## Goal

Persist session history per deck and surface it on the front page start screen, so a user can see their progress immediately on load without having to complete a new test.

---

## Data model

### Deck identity

On first import a UUID is generated and stored in localStorage. If a deck with the same `quiz_name` / `deck_name` is re-imported, the existing UUID is reused so history accumulates. A different name is treated as a new deck and gets a fresh UUID. This means a typo or minor rename in `quiz_name` will orphan the old history — acceptable at this stage given the local-only scope.

localStorage keys (MCQ shown; flashcards mirror with `fc_` prefix):

| Key | Value |
|---|---|
| `mcq_deck` | `{ quiz_name, questions }` — already exists |
| `mcq_deck_id` | UUID string — new |
| `mcq_history_<uuid>` | Array of session records — new |

### Session record

```json
{
  "ts": 1712345678000,
  "cat": "Clause 9",
  "pct": 70,
  "ok": 14,
  "miss": 6,
  "tot": 20
}
```

`cat` is `null` when the user drilled "All" categories. `ts` is a Unix millisecond timestamp — natural sort key and database-ready for future migration.

### History cap

A maximum of 20 session records are kept per deck. On write, if the array exceeds 20, the oldest record is dropped.

### Clear behaviour

Clearing a deck removes the deck, its `mcq_deck_id`, and its `mcq_history_<uuid>` key together. No orphaned records.

### Orphaned history

If a new deck is imported (different name), the old history key remains in localStorage but is unreferenced. These are small strings and harmless; no active cleanup needed at this stage.

---

## UI — Start screen history panel

Rendered below the start button. Hidden when the sample deck is loaded.

### Layout

Two sub-sections inside a single dark card (matching existing start-screen card style):

**Recent** — last 5 sessions, most recent first. Each row: session number, score %, category, correct/missed counts.

**By section** — one row per tested category, sorted by average score ascending (weakest first — most actionable). Each row: category name, session count, average %.

**No history state** — panel renders but shows a single muted line: `No sessions recorded yet`.

### Option B readiness

The panel is implemented as a `HistoryPanel(props)` function receiving `history` (array) and `deckName` (string). When a future version introduces a dedicated History view (Option B), this function lifts directly into that view without rewriting logic.

---

## Code changes

| Location | Change |
|---|---|
| `handleImport` (MCQ + FC) | Generate UUID on import; reuse if same deck name; persist `mcq_deck_id` / `fc_deck_id` |
| `useState` initialisers | Restore `deckId` and `history` from localStorage on load |
| `nextQ` (MCQ session end) | Write completed session record to `mcq_history_<uuid>` and update in-memory `history` |
| `mark` (FC session end) | Same as above for `fc_history_<uuid>` |
| `clearDeck` | Remove deck + deck_id + history key |
| Start screen JSX | Add `<HistoryPanel>` below start button; hidden on sample deck |
| New `HistoryPanel` function | Pure render function; shared between MCQ and FC |

---

## Edge cases

| Scenario | Behaviour |
|---|---|
| Re-import same deck name | UUID reused; history accumulates |
| Import different deck name | New UUID; fresh history |
| Session interrupted (tab switch, page close mid-quiz) | Not recorded — only completed sessions write |
| History cap reached | Oldest record dropped on write; max 20 per deck |
| Clear deck | UUID + history removed together |

The "session interrupted = not recorded" rule intentionally aligns with the future exit-session feature (open work item F2): that feature will rely on the same principle.

---

## Out of scope

- Flashcard history panel — implemented in a follow-up once MCQ is verified
- Alternate colour schemes
- Export of history data
- Cross-device sync (future database concern)
