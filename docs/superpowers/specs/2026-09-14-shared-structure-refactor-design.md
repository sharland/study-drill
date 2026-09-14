# Shared Structure Refactor
**Date:** 2026-09-14
**Status:** Design approved, pending implementation plan

---

## Context

`study-drill.html` is a single-file, zero-build React app (~596 lines). `FlashcardDrill` and `MCQQuiz` are ~70% duplicated: deck load/import/clear/export, toolbar, start screen, review summary, session history rendering, keyboard effect, and two near-identical style objects. All `localStorage` access is inline at ~14 call sites.

This refactor extracts the genuinely shared parts into hooks, presentational components, a theme factory and a storage module, while each mode keeps its own quiz-phase JSX and state logic. It is behaviour-preserving: same features, same storage keys, same flows. It is the groundwork for open-work items 7 (flashcard history panel), 8 (persisted session numbers) and 11 (consolidated history rendering), and gives Phase 2 of the commercialisation plan a single seam to swap `localStorage` for Supabase.

## Goals

- Remove the duplication between the two mode components.
- Put every `localStorage` read/write behind one `store` object.
- Make the pure logic (validation, ordering, shuffling, stats, store) testable from Node without a build step.
- Keep the file openable directly from disk and keep all existing user data working unchanged.

## Non-goals

- No `localStorage` key migration. `fc_srs` stays a single global key until item 7.
- No Leitner scheduling change (item 5 — decided separately: session-based due-ness, to be built with item 7).
- No accessibility changes (item 9).
- No exit-session button (item 2).
- No async storage. The store is synchronous; Phase 2 makes it async.
- Pixel-identical output is not required. Section 6 lists the one deliberate visual change.

---

## 1. File layout

Still one `study-drill.html`, one `<script type="text/babel">` block. Block order:

1. **Pure logic** — delimited by `/* PURE-START */` and `/* PURE-END */`. Plain ES2020: no JSX, no React, no `document`/`window`. Contains `shuffleArray`, `generateUUID`, `validateFlashcards`, `validateMcq`, `orderByBox`, `shuffleMcqOptions`, `summarise`, `sectionStats`, `createStore`.
2. **Templates and samples** — `FC_TEMPLATE`, `MCQ_TEMPLATE`, `SAMPLE_FC`, `SAMPLE_MCQ`, unchanged.
3. **Theme** — `makeTheme(accent)`.
4. **Shared components** — `Toolbar`, `StartScreen`, `ReviewScreen`, `SessionList`, `HistoryPanel`.
5. **Hooks** — `useDeck`, `useHistory`, `useKeys`.
6. `FlashcardDrill`, then `MCQQuiz`, then `App`.

`renderMd` and `downloadJSON` touch the DOM and stay outside the pure block, placed with the shared components.

The markers exist so `tests/run.js` can slice the pure block out of the HTML. Babel still transpiles the whole block in the browser; the pure section simply contains nothing that needs transpiling.

## 2. Storage seam

```js
const store = createStore(localStorage);
```

`createStore(backend)` takes anything with `getItem/setItem/removeItem` and returns:

| Method | Key | Notes |
|---|---|---|
| `loadDeck(kind)` | `fc_deck` / `mcq_deck` | Returns `{name, items}` or `null`. Normalises `deck_name`/`cards` and `quiz_name`/`questions` to `name`/`items`. |
| `saveDeck(kind, {name, items})` | same | Writes the existing on-disk shape (`deck_name`+`cards` or `quiz_name`+`questions`) so the stored JSON is unchanged. |
| `clearDeck(kind)` | same | |
| `loadDeckId(kind)` / `saveDeckId(kind, id)` / `clearDeckId(kind)` | `fc_deck_id` / `mcq_deck_id` | `fc_deck_id` is new and additive; nothing reads it until item 7. |
| `loadHistory(id)` | `mcq_history_<id>` | Returns `[]` on missing/corrupt. Key prefix stays `mcq_history_` for existing data; item 7 decides the flashcard prefix. |
| `appendHistory(id, rec)` | same | Applies the 20-record cap inside the store. |
| `clearHistory(id)` | same | |
| `loadSrs()` / `saveSrs(srs)` / `clearSrs()` | `fc_srs` | |

