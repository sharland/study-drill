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

3. **Category filter** — on the start screen, category pills should be clickable to start a drill/quiz on that category only, with an "All" option. Currently display-only.
4. **Session score history** — track scores across sessions within a single page load (no localStorage; ephemeral state only). Show a running history of session scores on the review screen.

## JSON data files

- `flashcard-template.json` / `mcq-template.json` — template schemas (mirrors of the embedded constants)
- `flashcards.json` / `mcq.json` — example populated decks

Flashcard schema: `{ deck_name?, cards: [{ id, category, question, answer }] }`
MCQ schema: `{ quiz_name?, questions: [{ id, category, question, options: [{label, text}], correct, explanation }] }`
