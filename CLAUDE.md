# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A single-file, zero-build study app: `study-drill.html`. Open it directly in a browser — no server, npm, or build step needed. React 18 and Babel are loaded via CDN; JSX is transpiled in-browser.

## Architecture

Everything lives in `study-drill.html` inside a single `<script type="text/babel">` block (~400 lines):

- **`App`** — top-level component; tab switcher between `FlashcardDrill` and `MCQQuiz`
- **`FlashcardDrill`** — open-recall drill; three phases: `start → quiz → review`; user self-marks each card as "Got It" / "Missed It"
- **`MCQQuiz`** — multiple-choice quiz; same three-phase flow; user selects an option, locks it, sees immediate feedback + explanation
- **Style objects** (`fs`, `ms`, `appS`) — all styling is inline React style objects, no CSS classes or external stylesheets
- **Templates** (`FC_TEMPLATE`, `MCQ_TEMPLATE`) — JSON schemas with embedded Claude prompting instructions; downloaded by the user, filled by Claude with study content, then imported back

Data flow: JSON files are imported via `FileReader`, validated, stored in component state, and optionally re-exported. No backend, no localStorage — state is ephemeral per page load.

## Known issues and planned work

**Bugs to fix:**

1. ~~**MCQ options not shuffled**~~ — **Fixed.** Options are now shuffled in `startQuiz`; correct answer text is looked up before shuffling, labels are reassigned A/B/C/D sequentially, and `correct` is remapped to whichever label holds the correct text.
2. ~~**Tab switching breaks toolbar**~~ — **Fixed.** Replaced `useRef` + programmatic `.click()` pattern with a styled `<label>` wrapping the hidden `<input>`. The label triggers its child input natively — no ref required, so remounting the component can never produce a stale ref.

**Features to add:**

3. ~~**Category filter**~~ — **Done.** Category pills on the start screen are now clickable. Selecting a pill filters the deck to that category; clicking it again or clicking "All" resets. The start button label updates to reflect the active filter. `selCat` state resets to null on import.
4. ~~**Session score history**~~ — **Done.** `history` state (ephemeral, resets on page load) accumulates each session's result when the quiz ends. The review screen shows prior sessions below the missed-cards list — most recent first — with session number, score %, and correct/missed/total counts.
5. ~~**localStorage persistence**~~ — **Done.** Lazy `useState` initialisers restore the last deck from `localStorage` on load (`"fc_deck"` / `"mcq_deck"`). Import saves to localStorage. A "✕ Clear" toolbar button (visible only when a real deck is loaded) wipes localStorage and resets to the sample. Session history remains ephemeral.

6. ~~**Keyboard navigation**~~ — **Done.** `useEffect` adds/removes a `keydown` listener scoped to `phase==="quiz"`. Flashcards: Space reveals answer; Y/→ = Got It; N/← = Missed It. MCQ: A–D or 1–4 select options; Enter locks answer or advances. Key hints shown inline on the relevant buttons in muted text.

7. **Markdown rendering** — Load `marked.js` from CDN (https://cdnjs.cloudflare.com/ajax/libs/marked/9.1.6/marked.min.js). Use it to render flashcard `answer` fields and MCQ `explanation` fields as HTML. Question stems remain plain text. Sanitise output — strip `<script>` tags at minimum. Keep the change isolated so plain-text JSON still works.

8. **Spaced repetition (SRS)** — Implement a simplified Leitner box system (3 boxes) rather than full SM-2. New cards start in box 1. Correct answer moves card up a box; wrong answer returns it to box 1. Cards in lower boxes appear more frequently. SRS state persists via localStorage. Add a visible indicator showing which box each card is currently in. This is the most complex feature — plan mode required, implement last.

## JSON data files

- `flashcard-template.json` / `mcq-template.json` — template schemas (mirrors of the embedded constants)
- `flashcards.json` / `mcq.json` — example populated decks

Flashcard schema: `{ deck_name?, cards: [{ id, category, question, answer }] }`
MCQ schema: `{ quiz_name?, questions: [{ id, category, question, options: [{label, text}], correct, explanation }] }`