`kind` is `"fc"` or `"mcq"`.

Every read is try/caught and returns its default on missing or corrupt data. Every write is try/caught and returns `true`/`false`; callers surface `false` as "Could not save to browser storage." instead of the current misleading "Invalid JSON." path.

`createStore` is the Phase 2 seam: the Supabase implementation replaces this one object.

## 3. Pure functions

- `validateFlashcards(data, fallbackName)` → `{ok:true, name, items}` or `{ok:false, error}`. Accepts `{deck_name?, cards}` or a bare array. Checks: non-empty array; every card has non-null `id`, truthy `question` and `answer`; ids unique. Error strings are the ones already in the file.
- `validateMcq(data, fallbackName)` → same shape. Checks: non-empty array; every question has non-null `id`, truthy `question`, `options` array, truthy `correct`; exactly 4 options; `correct` matches an option label; ids unique.
- `orderByBox(pool, srs)` → box-1 cards shuffled, then box-2, then box-3 (current `startQuiz` behaviour).
- `shuffleMcqOptions(q)` → copy of `q` with options shuffled, relabelled A–D, and `correct` remapped. Tracks the correct option by object identity, not by text, so identical option texts can't mislabel.
- `summarise(results)` → `{ok, miss, tot, pct}` with `pct` 0 when `tot` is 0.
- `sectionStats(history)` → the by-section aggregation currently inline in `HistoryPanel`: `[{cat, count, avg}]` sorted by `avg` ascending, `cat` defaulting to `"All"`.

## 4. Hooks

