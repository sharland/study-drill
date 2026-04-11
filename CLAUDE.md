# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A single-file, zero-build study app: `study-drill.html`. Open it directly in a browser — no server, npm, or build step needed. React 18 and Babel are loaded via CDN; JSX is transpiled in-browser.

## Architecture

Everything lives in `study-drill.html` inside a single `<script type="text/babel">` block (~510 lines):

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

### 11th April 2026

4. **[Feature] Flashcard history panel** — Roll out the MCQ history panel pattern to FlashcardDrill. Identical data model (`fc_deck_id`, `fc_history_<uuid>`). Verify MCQ history in use before starting.

### 7th April 2026

1. ~~**[Feature] History panel on front page**~~ — **Done (MCQ).** UUID deck identity, localStorage persistence capped at 20 records, start-screen panel with Recent + By Section views. Known limitations: (a) missed-only retry sessions are indistinguishable from full sessions in history; (b) importing deck A → deck B → deck A again orphans deck A's original history (name-match identity limit — acceptable at local scope).
2. **[Feature] Exit active session** — Allow user to exit a flashcard or MCQ session without recording it. Currently only achievable by switching tabs.
3. **[Feature, low priority] Customisable template instructions** — Ability to customise the AI instructions embedded in the template JSON for different AI systems or quiz approaches. May require architectural rethink first (see below).

## Architectural notes

### 7th April 2026

The single-file app is growing large. A structural plan is needed before adding more substantial features — the concern is load time and maintainability as the file grows beyond ~600 lines of inlined JSX and style objects.

## JSON data files

- `flashcard-template.json` / `mcq-template.json` — template schemas (mirrors of the embedded constants)
- `flashcards.json` / `mcq.json` — example populated decks
- `study/` — user's own JSON decks

Flashcard schema: `{ deck_name?, cards: [{ id, category, question, answer }] }`
MCQ schema: `{ quiz_name?, questions: [{ id, category, question, options: [{label, text}], correct, explanation }] }`
