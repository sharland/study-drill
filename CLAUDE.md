# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A single-file, zero-build study app: `study-drill.html`. Open it directly in a browser — no server, npm, or build step needed. React 18 and Babel are loaded via CDN; JSX is transpiled in-browser.

## Architecture

Everything lives in `study-drill.html` inside a single `<script type="text/babel">` block (~596 lines):

- **`App`** — top-level component; tab switcher between `FlashcardDrill` and `MCQQuiz`
- **`FlashcardDrill`** — open-recall drill; three phases: `start → quiz → review`; user self-marks each card as "Got It" / "Missed It"; 3-box Leitner SRS persisted to `localStorage` as `"fc_srs"`
- **`MCQQuiz`** — multiple-choice quiz; same three-phase flow; user selects an option, locks it, sees immediate feedback + explanation
- **Style objects** (`fs`, `ms`, `appS`) — all styling is inline React style objects; one CSS class (`.md`) scopes markdown output styles
- **Templates** (`FC_TEMPLATE`, `MCQ_TEMPLATE`) — JSON schemas with embedded Claude prompting instructions; downloaded by the user, filled by Claude with study content, then imported back

Data flow: JSON files are imported via `FileReader`, validated, stored in component state, and optionally re-exported. No backend. Decks persist via `localStorage`; MCQ session history persists per deck UUID (`mcq_history_<uuid>`); flashcard history is still ephemeral per page load.

## Specs and plans

Implementation specs live in `docs/superpowers/specs/`. Start there when picking up planned work mid-session.

## Open work

Add new items as dated bullet points under a `### DD Month YYYY` heading. Claude converts bullets to numbers and tracks them here. Bugs prefix with `[Bug]`, features with `[Feature]`. Completed items are removed (history is in git).

### 13th September 2026

Findings from a full code review (Fable), post-fix-batch. The fix batch already landed: MCQ review lookup, Enter double-fire, stricter import validation (duplicate/null ids, exactly-4 options, correct-label match), DOMPurify sanitising of markdown output. These are what's left.

5. **[Bug] Leitner SRS has no spacing** — Boxes only affect drill *ordering* (box 1 first), not *scheduling*; every session still drills the whole pool. Not a bug in the box-transition logic (hit → +1 capped at 3, miss → box 1, which is correct), but the UI implies spaced repetition it doesn't do. Decide: implement real due-ness (box *n* due every 2^(n−1) sessions, with a "drill everything" override) or adjust the copy. Decide before item 4/7 below, since the commercialisation spec's `srs_state.last_seen_at` column assumes scheduling exists.
6. **[Bug, low priority] Missed-only retry promotes SRS boxes** — Retrying missed cards via "Missed Only" writes SRS same as a fresh session, so a miss-then-immediate-correct can promote a box within the same sitting. Standard Leitner wouldn't count a same-session retry. Fix: skip SRS writes when `startQuiz` is called with an explicit subset.
7. **[Feature] Flashcard history panel** — Roll out the MCQ history panel pattern to FlashcardDrill. Identical data model (`fc_deck_id`, `fc_history_<uuid>`). Verify MCQ history in use before starting. **Fold in while here:** move `fc_srs` under the same per-deck UUID so re-importing a flashcard deck (e.g. to fix a typo) doesn't wipe SRS progress the way it does today — MCQ already preserves history on name-match, flashcards should get the same treatment.
8. **[Bug, low priority] Session numbers aren't persisted** — MCQ history caps at 20 records and re-derives `sess` from array index on reload, so once older records fall off the cap, session numbers shift (a session shown as "#21" reads as "#20" after a reload). Store `sess` in the record itself.
9. **[Feature] Accessibility pass** — WCAG AA contrast fails in several places: secondary/label text at `#444`–`#666` on the dark backgrounds is 2.0–3.5:1 (need ≥4.5:1); floor it around `#8a8a8a`. Also: the Import control is a `<label>` wrapping a `display:none` file input, so it's not keyboard-reachable (use visually-hidden instead of display:none); category filter pills are `<span onClick>` with no keyboard or focus support (should be `<button aria-pressed>`).
10. **[Feature, low priority] Error boundary** — A render throw currently blanks the whole page with no recovery. A small boundary with a "reset local data" button would let a corrupted localStorage value be cleared without editing devtools.
11. **[Feature, low priority] Consolidate session-history rendering** — The review screen renders session history inline (its own JSX) while the start screen uses `HistoryPanel` — same data, two implementations, inconsistent keys (index vs `ts`). Worth folding into one once item 7 gives flashcards a `ts` field too.

### 7th April 2026

1. ~~**[Feature] History panel on front page**~~ — **Done (MCQ).** UUID deck identity, localStorage persistence capped at 20 records, start-screen panel with Recent + By Section views. Known limitations: (a) missed-only retry sessions are indistinguishable from full sessions in history; (b) importing deck A → deck B → deck A again orphans deck A's original history (name-match identity limit — acceptable at local scope).
2. **[Feature] Exit active session** — Allow user to exit a flashcard or MCQ session without recording it. Currently only achievable by switching tabs.
3. **[Feature, low priority] Customisable template instructions** — Ability to customise the AI instructions embedded in the template JSON for different AI systems or quiz approaches. May require architectural rethink first (see below).

## Architectural notes

### 13th September 2026

`FlashcardDrill` and `MCQQuiz` are ~70% duplicated code: deck load/import/clear/export, the toolbar, the start-screen hero/category-pills/workflow steps, the review-screen summary strip, inline session history, and the keyboard-shortcut effect are all near-identical, as are the `fs`/`ms` style objects (same shape, different accent colour). Roughly 200 of the file's ~596 lines are this duplication. Extracting `useDeck(kind)`, `Toolbar`, `StartScreen`, `SessionSummary`, and a `theme(accent)` style factory — with `localStorage` access pulled behind a small `store` module (`loadDeck/saveDeck/loadHistory/appendHistory/loadSrs/saveSrs`) — would both shrink the file and give Phase 2 of the commercialisation plan (docs/superpowers/specs/2026-04-23-product-commercialisation-design.md) a real seam to swap localStorage for Supabase, instead of 14 inline call sites. Worth doing in this single file *before* the Next.js migration, not during it.

### 7th April 2026

The single-file app is growing large (~590 lines as of 11 Apr 2026). A structural plan is needed before adding more substantial features — the concern is load time and maintainability as the file approaches and exceeds 600 lines of inlined JSX and style objects.

## JSON data files

- `flashcard-template.json` / `mcq-template.json` — template schemas (mirrors of the embedded constants)
- `flashcards.json` / `mcq.json` — example populated decks
- `study/` — user's own JSON decks

Flashcard schema: `{ deck_name?, cards: [{ id, category, question, answer }] }`
MCQ schema: `{ quiz_name?, questions: [{ id, category, question, options: [{label, text}], correct, explanation }] }`