**`useDeck(kind, sample, validate)`** → `{items, name, deckId, isSample, err, importFile(file), clear(), exportDeck()}`.
- Initial state from `store.loadDeck(kind)` falling back to `sample`.
- `importFile` reads the file, runs `validate`, resolves `deckId` (reuse stored id when the stored deck name matches, else `generateUUID()` — today's MCQ rule, now applied to both kinds), saves deck and id, clears `err`. On validation failure sets `err`; on store write failure sets the storage error.
- `clear` removes deck and id, resets to sample.
- `exportDeck` calls `downloadJSON` with the on-disk shape and the current filename rule.
- `isSample` is `items === sample`, as today.
- Mode-specific import side effects (flashcards clear `fc_srs`) are done by the component via an `onImport` callback argument.

**`useHistory(deckId, {persist})`** → `{history, sess, startSession(), endSession(rec)}`.
- `persist:true` (MCQ): initial `history` from `store.loadHistory(deckId)` with `sess` numbers assigned by index as today; `endSession` appends to the store and to state.
- `persist:false` (flashcards): state only, as today.
- `startSession` increments `sess`; `endSession(rec)` stamps `ts: Date.now()` and `sess` onto the record. Flashcard records therefore gain `ts`.
- When `deckId` changes (import/clear) the hook reloads from the store.

**`useKeys(active, handler)`**
- Registers one `keydown` listener on `window` while `active`.
- Ignores events when `e.repeat` is true or the target is an `INPUT`/`TEXTAREA`.
- Holds `handler` in a ref so the listener is not re-registered on every keystroke.
- The MCQ handler keeps its `e.preventDefault()` on Enter; the flashcard handler keeps its `preventDefault` on Space.

## 5. Shared components

All take a theme object `t` and render nothing mode-specific.

- **`Toolbar({t, name, countLabel, isSample, onTemplate, onImport, onExport, onClear})`** — name, count, Template, Import (label + hidden file input), and Export/Clear when not sample.
- **`StartScreen({t, badge, title, subtitle, extra, cats, catCount, selCat, onSelCat, steps, startLabel, onStart, children})`** — `extra` is an optional node under the subtitle (flashcards' box-count bar); `steps` is the three workflow strings; `children` renders below the start button (the history panel).
- **`ReviewScreen({t, sess, header, stats, missed, history, actions})`** — `header` optional node (MCQ grade circle); `stats` is `[{value, label, color?}]`; `missed` is the mode's missed-items node or `null`; `history` is the full history array; the screen renders all records except the last (the session just completed) via `SessionList`, newest first, and omits the block when there are none — today's behaviour; `actions` is the button row node.
- **`SessionList({t, rows, wrongLabel})`** — one row layout: `#sess`, `pct%`, `cat · ok correct · miss wrong/missed`. Keyed by `ts`. Used by both `HistoryPanel` and `ReviewScreen`, which closes item 11.
- **`HistoryPanel({t, history, isSample})`** — as today, but renders its Recent rows through `SessionList` and its By Section rows from `sectionStats`.

Each mode keeps: its quiz-phase JSX, its missed-items markup, its action buttons, and its `mark`/`confirmAns`/`nextQ` logic.

## 6. Theme

`makeTheme(accent)` returns the shared style object (page, toolbar, buttons, error, hero, badge, pills, workflow, review strip, history rows, progress bar, keyboard hint). Accent is `#f39c12` for flashcards and `#3b82f6` for MCQ.

Greys and widths are unified on the current MCQ values: page `#06060b`, panels `#0a0a12`, borders `#151520`, content max-width 660. This is the one intentional visual change; the flashcard tab gets very slightly darker and 20px wider.

Each mode keeps a small local style object for its quiz card only.

## 7. Testing

**Unit:** `tests/run.js`, Node only, no dependencies, run with `node tests/run.js`. It reads `study-drill.html`, slices the text between the PURE markers, evaluates it with `vm.runInNewContext` alongside a Map-backed storage stub, then runs `node:assert` cases:

- `validateFlashcards` / `validateMcq`: accepts the two example decks in the repo; rejects empty, missing fields, null id, duplicate ids, 3 or 5 options, unmatched `correct`.
- `orderByBox`: output is a permutation of the input; box-1 cards all precede box-2, which precede box-3; missing srs entries count as box 1.
- `shuffleMcqOptions`: options are a permutation; labels are A–D in order; the option carrying `correct` has the same text as the original correct option, including when two options share text.
- `summarise`: counts and rounding, `tot` 0 → `pct` 0.
- `sectionStats`: grouping, averaging, "All" default, ascending sort.
- `createStore`: deck round-trip preserves on-disk shape; history cap at 20 keeps the newest; corrupt JSON reads return defaults; a backend whose `setItem` throws makes writes return `false` without throwing.

**Browser smoke:** after each task, a scripted walk-through in the Browser pane against the `launch.json` static server: seed a deck via `localStorage`, reload, start a session, use keyboard shortcuts, reach the review screen, run Missed/Wrong Only, go back, confirm the history panel, export, clear. Both tabs.

## 8. Implementation order

1. Add PURE markers, move existing pure helpers into the block, add `tests/run.js` with the harness and the first cases. No behaviour change.
2. Extract validators and `summarise`/`sectionStats`/`orderByBox`/`shuffleMcqOptions`; wire components to them; tests.
3. `createStore`; replace all inline `localStorage` calls; tests.
4. `useKeys`; replace both keyboard effects.
5. `makeTheme`; replace `fs`/`ms` shared entries.
6. `Toolbar` + `StartScreen`; wire both modes.
7. `SessionList` + `HistoryPanel` + `ReviewScreen`; wire both modes.
8. `useDeck` + `useHistory`; remove the remaining duplicated state logic.
9. Rewrite the Architecture section of `CLAUDE.md`; remove item 11 from open work; commit.

Each step is a commit and ends with `node tests/run.js` green plus a browser smoke of both tabs.

## 9. Follow-ups this enables

- **Item 7** (flashcard history panel + SRS under deck UUID): flip `persist` to true for flashcards, add `fc_history_` handling to the store, move `fc_srs` to a per-deck key.
- **Item 8** (persisted session numbers): `endSession` already stamps `sess`; the store just needs to stop re-deriving it.
- **Item 5** (Leitner scheduling, session-based): `orderByBox` becomes `dueCards(pool, srs, sessionNumber)`; the start screen gains a due count and a "drill everything" override.
- **Phase 2**: replace `createStore(localStorage)` with a Supabase-backed implementation.
