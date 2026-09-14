# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A single-file, zero-build study app: `study-drill.html`. Open it directly in a browser — no server, npm, or build step needed. React 18 and Babel are loaded via CDN; JSX is transpiled in-browser.

## Architecture

Everything lives in `study-drill.html` inside a single `<script type="text/babel">` block (~609 lines), in this order:

- **Pure block** (`/* PURE-START */` … `/* PURE-END */`) — plain JS, no JSX/React/DOM: `shuffleArray`, `generateUUID`, `validateFlashcards`, `validateMcq`, `orderByBox`, `shuffleMcqOptions`, `summarise`, `sectionStats`, `createStore`. Only `function` declarations and `var` at top level, so `tests/run.js` can slice it out and run it under Node.
- **`store`** — `createStore(localStorage)`. The only place that touches `localStorage`; keys `fc_deck`, `fc_deck_id`, `fc_srs`, `mcq_deck`, `mcq_deck_id`, `mcq_history_<uuid>`. Writes return `false` on failure (surfaced as `STORAGE_ERR`). Phase 2 of the commercialisation plan swaps this object for a Supabase-backed one.
- **DOM utilities** — `renderMd` (marked + DOMPurify), `downloadJSON`.
- **Hooks** — `useKeys(active, handler)`, `useDeck(kind, sample, validate, onImport)`, `useHistory(deckId, {persist})`.
- **Templates** (`FC_TEMPLATE`, `MCQ_TEMPLATE`) — JSON schemas with embedded Claude prompting instructions.
- **Theme** — `makeTheme({accent, onAccent})`; `T_FC` (orange) and `T_MCQ` (blue). Greys and widths are shared; only the accent differs.
- **Shared components** — `Toolbar`, `StartScreen`, `SessionList`, `ReviewScreen`, `HistoryPanel`. Presentational; take the theme as `t`.
- **`FlashcardDrill`** — quiz-phase JSX, `mark`, 3-box Leitner box transitions (`fc_srs`), local styles `fsQ`. History is ephemeral (`persist:false`).
- **`MCQQuiz`** — quiz-phase JSX, `confirmAns`/`nextQ`, local styles `msQ`. History persists per deck UUID (`persist:true`).
- **`App`** — tab switcher.

Data flow: JSON files are imported via `Toolbar` → `useDeck.importFile` → validator → `store.saveDeck`. Sessions end via `useHistory.endSession`, which stamps `ts` and `sess` and, when persisting, appends through the store (capped at 20).

## Tests

`node tests/run.js` — no dependencies. Slices the pure block out of the HTML and runs `node:assert` cases against it with a Map-backed storage stub. Run it after any change to the pure block or the store. UI flows are checked by a scripted browser smoke against the `launch.json` static server (`http://localhost:8765/study-drill.html`); `file://` cannot be used because the Browser pane disables storage for it.

## Specs and plans

Implementation specs live in `docs/superpowers/specs/`. Start there when picking up planned work mid-session.

## Open work

Add new items as dated bullet points under a `### DD Month YYYY` heading. Claude converts bullets to numbers and tracks them here. Bugs prefix with `[Bug]`, features with `[Feature]`. Completed items are removed (history is in git).

### 13th September 2026

Findings from a full code review (Fable), post-fix-batch. The fix batch already landed: MCQ review lookup, Enter double-fire, stricter import validation (duplicate/null ids, exactly-4 options, correct-label match), DOMPurify sanitising of markdown output. These are what's left.

5. **[Bug] Leitner SRS has no spacing** — Boxes only affect drill *ordering* (box 1 first), not *scheduling*; every session still drills the whole pool. Not a bug in the box-transition logic (hit → +1 capped at 3, miss → box 1, which is correct), but the UI implies spaced repetition it doesn't do. **Decided 14 Sep 2026: session-based scheduling** — box *n* due every 2^(n−1) sessions, counted per deck; start screen shows the due count with a "drill everything" override. Build with item 7, after the shared-structure refactor (`docs/superpowers/specs/2026-09-14-shared-structure-refactor-design.md`).
6. **[Bug, low priority] Missed-only retry promotes SRS boxes** — Retrying missed cards via "Missed Only" writes SRS same as a fresh session, so a miss-then-immediate-correct can promote a box within the same sitting. Standard Leitner wouldn't count a same-session retry. Fix: skip SRS writes when `startQuiz` is called with an explicit subset.
7. **[Feature] Flashcard history panel** — Roll out the MCQ history panel pattern to FlashcardDrill. Identical data model (`fc_deck_id`, `fc_history_<uuid>`). Verify MCQ history in use before starting. **Fold in while here:** move `fc_srs` under the same per-deck UUID so re-importing a flashcard deck (e.g. to fix a typo) doesn't wipe SRS progress the way it does today — MCQ already preserves history on name-match, flashcards should get the same treatment. The `persist` flag on `useHistory` and `fc_deck_id` already exist; the remaining work is the history key, the SRS key, and rendering `HistoryPanel` on the flashcard start screen. **Do first, same hook:** (a) `useHistory` is currently called with `store.loadDeckId(kind)` read during render (a workaround for `onImport` needing `reset` before `useDeck` exists) — rework to an `onImport` ref inside `useDeck` so `deck.deckId` is the single source of truth (~5 lines); (b) `ReviewScreen` renders session history with no `isSample` guard while `HistoryPanel` has one — add the guard or pass an empty history for the sample deck.
8. **[Bug, low priority] Session numbers aren't persisted** — MCQ history caps at 20 records and re-derives `sess` from array index on reload, so once older records fall off the cap, session numbers shift (a session shown as "#21" reads as "#20" after a reload). Store `sess` in the record itself. `endSession` already writes `sess` into stored records; `useHistory.load` just needs to stop overwriting it.
9. **[Feature] Accessibility pass** — WCAG AA contrast fails in several places: secondary/label text at `#444`–`#666` on the dark backgrounds is 2.0–3.5:1 (need ≥4.5:1); floor it around `#8a8a8a`. Also: the Import control is a `<label>` wrapping a `display:none` file input, so it's not keyboard-reachable (use visually-hidden instead of display:none); category filter pills are `<span onClick>` with no keyboard or focus support (should be `<button aria-pressed>`).
10. **[Feature, low priority] Error boundary** — A render throw currently blanks the whole page with no recovery. A small boundary with a "reset local data" button would let a corrupted localStorage value be cleared without editing devtools.

### 7th April 2026

1. ~~**[Feature] History panel on front page**~~ — **Done (MCQ).** UUID deck identity, localStorage persistence capped at 20 records, start-screen panel with Recent + By Section views. Known limitations: (a) missed-only retry sessions are indistinguishable from full sessions in history; (b) importing deck A → deck B → deck A again orphans deck A's original history (name-match identity limit — acceptable at local scope).
2. **[Feature] Exit active session** — Allow user to exit a flashcard or MCQ session without recording it. Currently only achievable by switching tabs.
3. **[Feature, low priority] Customisable template instructions** — Ability to customise the AI instructions embedded in the template JSON for different AI systems or quiz approaches. May require architectural rethink first (see below).

## Architectural notes

### 13th September 2026

Done 14 Sep 2026 — see `docs/superpowers/specs/2026-09-14-shared-structure-refactor-design.md`.

### 7th April 2026

The single-file app is growing large (~590 lines as of 11 Apr 2026). A structural plan is needed before adding more substantial features — the concern is load time and maintainability as the file approaches and exceeds 600 lines of inlined JSX and style objects.

## JSON data files

- `flashcard-template.json` / `mcq-template.json` — template schemas (mirrors of the embedded constants)
- `flashcards.json` / `mcq.json` — example populated decks
- `study/` — user's own JSON decks

Flashcard schema: `{ deck_name?, cards: [{ id, category, question, answer }] }`
MCQ schema: `{ quiz_name?, questions: [{ id, category, question, options: [{label, text}], correct, explanation }] }`
