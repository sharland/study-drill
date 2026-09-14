# Shared Structure Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the ~200 lines of duplication between `FlashcardDrill` and `MCQQuiz` by extracting shared hooks, presentational components, a theme factory and a `createStore()` storage seam, without changing user-visible behaviour or stored data.

**Architecture:** Everything stays in the one `study-drill.html` Babel script block. A `/* PURE-START */ … /* PURE-END */` region at the top holds plain-JS logic (validators, ordering, shuffle, stats, store) that a dependency-free Node script slices out and unit-tests. Shared React pieces (`Toolbar`, `StartScreen`, `ReviewScreen`, `SessionList`, `HistoryPanel`, `useDeck`, `useHistory`, `useKeys`, `makeTheme`) sit between the pure block and the two mode components, which keep only their quiz-phase JSX and mark/confirm/next logic.

**Tech Stack:** React 18 UMD + Babel standalone via CDN (unchanged). Node ≥ 18 for `tests/run.js` (built-in `vm`, `assert`, `fs` only — no npm). Python `http.server` via `.claude/launch.json` for browser smoke tests.

**Spec:** `docs/superpowers/specs/2026-09-14-shared-structure-refactor-design.md`

## Global Constraints

- One file: `study-drill.html`, one `<script type="text/babel">` block. No new script files except `tests/run.js`.
- The pure block contains **only `function` declarations and `var`** — no `const`/`let` at top level, no JSX, no `React`, `document`, `window`, or `localStorage`. (Function declarations attach to the `vm` context so the test harness can read them; `const` does not.)
- All existing `localStorage` keys and stored JSON shapes stay byte-compatible: `fc_deck` `{deck_name, cards}`, `mcq_deck` `{quiz_name, questions}`, `mcq_deck_id`, `mcq_history_<uuid>`, `fc_srs`. `fc_deck_id` is the only new key.
- Error strings already in the file are reused verbatim. New storage-failure string: `"Could not save to browser storage."`
- Unified palette (MCQ values): page `#06060b`, panels `#0a0a12`, borders `#151520`, content max-width `660`. Accents: flashcards `#f39c12` with dark button text `#08080d`; MCQ `#3b82f6` with white button text.
- Every task ends with `node tests/run.js` green **and** the browser smoke in the "Smoke procedure" section passing on both tabs, then a commit.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Line numbers below are from the file at commit `712eab5` (596 lines). They drift as tasks land — locate by the quoted code, not the number.

---

## Smoke procedure (used by every task)

Start the server with the Browser pane (`preview_start` with name `static` from `.claude/launch.json`) and open `http://localhost:8765/study-drill.html?v=<task number>` — the query string defeats the pane's cache of the HTML. `file://` does not work: the pane renders it as a storage-less snapshot.

Seed both decks by running this in the page (javascript tool), then reload with a fresh `?v=`:

```js
localStorage.clear();
localStorage.setItem('fc_deck', JSON.stringify({deck_name:'Smoke FC',cards:[
  {id:1,category:'Alpha',question:'FC q1',answer:'**a1** with `code`'},
  {id:2,category:'Alpha',question:'FC q2',answer:'a2'},
  {id:3,category:'Beta',question:'FC q3',answer:'a3'}]}));
localStorage.setItem('fc_srs', JSON.stringify({2:3}));
localStorage.setItem('mcq_deck', JSON.stringify({quiz_name:'Smoke MCQ',questions:[
  {id:1,category:'Alpha',question:'MCQ q1',options:[{label:'A',text:'one'},{label:'B',text:'two'},{label:'C',text:'three'},{label:'D',text:'four'}],correct:'C',explanation:'exp **1**'},
  {id:2,category:'Alpha',question:'MCQ q2',options:[{label:'A',text:'one'},{label:'B',text:'two'},{label:'C',text:'three'},{label:'D',text:'four'}],correct:'A',explanation:'exp 2'},
  {id:3,category:'Beta',question:'MCQ q3',options:[{label:'A',text:'one'},{label:'B',text:'two'},{label:'C',text:'three'},{label:'D',text:'four'}],correct:'B',explanation:'exp 3'}]}));
localStorage.setItem('mcq_deck_id','smoke-id');
localStorage.setItem('mcq_history_smoke-id', JSON.stringify([{ts:1,cat:null,pct:67,ok:2,miss:1,tot:3},{ts:2,cat:'Alpha',pct:100,ok:2,miss:0,tot:2}]));
'seeded';
```

Checklist (read the page with `get_page_text` / `read_page`, click by `ref`, press keys with the `key` action; the pane's synthetic Enter does **not** trigger native button activation, so the Enter-double-fire guard cannot be exercised here — that is expected):

**Flashcards tab**
1. Start screen shows `Smoke FC`, `3 cards · 2 categories`, box bar `■ 2 · ■ 0 · ■ 1 box 1 / 2 / 3`, pills `All (3)`, `Alpha (2)`, `Beta (1)`, three workflow steps, `Start Drill`. No history panel.
2. Click `Beta` pill → button reads `Drill: Beta`. Click `All (3)` → `Start Drill`.
3. Click `Start Drill`. Top bar `1 / 3`, category, `BOX 1` (card 2 is box 3 so must come last). Press `Space` → answer rendered as markdown (`<strong>a1</strong>` and `<code>code</code>` present in `.md`). Press `y`. Card 2 of 3. Press `Space`, press `n`. Card 3 → `Space`, `ArrowRight`.
4. Review: `2 Correct · 1 Missed · 67%`; Missed list shows the card marked `n`; no Session History block (first session). Buttons `Full Deck`, `Missed Only (1)`, `← Back`.
5. `localStorage.getItem('fc_srs')` reflects the marks (the `y` card moved up a box, the `n` card is `1`).
6. Click `Missed Only (1)` → `1 / 1`, `Space`, `y` → review `1 Correct · 0 Missed`, Session History block lists `#1 67%`.
7. `← Back` → start screen. Reload (new `?v=`) → deck and SRS persisted; history gone (ephemeral, expected until item 7).
8. Import a bad file via `DataTransfer` on the hidden input (see the snippet below) → red error `Card ids must be unique.`; deck unchanged. Import a good file → name updates, `fc_srs` cleared.
9. `↓ Export` triggers a download (network/blob not observable; just confirm no console error). `✕ Clear` → `No deck loaded`, `1 cards`, Export/Clear buttons gone.

**Multiple Choice tab**
10. Start screen shows `Smoke MCQ`, `3 questions · 2 categories`, pills, steps, `Begin Exam`, then `SESSION HISTORY` with RECENT rows `#2 100% Alpha · 2 correct · 0 wrong` and `#1 67% All · 2 correct · 1 wrong`, and BY SECTION rows `All 67% 1 session`, `Alpha 100% 1 session` (ascending by average).
11. `Begin Exam` → `1 / 3`; press `b` → option B highlighted; press `Enter` → locked, explanation rendered as markdown, correct option green. Press `Enter` → next. Answer the remaining two by clicking an option then `Lock Answer`, then `Next Question →` / `See Results →`.
12. Review: grade circle, `Correct / Wrong / Total` strip, `REVIEW INCORRECT` entries whose `You:` text equals the option text actually clicked, Session History block lists `#2` and `#1`. Buttons `Full Quiz`, `Wrong Only (n)` (if any wrong), `← Back`.
13. `localStorage.getItem('mcq_history_smoke-id')` now has 3 records; the new one has `ts`, `cat:null`, `pct`, `ok`, `miss`, `tot`.
14. `← Back` → history panel shows the new session as `#3` in RECENT. Reload → still there.
15. Bad import (`correct:'b'`) → `Every question's 'correct' must match one of its option labels.` Good import with a **different** `quiz_name` → new `mcq_deck_id`, empty history panel. Good import with the **same** name → same id, history kept.
16. `✕ Clear` → `No quiz loaded`, history panel gone, `mcq_history_<id>` key removed.

Import snippet (run in page; `k` is a filename, `v` the JSON):

```js
const inp=document.querySelector('input[type=file]');const dt=new DataTransfer();
dt.items.add(new File([JSON.stringify(v)],k+'.json',{type:'application/json'}));
inp.files=dt.files;inp.dispatchEvent(new Event('change',{bubbles:true}));
```

Stop the server with `preview_stop` when the task's smoke is done.

---

### Task 1: PURE markers and the Node test harness

**Files:**
- Modify: `study-drill.html:26-52` (the `SHARED UTILITIES` block)
- Create: `tests/run.js`

**Interfaces:**
- Produces: the `/* PURE-START */` … `/* PURE-END */` region; `tests/run.js` exporting nothing but defining `load()`, `test(name, fn)`, `memStorage(opts)` for later tasks to extend.

- [ ] **Step 1: Confirm Node is available**

Run: `node --version`
Expected: `v18` or newer. If missing, stop and tell the user — the harness needs it.

- [ ] **Step 2: Write the harness with its first two tests**

Create `tests/run.js`:

```js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const HTML = path.join(__dirname, "..", "study-drill.html");

function load() {
  const html = fs.readFileSync(HTML, "utf8");
  const m = html.match(/\/\* PURE-START \*\/([\s\S]*?)\/\* PURE-END \*\//);
  if (!m) throw new Error("PURE-START/PURE-END markers not found in study-drill.html");
  const ctx = {};
  vm.runInNewContext(m[1], ctx, { filename: "study-drill.html(pure)" });
  return ctx;
}

function memStorage(opts = {}) {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { if (opts.throwOnSet) throw new Error("QuotaExceededError"); map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    _map: map,
  };
}

const results = { pass: 0, fail: 0 };
function test(name, fn) {
  try { fn(); results.pass++; console.log("  ok   " + name); }
  catch (e) { results.fail++; console.log("  FAIL " + name + "\n       " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join("\n       ") : e)); }
}

const P = load();

console.log("pure block");
test("pure block loads and defines shuffleArray and generateUUID", () => {
  assert.strictEqual(typeof P.shuffleArray, "function");
  assert.strictEqual(typeof P.generateUUID, "function");
});
test("shuffleArray returns a permutation and does not mutate input", () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8];
  const copy = [...input];
  const out = P.shuffleArray(input);
  assert.deepStrictEqual(input, copy);
  assert.deepStrictEqual([...out].sort((a, b) => a - b), copy);
  assert.notStrictEqual(out, input);
});
test("generateUUID produces v4-shaped ids that differ", () => {
  const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const a = P.generateUUID(), b = P.generateUUID();
  assert.match(a, re); assert.match(b, re); assert.notStrictEqual(a, b);
});

module.exports = { load, test, memStorage, P, assert };

if (require.main === module) {
  console.log(`\n${results.pass} passed, ${results.fail} failed`);
  process.exit(results.fail ? 1 : 0);
}
```

Later tasks add more `test(...)` blocks above the `module.exports` line, each group preceded by a `console.log("<group>")` heading.

- [ ] **Step 3: Run it to see it fail**

Run: `node tests/run.js`
Expected: throws `PURE-START/PURE-END markers not found`.

- [ ] **Step 4: Add the markers around the existing pure helpers**

In `study-drill.html` replace lines 26–52 (from `const {useState,useCallback,useEffect} = React;` through the end of `generateUUID`) with:

```js
const {useState,useCallback,useEffect,useRef} = React;

/* PURE-START */
/* Plain JS only: function declarations and var. No JSX, React, DOM or localStorage.
   tests/run.js slices this region out of the HTML and runs it under Node. */
function shuffleArray(arr){
  const s=[...arr];
  for(let i=s.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[s[i],s[j]]=[s[j],s[i]];}
  return s;
}
function generateUUID(){
  return'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{
    const r=Math.random()*16|0;
    return(c==='x'?r:(r&0x3|0x8)).toString(16);
  });
}
/* PURE-END */

/* ===== DOM UTILITIES ===== */
function renderMd(text){
  if(!text)return"";
  return DOMPurify.sanitize(marked.parse(String(text)));
}
function downloadJSON(data,filename){
  const b=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const u=URL.createObjectURL(b);
  const a=document.createElement("a");a.href=u;a.download=filename;a.click();
  URL.revokeObjectURL(u);
}
```

(`const`/`let` **inside** function bodies is fine; the rule is about the top level of the region.)

- [ ] **Step 5: Run the tests**

Run: `node tests/run.js`
Expected: `3 passed, 0 failed`.

- [ ] **Step 6: Browser smoke**

Follow the Smoke procedure with `?v=1`. Everything should behave exactly as before.

- [ ] **Step 7: Commit**

```bash
git add study-drill.html tests/run.js
git commit -m "refactor: add PURE block markers and Node test harness

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Pure logic — validators, ordering, shuffle, stats

**Files:**
- Modify: `study-drill.html` PURE region (add functions); `FlashcardDrill.handleImport` (~line 140), `FlashcardDrill.startQuiz` (~160), `MCQQuiz.handleImport` (~345), `MCQQuiz.startQuiz` (~372), `HistoryPanel` (~78)
- Modify: `tests/run.js`

**Interfaces:**
- Produces:
  - `validateFlashcards(data, fallbackName) → {ok:true, name:string, items:Card[]} | {ok:false, error:string}`
  - `validateMcq(data, fallbackName) → {ok:true, name:string, items:Question[]} | {ok:false, error:string}`
  - `orderByBox(pool:Card[], srs:{[id]:1|2|3}) → Card[]`
  - `shuffleMcqOptions(q:Question) → Question` (new object; options relabelled A–D; `correct` remapped)
  - `summarise(results:{correct:boolean}[]) → {ok, miss, tot, pct}`
  - `sectionStats(history:{cat, pct}[]) → {cat:string, count:number, avg:number}[]` sorted by `avg` ascending

- [ ] **Step 1: Write the failing tests**

Append to `tests/run.js` above `module.exports`:

```js
console.log("validators");
const FC_EXAMPLE = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "flashcards.json"), "utf8"));
const MCQ_EXAMPLE = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "mcq.json"), "utf8"));
const opts4 = () => [{label:"A",text:"a"},{label:"B",text:"b"},{label:"C",text:"c"},{label:"D",text:"d"}];

test("validateFlashcards accepts the example deck and uses deck_name", () => {
  const v = P.validateFlashcards(FC_EXAMPLE, "fallback");
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.items.length, FC_EXAMPLE.cards.length);
  assert.strictEqual(v.name, FC_EXAMPLE.deck_name || "fallback");
});
test("validateFlashcards accepts a bare array and falls back to the filename", () => {
  const v = P.validateFlashcards([{id:1,question:"q",answer:"a"}], "my-deck");
  assert.deepStrictEqual(v, {ok:true, name:"my-deck", items:[{id:1,question:"q",answer:"a"}]});
});
test("validateFlashcards rejects empty, missing fields, null id, duplicate ids", () => {
  assert.deepStrictEqual(P.validateFlashcards({cards:[]}, "x"), {ok:false, error:"JSON must contain a 'cards' array."});
  assert.deepStrictEqual(P.validateFlashcards({foo:1}, "x"), {ok:false, error:"JSON must contain a 'cards' array."});
  assert.deepStrictEqual(P.validateFlashcards(null, "x"), {ok:false, error:"JSON must contain a 'cards' array."});
  assert.deepStrictEqual(P.validateFlashcards({cards:[{id:1,question:"q"}]}, "x"), {ok:false, error:"Every card needs id, question, answer."});
  assert.deepStrictEqual(P.validateFlashcards({cards:[{id:null,question:"q",answer:"a"}]}, "x"), {ok:false, error:"Every card needs id, question, answer."});
  assert.deepStrictEqual(P.validateFlashcards({cards:[{id:1,question:"q",answer:"a"},{id:1,question:"q2",answer:"a"}]}, "x"), {ok:false, error:"Card ids must be unique."});
});
test("validateMcq accepts the example quiz", () => {
  const v = P.validateMcq(MCQ_EXAMPLE, "fallback");
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.items.length, MCQ_EXAMPLE.questions.length);
});
test("validateMcq rejects empty, missing fields, 3 or 5 options, unmatched correct, duplicate ids", () => {
  const q = (over) => ({id:1,question:"q",options:opts4(),correct:"A",...over});
  assert.deepStrictEqual(P.validateMcq({questions:[]}, "x"), {ok:false, error:"JSON must contain a 'questions' array."});
  assert.deepStrictEqual(P.validateMcq({questions:[q({correct:undefined})]}, "x"), {ok:false, error:"Every question needs id, question, options[], correct."});
  assert.deepStrictEqual(P.validateMcq({questions:[q({options:opts4().slice(0,3)})]}, "x"), {ok:false, error:"Every question needs exactly 4 options."});
  assert.deepStrictEqual(P.validateMcq({questions:[q({options:[...opts4(),{label:"E",text:"e"}]})]}, "x"), {ok:false, error:"Every question needs exactly 4 options."});
  assert.deepStrictEqual(P.validateMcq({questions:[q({correct:"b"})]}, "x"), {ok:false, error:"Every question's 'correct' must match one of its option labels."});
  assert.deepStrictEqual(P.validateMcq({questions:[q(), q({question:"q2"})]}, "x"), {ok:false, error:"Question ids must be unique."});
});

console.log("ordering and shuffling");
test("orderByBox puts box 1 before 2 before 3, missing entries count as box 1, and is a permutation", () => {
  const pool = [{id:1},{id:2},{id:3},{id:4},{id:5},{id:6}];
  const srs = {2:3, 3:2, 5:3, 6:2};
  const out = P.orderByBox(pool, srs);
  assert.deepStrictEqual(out.map(c => c.id).sort(), [1,2,3,4,5,6]);
  assert.deepStrictEqual(out.map(c => srs[c.id] || 1), [1,1,2,2,3,3]);
});
test("shuffleMcqOptions relabels A-D, keeps a permutation, remaps correct, and does not mutate", () => {
  const q = {id:9, question:"q", options:opts4(), correct:"C", explanation:"e"};
  const before = JSON.stringify(q);
  for (let i = 0; i < 25; i++) {
    const s = P.shuffleMcqOptions(q);
    assert.deepStrictEqual(s.options.map(o => o.label), ["A","B","C","D"]);
    assert.deepStrictEqual(s.options.map(o => o.text).sort(), ["a","b","c","d"]);
    assert.strictEqual(s.options.find(o => o.label === s.correct).text, "c");
    assert.strictEqual(s.id, 9); assert.strictEqual(s.explanation, "e");
  }
  assert.strictEqual(JSON.stringify(q), before);
});
test("shuffleMcqOptions tracks the correct option by identity when two options share text", () => {
  const q = {id:1, question:"q", options:[{label:"A",text:"same"},{label:"B",text:"same"},{label:"C",text:"x"},{label:"D",text:"y"}], correct:"B"};
  for (let i = 0; i < 25; i++) {
    const s = P.shuffleMcqOptions(q);
    const idx = s.options.findIndex(o => o.label === s.correct);
    assert.strictEqual(s.options[idx].text, "same");
    // exactly one option carries the correct label
    assert.strictEqual(s.options.filter(o => o.label === s.correct).length, 1);
  }
});

console.log("stats");
test("summarise counts, rounds, and handles empty", () => {
  assert.deepStrictEqual(P.summarise([]), {ok:0, miss:0, tot:0, pct:0});
  assert.deepStrictEqual(P.summarise([{correct:true},{correct:false},{correct:true}]), {ok:2, miss:1, tot:3, pct:67});
});
test("sectionStats groups by cat with 'All' default, averages, sorts ascending", () => {
  const h = [{cat:null,pct:50},{cat:"B",pct:100},{cat:"A",pct:80},{cat:null,pct:70},{cat:"A",pct:60}];
  assert.deepStrictEqual(P.sectionStats(h), [{cat:"All",count:2,avg:60},{cat:"A",count:2,avg:70},{cat:"B",count:1,avg:100}]);
  assert.deepStrictEqual(P.sectionStats([]), []);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node tests/run.js`
Expected: the new tests FAIL with `P.validateFlashcards is not a function` etc.

- [ ] **Step 3: Add the functions to the PURE region**

Insert after `generateUUID` and before `/* PURE-END */`:

```js
function validateFlashcards(d,fallbackName){
  const a=(d&&d.cards)||d;
  if(!Array.isArray(a)||!a.length)return{ok:false,error:"JSON must contain a 'cards' array."};
  if(!a.every(c=>c&&c.id!=null&&c.question&&c.answer))return{ok:false,error:"Every card needs id, question, answer."};
  if(new Set(a.map(c=>c.id)).size!==a.length)return{ok:false,error:"Card ids must be unique."};
  return{ok:true,name:(d&&d.deck_name)||fallbackName,items:a};
}
function validateMcq(d,fallbackName){
  const a=(d&&d.questions)||d;
  if(!Array.isArray(a)||!a.length)return{ok:false,error:"JSON must contain a 'questions' array."};
  if(!a.every(q=>q&&q.id!=null&&q.question&&Array.isArray(q.options)&&q.correct))return{ok:false,error:"Every question needs id, question, options[], correct."};
  if(!a.every(q=>q.options.length===4))return{ok:false,error:"Every question needs exactly 4 options."};
  if(!a.every(q=>q.options.some(o=>o&&o.label===q.correct)))return{ok:false,error:"Every question's 'correct' must match one of its option labels."};
  if(new Set(a.map(q=>q.id)).size!==a.length)return{ok:false,error:"Question ids must be unique."};
  return{ok:true,name:(d&&d.quiz_name)||fallbackName,items:a};
}
function orderByBox(pool,srs){
  return[1,2,3].flatMap(b=>shuffleArray(pool.filter(c=>(srs[c.id]||1)===b)));
}
function shuffleMcqOptions(q){
  const correct=q.options.find(o=>o.label===q.correct);
  const shuffled=shuffleArray(q.options);
  const idx=shuffled.indexOf(correct);
  return{...q,options:shuffled.map((o,i)=>({...o,label:"ABCD"[i]})),correct:"ABCD"[idx]};
}
function summarise(results){
  const tot=results.length,ok=results.filter(r=>r.correct).length;
  return{ok,miss:tot-ok,tot,pct:tot?Math.round(ok/tot*100):0};
}
function sectionStats(history){
  const by={};
  history.forEach(h=>{const k=h.cat||"All";if(!by[k])by[k]={count:0,total:0};by[k].count++;by[k].total+=h.pct;});
  return Object.entries(by).map(([cat,v])=>({cat,count:v.count,avg:Math.round(v.total/v.count)})).sort((a,b)=>a.avg-b.avg);
}
```

- [ ] **Step 4: Run the tests**

Run: `node tests/run.js`
Expected: all pass.

- [ ] **Step 5: Wire the components to the pure functions**

`FlashcardDrill.handleImport` — replace the body of `r.onload` (from `const d=JSON.parse(...)` through `localStorage.removeItem("fc_srs");setSrs({});`) with:

```js
    r.onload=(ev)=>{
      let d;try{d=JSON.parse(ev.target.result);}catch{setErr("Invalid JSON.");return;}
      const v=validateFlashcards(d,f.name.replace(/\.json$/,""));
      if(!v.ok){setErr(v.error);return;}
      setCards(v.items);setDeckName(v.name);setPhase("start");setSess(0);setSelCat(null);
      localStorage.setItem("fc_deck",JSON.stringify({deck_name:v.name,cards:v.items}));
      localStorage.removeItem("fc_srs");setSrs({});
    };
```

`FlashcardDrill.startQuiz` — replace `const sorted=[1,2,3].flatMap(b=>shuffleArray(pool.filter(c=>(srs[c.id]||1)===b)));` with `const sorted=orderByBox(pool,srs);`.

`FlashcardDrill` — replace `const ok=results.filter(r=>r.correct).length;` and `const miss=results.filter(r=>!r.correct).length;` with `const {ok,miss}=summarise(results);`. In the review phase replace `const tot=results.length;const pct=tot?Math.round(ok/tot*100):0;const hm=miss>0;` with `const {tot,pct}=summarise(results);const hm=miss>0;`.

`MCQQuiz.handleImport` — replace the body of `r.onload` from `const d=JSON.parse(...)` through the four validation `if` lines and `const name=...` with:

```js
    r.onload=(ev)=>{
      let d;try{d=JSON.parse(ev.target.result);}catch{setErr("Invalid JSON.");return;}
      const v=validateMcq(d,f.name.replace(/\.json$/,""));
      if(!v.ok){setErr(v.error);return;}
      const a=v.items,name=v.name;
      const storedId=localStorage.getItem("mcq_deck_id");
      const storedName=JSON.parse(localStorage.getItem("mcq_deck")||"{}").quiz_name;
      const id=(storedId&&storedName===name)?storedId:generateUUID();
      const stored=JSON.parse(localStorage.getItem(`mcq_history_${id}`)||"[]");
      const storedSess=stored.length;
      const newHistory=stored.map((rec,i)=>({...rec,sess:i+1}));
      setQuestions(a);setDeckName(name);setDeckId(id);setPhase("start");setSess(storedSess);setSelCat(null);setHistory(newHistory);
      localStorage.setItem("mcq_deck",JSON.stringify({quiz_name:name,questions:a}));
      localStorage.setItem("mcq_deck_id",id);
    };
```

(The outer `try{...}catch{setErr("Invalid JSON.")}` wrapper is removed; JSON parse failure is handled explicitly and storage failures are handled in Task 3.)

`MCQQuiz.startQuiz` — replace the `.map(q=>{ ... })` block (from `const correctText=` to `return{...q,options:newOpts,correct:newCorrect};` inclusive, and the `.map(` wrapper) with `const shuffled=shuffleArray(pool).map(shuffleMcqOptions);`.

`MCQQuiz` — same `summarise` substitution as flashcards for `ok`/`miss`, and in review `const {tot,pct}=summarise(results);const hm=miss>0;`. In `nextQ` replace `const okCount=...; const record={ts:Date.now(),cat:selCat,pct:Math.round(okCount/results.length*100),ok:okCount,miss:results.length-okCount,tot:results.length};` with `const s=summarise(results);const record={ts:Date.now(),cat:selCat,pct:s.pct,ok:s.ok,miss:s.miss,tot:s.tot};`. Same in flashcards `mark`: replace the `okCount` line and history push with `const s=summarise(newResults);setHistory(h=>[...h,{sess,pct:s.pct,ok:s.ok,miss:s.miss,tot:s.tot,cat:selCat}]);`.

`HistoryPanel` — replace the `bySection` loop and `sections` computation (from `const bySection={};` through `.sort((a,b)=>a.avg-b.avg);`) with `const sections=sectionStats(history);`.

- [ ] **Step 6: Run tests and smoke**

Run: `node tests/run.js` → all pass. Smoke with `?v=2`, all 16 checks.

- [ ] **Step 7: Commit**

```bash
git add study-drill.html tests/run.js
git commit -m "refactor: extract validators, ordering, shuffle and stats into the pure block

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `createStore` and removal of inline localStorage

**Files:**
- Modify: `study-drill.html` PURE region (add `createStore`); every `localStorage` call in `FlashcardDrill` and `MCQQuiz`
- Modify: `tests/run.js`

**Interfaces:**
- Produces: `createStore(backend)` returning `{loadDeck(kind), saveDeck(kind,{name,items}), clearDeck(kind), loadDeckId(kind), saveDeckId(kind,id), clearDeckId(kind), loadHistory(id), appendHistory(id,rec), clearHistory(id), loadSrs(), saveSrs(srs), clearSrs()}`; `kind` is `"fc"|"mcq"`; writes return `boolean`.
- Produces: module-level `const store=createStore(localStorage);` and `const STORAGE_ERR="Could not save to browser storage.";` immediately after `/* PURE-END */`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/run.js` above `module.exports`:

```js
console.log("store");
test("deck round-trip preserves the on-disk shape for both kinds", () => {
  const b = memStorage(); const s = P.createStore(b);
  assert.strictEqual(s.saveDeck("fc", {name:"Deck", items:[{id:1}]}), true);
  assert.deepStrictEqual(JSON.parse(b._map.get("fc_deck")), {deck_name:"Deck", cards:[{id:1}]});
  assert.deepStrictEqual(s.loadDeck("fc"), {name:"Deck", items:[{id:1}]});
  assert.strictEqual(s.saveDeck("mcq", {name:"Quiz", items:[{id:2}]}), true);
  assert.deepStrictEqual(JSON.parse(b._map.get("mcq_deck")), {quiz_name:"Quiz", questions:[{id:2}]});
  assert.deepStrictEqual(s.loadDeck("mcq"), {name:"Quiz", items:[{id:2}]});
  s.clearDeck("fc"); assert.strictEqual(s.loadDeck("fc"), null); assert.strictEqual(b._map.has("fc_deck"), false);
});
test("loadDeck returns null for missing, corrupt, or empty decks and null name when absent", () => {
  const b = memStorage(); const s = P.createStore(b);
  assert.strictEqual(s.loadDeck("fc"), null);
  b._map.set("fc_deck", "{not json"); assert.strictEqual(s.loadDeck("fc"), null);
  b._map.set("fc_deck", JSON.stringify({deck_name:"x", cards:[]})); assert.strictEqual(s.loadDeck("fc"), null);
  b._map.set("fc_deck", JSON.stringify({cards:[{id:1}]})); assert.deepStrictEqual(s.loadDeck("fc"), {name:null, items:[{id:1}]});
});
test("deck ids use fc_deck_id / mcq_deck_id", () => {
  const b = memStorage(); const s = P.createStore(b);
  assert.strictEqual(s.loadDeckId("mcq"), null);
  assert.strictEqual(s.saveDeckId("mcq", "abc"), true);
  assert.strictEqual(b._map.get("mcq_deck_id"), "abc");
  assert.strictEqual(s.loadDeckId("mcq"), "abc");
  s.saveDeckId("fc", "def"); assert.strictEqual(b._map.get("fc_deck_id"), "def");
  s.clearDeckId("mcq"); assert.strictEqual(s.loadDeckId("mcq"), null);
});
test("history uses mcq_history_<id>, caps at 20 keeping the newest, tolerates corrupt data", () => {
  const b = memStorage(); const s = P.createStore(b);
  assert.deepStrictEqual(s.loadHistory("id1"), []);
  for (let i = 1; i <= 23; i++) assert.strictEqual(s.appendHistory("id1", {ts:i}), true);
  const h = s.loadHistory("id1");
  assert.strictEqual(h.length, 20);
  assert.strictEqual(h[0].ts, 4); assert.strictEqual(h[19].ts, 23);
  assert.strictEqual(b._map.has("mcq_history_id1"), true);
  b._map.set("mcq_history_id2", "nope"); assert.deepStrictEqual(s.loadHistory("id2"), []);
  b._map.set("mcq_history_id3", JSON.stringify({a:1})); assert.deepStrictEqual(s.loadHistory("id3"), []);
  s.clearHistory("id1"); assert.strictEqual(b._map.has("mcq_history_id1"), false);
});
test("srs uses fc_srs and returns {} for missing or non-object data", () => {
  const b = memStorage(); const s = P.createStore(b);
  assert.deepStrictEqual(s.loadSrs(), {});
  assert.strictEqual(s.saveSrs({1:2}), true);
  assert.strictEqual(b._map.get("fc_srs"), JSON.stringify({1:2}));
  assert.deepStrictEqual(s.loadSrs(), {1:2});
  b._map.set("fc_srs", "[1,2]"); assert.deepStrictEqual(s.loadSrs(), {});
  s.clearSrs(); assert.strictEqual(b._map.has("fc_srs"), false);
});
test("writes return false instead of throwing when the backend throws", () => {
  const s = P.createStore(memStorage({throwOnSet:true}));
  assert.strictEqual(s.saveDeck("fc", {name:"x", items:[{id:1}]}), false);
  assert.strictEqual(s.saveDeckId("fc", "x"), false);
  assert.strictEqual(s.appendHistory("x", {ts:1}), false);
  assert.strictEqual(s.saveSrs({}), false);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node tests/run.js` → store tests FAIL with `P.createStore is not a function`.

- [ ] **Step 3: Add `createStore` to the PURE region**

Insert before `/* PURE-END */`:

```js
function createStore(backend){
  var HISTORY_CAP=20;
  var KEYS={fc:{deck:"fc_deck",id:"fc_deck_id",name:"deck_name",items:"cards"},
            mcq:{deck:"mcq_deck",id:"mcq_deck_id",name:"quiz_name",items:"questions"}};
  function read(k,dflt){try{const v=backend.getItem(k);return v==null?dflt:JSON.parse(v);}catch{return dflt;}}
  function write(k,v){try{backend.setItem(k,JSON.stringify(v));return true;}catch{return false;}}
  function remove(k){try{backend.removeItem(k);}catch{}}
  function loadHistory(id){const h=read("mcq_history_"+id,[]);return Array.isArray(h)?h:[];}
  return{
    loadDeck(kind){const K=KEYS[kind];const d=read(K.deck,null);const items=d&&d[K.items];
      if(!Array.isArray(items)||!items.length)return null;return{name:d[K.name]||null,items};},
    saveDeck(kind,deck){const K=KEYS[kind];return write(K.deck,{[K.name]:deck.name,[K.items]:deck.items});},
    clearDeck(kind){remove(KEYS[kind].deck);},
    loadDeckId(kind){try{return backend.getItem(KEYS[kind].id)||null;}catch{return null;}},
    saveDeckId(kind,id){try{backend.setItem(KEYS[kind].id,id);return true;}catch{return false;}},
    clearDeckId(kind){remove(KEYS[kind].id);},
    loadHistory,
    appendHistory(id,rec){return write("mcq_history_"+id,[...loadHistory(id),rec].slice(-HISTORY_CAP));},
    clearHistory(id){remove("mcq_history_"+id);},
    loadSrs(){const s=read("fc_srs",{});return s&&typeof s==="object"&&!Array.isArray(s)?s:{};},
    saveSrs(srs){return write("fc_srs",srs);},
    clearSrs(){remove("fc_srs");}
  };
}
```

Immediately after `/* PURE-END */` add:

```js
const store=createStore(localStorage);
const STORAGE_ERR="Could not save to browser storage.";
```

- [ ] **Step 4: Run the tests**

Run: `node tests/run.js` → all pass.

- [ ] **Step 5: Replace every inline `localStorage` call**

`FlashcardDrill`:

```js
  const [cards,setCards]=useState(()=>{const d=store.loadDeck("fc");return d?d.items:SAMPLE_FC;});
  const [deckName,setDeckName]=useState(()=>{const d=store.loadDeck("fc");return (d&&d.name)||"No deck loaded";});
  ...
  const [srs,setSrs]=useState(()=>store.loadSrs());
```

In `handleImport` `r.onload`, replace the two `localStorage` lines with:

```js
      if(!store.saveDeck("fc",{name:v.name,items:v.items})){setErr(STORAGE_ERR);return;}
      setCards(v.items);setDeckName(v.name);setPhase("start");setSess(0);setSelCat(null);
      store.clearSrs();setSrs({});
```

(order matters: save first, then update state, so a failed save leaves the old deck in place).

`clearDeck`: replace the two `localStorage.removeItem` calls with `store.clearDeck("fc");store.clearSrs();`.

`mark`: replace `localStorage.setItem("fc_srs",JSON.stringify(newSrs));` with `if(!store.saveSrs(newSrs))setErr(STORAGE_ERR);`.

`MCQQuiz`:

```js
  const [questions,setQuestions]=useState(()=>{const d=store.loadDeck("mcq");return d?d.items:SAMPLE_MCQ;});
  const [deckName,setDeckName]=useState(()=>{const d=store.loadDeck("mcq");return (d&&d.name)||"No quiz loaded";});
  ...
  const [sess,setSess]=useState(()=>{const id=store.loadDeckId("mcq");return id?store.loadHistory(id).length:0;});
  ...
  const [deckId,setDeckId]=useState(()=>store.loadDeckId("mcq"));
  ...
  const [history,setHistory]=useState(()=>{const id=store.loadDeckId("mcq");return id?store.loadHistory(id).map((rec,i)=>({...rec,sess:i+1})):[];});
```

In `handleImport` `r.onload` after `const a=v.items,name=v.name;`:

```js
      const storedId=store.loadDeckId("mcq");
      const storedDeck=store.loadDeck("mcq");
      const id=(storedId&&storedDeck&&storedDeck.name===name)?storedId:generateUUID();
      const stored=store.loadHistory(id);
      if(!store.saveDeck("mcq",{name,items:a})||!store.saveDeckId("mcq",id)){setErr(STORAGE_ERR);return;}
      setQuestions(a);setDeckName(name);setDeckId(id);setPhase("start");setSess(stored.length);setSelCat(null);
      setHistory(stored.map((rec,i)=>({...rec,sess:i+1})));
```

`clearDeck`: replace the three `localStorage.removeItem` calls with `store.clearDeck("mcq");store.clearDeckId("mcq");if(deckId)store.clearHistory(deckId);`.

`nextQ`: replace the `if(deckId){ const key=...; const stored=...; localStorage.setItem(...) }` block with `if(deckId)store.appendHistory(deckId,record);`.

Confirm with a search that no `localStorage` reference remains outside `const store=createStore(localStorage);`.

- [ ] **Step 6: Run tests and smoke**

`node tests/run.js` → all pass. Smoke with `?v=3`. Additionally, in the page run `const o=localStorage.setItem;localStorage.setItem=()=>{throw new Error('quota')};` then import a good deck → the red banner reads `Could not save to browser storage.` and the old deck is still shown. Restore with `localStorage.setItem=o;`.

- [ ] **Step 7: Commit**

```bash
git add study-drill.html tests/run.js
git commit -m "refactor: route all localStorage access through createStore()

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `useKeys`

**Files:**
- Modify: `study-drill.html` — add a `/* ===== HOOKS ===== */` section after the DOM utilities; replace both keyboard `useEffect`s

**Interfaces:**
- Produces: `useKeys(active:boolean, handler:(e:KeyboardEvent)=>void)`; handler is called for every `keydown` while `active`, except `e.repeat` events and events targeting `INPUT`/`TEXTAREA`.

- [ ] **Step 1: Add the hook**

After `downloadJSON` add:

```js
/* ===== HOOKS ===== */
function useKeys(active,handler){
  const ref=useRef(handler);ref.current=handler;
  useEffect(()=>{
    if(!active)return;
    const onKey=e=>{if(e.repeat||e.target.tagName==="INPUT"||e.target.tagName==="TEXTAREA")return;ref.current(e);};
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[active]);
}
```

- [ ] **Step 2: Replace the flashcard keyboard effect**

Replace the whole `useEffect(()=>{ if(phase!=="quiz")return; const onKey=... },[phase,showAns,mark]);` in `FlashcardDrill` with:

```js
  useKeys(phase==="quiz",e=>{
    if(!showAns){if(e.code==="Space"){e.preventDefault();setShowAns(true);}}
    else{
      if(e.key==="y"||e.key==="Y"||e.key==="ArrowRight")mark(true);
      if(e.key==="n"||e.key==="N"||e.key==="ArrowLeft")mark(false);
    }
  });
```

- [ ] **Step 3: Replace the MCQ keyboard effect**

Replace the whole `useEffect(...,[phase,locked,selected,confirmAns,nextQ]);` in `MCQQuiz` with:

```js
  useKeys(phase==="quiz",e=>{
    // preventDefault stops a focused button from also firing its native click on Enter
    if(e.key==="Enter")e.preventDefault();
    if(!locked){
      const map={a:"A",b:"B",c:"C",d:"D","1":"A","2":"B","3":"C","4":"D"};
      if(map[e.key])setSelected(map[e.key]);
      if(e.key==="Enter"&&selected!==null)confirmAns();
    }else{
      if(e.key==="Enter")nextQ();
    }
  });
```

- [ ] **Step 4: Tests and smoke**

`node tests/run.js` → all pass (nothing changed in the pure block). Smoke with `?v=4`; steps 3, 6 and 11 exercise every shortcut. Also: switch to the other tab mid-quiz and back, start a new quiz, and confirm the keys still work (the listener is re-registered when `active` flips).

- [ ] **Step 5: Commit**

```bash
git add study-drill.html
git commit -m "refactor: share the keyboard-shortcut effect via useKeys

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `makeTheme` replaces the shared parts of `fs` / `ms` / `hpS`

**Files:**
- Modify: `study-drill.html` — add `/* ===== THEME ===== */` before `HistoryPanel`; replace `fs`, `ms`, `hpS`; update every style reference in both components and `HistoryPanel`

**Interfaces:**
- Produces: `makeTheme({accent, onAccent}) → theme object` with the keys listed in Step 1; module constants `T_FC` and `T_MCQ`; per-mode local style objects `fsQ` (flashcards) and `msQ` (MCQ) holding only quiz-card and missed-list styles.

- [ ] **Step 1: Add the theme factory and the two themes**

Insert before `function HistoryPanel`:

```js
/* ===== THEME ===== */
function makeTheme({accent,onAccent}){
  const btn={borderRadius:6,fontSize:13,fontWeight:700,fontFamily:"inherit",cursor:"pointer",letterSpacing:"0.04em"};
  const row={display:"flex",alignItems:"center",gap:12,padding:"5px 0",borderBottom:"1px solid #151520",fontSize:12};
  return{
    accent,
    page:{minHeight:"100vh",background:"#06060b",color:"#e8e6e1",fontFamily:"inherit",display:"flex",flexDirection:"column",alignItems:"center",padding:"0 16px 48px"},
    toolbar:{width:"100%",maxWidth:660,display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:"1px solid #151520",marginBottom:24,flexWrap:"wrap",gap:8},
    tl:{display:"flex",alignItems:"center",gap:10},tr:{display:"flex",gap:6,flexWrap:"wrap"},
    dk:{fontSize:13,fontWeight:700,color:"#bbb"},cc:{fontSize:11,color:"#444",fontWeight:600},
    tb:{background:"#10101a",color:"#777",border:"1px solid #1a1a28",borderRadius:5,padding:"6px 12px",fontSize:11,fontWeight:600,fontFamily:"inherit",cursor:"pointer",whiteSpace:"nowrap"},
    err:{width:"100%",maxWidth:660,background:"#e74c3c14",border:"1px solid #e74c3c33",color:"#e74c3c",borderRadius:6,padding:"10px 16px",fontSize:12,marginBottom:16},
    hero:{textAlign:"center",maxWidth:560,marginTop:16},
    badge:{display:"inline-block",fontSize:10,fontWeight:700,letterSpacing:"0.16em",color:accent,border:`1px solid ${accent}33`,borderRadius:4,padding:"3px 10px",marginBottom:14},
    title:{fontSize:28,fontWeight:800,margin:"0 0 6px",color:"#fff",letterSpacing:"-0.02em"},
    sub:{fontSize:13,color:"#555",margin:"0 0 16px"},
    extra:{fontSize:11,color:"#555",margin:"-10px 0 16px"},
    cats:{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center",marginBottom:28},
    pill:{fontSize:11,color:"#666",background:"#0e0e16",border:"1px solid #1a1a24",borderRadius:20,padding:"4px 10px",cursor:"pointer"},
    pillOn:{color:accent,background:`${accent}11`,borderColor:`${accent}55`},
    wf:{textAlign:"left",background:"#0a0a12",border:"1px solid #151520",borderRadius:10,padding:"18px 20px",marginBottom:28,display:"flex",flexDirection:"column",gap:12},
    ws:{display:"flex",alignItems:"center",gap:12,fontSize:13,color:"#888",lineHeight:1.5},
    sn:{width:24,height:24,borderRadius:"50%",background:`${accent}18`,color:accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,flexShrink:0},
    pri:{...btn,background:accent,color:onAccent,border:"none",padding:"12px 32px"},
    sec:{...btn,background:"transparent",color:accent,border:`1px solid ${accent}55`,padding:"12px 24px",fontSize:12,fontWeight:600,letterSpacing:0},
    ghost:{background:"transparent",color:"#444",border:"none",padding:"12px 16px",fontSize:12,fontFamily:"inherit",cursor:"pointer"},
    rev:{maxWidth:660,width:"100%",textAlign:"center"},
    strip:{display:"flex",justifyContent:"center",alignItems:"center",gap:24,margin:"20px 0 28px"},
    ss:{display:"flex",flexDirection:"column",alignItems:"center",gap:3},
    snum:{fontSize:28,fontWeight:800,color:"#fff"},slbl:{fontSize:10,color:"#555",fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase"},
    sdiv:{width:1,height:40,background:"#1a1a24"},
    ml:{textAlign:"left",background:"#0a0a12",border:"1px solid #151520",borderRadius:8,padding:"20px",marginBottom:24},
    mt:{fontSize:11,fontWeight:700,letterSpacing:"0.12em",color:"#e74c3c",margin:"0 0 16px",textTransform:"uppercase"},
    hl:{textAlign:"left",background:"#0a0a12",border:"1px solid #151520",borderRadius:8,padding:"14px 20px",marginBottom:24},
    ht:{fontSize:10,fontWeight:700,letterSpacing:"0.12em",color:"#444",margin:"0 0 10px",textTransform:"uppercase"},
    hi:row,hn:{color:"#444",fontWeight:600,width:40,flexShrink:0},hp:{fontWeight:700,color:accent,width:40,flexShrink:0},hd:{color:"#555",fontSize:11,flex:1},
    br:{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"},
    hpWrap:{width:"100%",maxWidth:560,background:"#0a0a12",border:"1px solid #151520",borderRadius:10,padding:"18px 20px",marginTop:20},
    hpTitle:{fontSize:10,fontWeight:700,letterSpacing:"0.16em",color:accent,marginBottom:14,textTransform:"uppercase"},
    hpSub:{fontSize:10,fontWeight:700,letterSpacing:"0.12em",color:"#444",marginBottom:8,textTransform:"uppercase"},
    hpEmpty:{fontSize:12,color:"#444",textAlign:"center",padding:"8px 0"},
    hpCat:{color:"#ccc",fontWeight:600,flex:1},
    topb:{width:"100%",maxWidth:660,display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,fontSize:12},
    prog:{color:"#444",fontWeight:600},cat:{color:accent,fontSize:10,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase"},
    rs:{fontSize:12,fontWeight:600},
    pb:{width:"100%",maxWidth:660,height:3,background:"#151520",borderRadius:2,marginBottom:20,overflow:"hidden"},
    pf:{height:"100%",background:accent,borderRadius:2,transition:"width 0.3s ease"},
    kh:{opacity:0.45,fontSize:10,fontWeight:400,marginLeft:5},
  };
}
const T_FC=makeTheme({accent:"#f39c12",onAccent:"#08080d"});
const T_MCQ=makeTheme({accent:"#3b82f6",onAccent:"#fff"});
```

- [ ] **Step 2: Replace `hpS` and update `HistoryPanel`**

Delete the `const hpS={...}` object. Change the signature to `function HistoryPanel({t,history,isSample})` and replace every `hpS.wrap/title/sub/row/empty/num/pct/detail/cat` with `t.hpWrap/hpTitle/hpSub/hi/hpEmpty/hn/hp/hd/hpCat`. `MCQQuiz` passes `t={t}` once Step 4 gives it `const t=T_MCQ;`.

- [ ] **Step 3: Replace `fs` with `fsQ` + theme references**

Delete `const fs={...}` and add, in its place, only the flashcard-specific styles:

```js
const fsQ={
  mi:{marginBottom:14,paddingBottom:14,borderBottom:"1px solid #151520"},
  mc:{fontSize:10,color:"#444",fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4},
  mq:{fontSize:12,fontWeight:600,color:"#ddd",marginBottom:5},ma:{fontSize:11,lineHeight:1.7,color:"#777"},
  co:{width:"100%",maxWidth:660,background:"#0a0a12",border:"1px solid #151520",borderRadius:10,overflow:"hidden"},
  qs:{padding:"28px 24px"},qt:{fontSize:15,lineHeight:1.75,margin:0,color:"#e8e6e1"},
  rb:{width:"100%",background:"#10101a",color:"#f39c12",border:"none",borderTop:"1px solid #151520",padding:"14px",fontSize:13,fontWeight:700,fontFamily:"inherit",cursor:"pointer"},
  as:{borderTop:"1px solid #151520",padding:"22px 24px",background:"#0a0a12"},
  al:{fontSize:10,fontWeight:700,letterSpacing:"0.15em",color:"#2ecc71",marginBottom:10},
  at:{fontSize:13,lineHeight:1.8,color:"#bbb",margin:"0 0 20px"},
  jb:{display:"flex",gap:10},
  gi:{flex:1,background:"#2ecc7118",color:"#2ecc71",border:"1px solid #2ecc7133",borderRadius:6,padding:"11px",fontSize:13,fontWeight:700,fontFamily:"inherit",cursor:"pointer"},
  mi2:{flex:1,background:"#e74c3c18",color:"#e74c3c",border:"1px solid #e74c3c33",borderRadius:6,padding:"11px",fontSize:13,fontWeight:700,fontFamily:"inherit",cursor:"pointer"},
};
```

In `FlashcardDrill` add `const t=T_FC;` as the first line, then substitute per this table (search `fs.` and replace each):

| old | new |
|---|---|
| `fs.page, toolbar, tl, tr, dk, cc, tb, err, hero, badge, title, sub, cats, pill, pillOn, wf, ws, sn, pri, sec, ghost, rev, br, topb, prog, cat, rs, pb, pf, kh` | same key on `t.` |
| `fs.srsBar` | `t.extra` |
| `fs.sr` / `fs.ss` / `fs.snum` / `fs.slbl` / `fs.sdiv` | `t.strip` / `t.ss` / `t.snum` / `t.slbl` / `t.sdiv` |
| `fs.ml` / `fs.mt` | `t.ml` / `t.mt` |
| `fs.hl` / `fs.ht` / `fs.hi` / `fs.hn` / `fs.hp` / `fs.hd` | same key on `t.` |
| `fs.mi, mc, mq, ma, co, qs, qt, rb, as, al, at, jb, gi, mi2` | same key on `fsQ.` |

- [ ] **Step 4: Replace `ms` with `msQ` + theme references**

Delete `const ms={...}` and add:

```js
const msQ={
  gc:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",width:100,height:100,borderRadius:"50%",border:"2px solid #1a1a28",margin:"20px auto 16px"},
  gl:{fontSize:36,fontWeight:900,lineHeight:1},gp:{fontSize:12,color:"#555",fontWeight:600,marginTop:2},
  mc2:{marginBottom:18,paddingBottom:18,borderBottom:"1px solid #151520"},
  mcat:{fontSize:10,color:"#444",fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4},
  mqt:{fontSize:13,fontWeight:600,color:"#ddd",marginBottom:10,lineHeight:1.6},
  ac:{display:"flex",flexDirection:"column",gap:6,marginBottom:10},
  ya:{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#e74c3c"},
  ca:{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#2ecc71"},
  exp:{fontSize:11,lineHeight:1.7,color:"#777",background:"#0e0e18",borderRadius:6,padding:"10px 14px"},
  qcard:{width:"100%",maxWidth:660,background:"#0a0a12",border:"1px solid #151520",borderRadius:10,overflow:"hidden"},
  stem:{padding:"28px 24px 20px"},stxt:{fontSize:15,lineHeight:1.75,margin:0,color:"#e8e6e1"},
  opts:{padding:"0 24px 8px",display:"flex",flexDirection:"column",gap:8},
  obtn:{display:"flex",alignItems:"center",gap:14,width:"100%",padding:"14px 16px",borderRadius:8,border:"1px solid",fontFamily:"inherit",fontSize:13,textAlign:"left",transition:"all 0.15s ease",lineHeight:1.5},
  olab:{width:28,height:28,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,flexShrink:0,transition:"all 0.15s ease"},
  ebox:{margin:"8px 24px 0",padding:"16px 18px",background:"#0e0e18",border:"1px solid #1a1a28",borderRadius:8},
  elab:{fontSize:10,fontWeight:700,letterSpacing:"0.14em",color:"#3b82f6",marginBottom:8},
  etxt:{fontSize:12,lineHeight:1.8,color:"#999",margin:0},
  abar:{padding:"16px 24px 20px"},
  conf:{width:"100%",background:"#3b82f6",color:"#fff",border:"none",borderRadius:6,padding:"13px",fontSize:13,fontWeight:700,fontFamily:"inherit",letterSpacing:"0.04em"},
  next:{width:"100%",background:"#151522",color:"#3b82f6",border:"1px solid #3b82f633",borderRadius:6,padding:"13px",fontSize:13,fontWeight:700,fontFamily:"inherit",cursor:"pointer",letterSpacing:"0.04em"},
};
```

In `MCQQuiz` add `const t=T_MCQ;` first, then substitute:

| old | new |
|---|---|
| `ms.page, toolbar, tl, dk, err, hero, title, sub, cats, pill, pillOn, wf, ws, sn, pri, sec, ghost, rev, strip, sdiv, br, hl, ht, hi, hn, hp, hd, pb, kh` | same key on `t.` |
| `ms.tr2` / `ms.qc` | `t.tr` / `t.cc` |
| `ms.tag` | `t.badge` |
| `ms.sc` / `ms.sv` / `ms.sl` | `t.ss` / `t.snum` / `t.slbl` |
| `ms.mb` / `ms.mh` | `t.ml` / `t.mt` |
| `ms.qbar` / `ms.qprog` / `ms.qcat` / `ms.qrs` / `ms.pbf` | `t.topb` / `t.prog` / `t.cat` / `t.rs` / `t.pf` |
| `ms.gc, gl, gp, mc2, mcat, mqt, ac, ya, ca, exp, qcard, stem, stxt, opts, obtn, olab, ebox, elab, etxt, abar, conf, next` | same key on `msQ.` |

Pass `t={t}` to `<HistoryPanel .../>`.

- [ ] **Step 5: Verify no stale references**

Search the file for `fs\.`, `ms\.`, `hpS\.` — there must be no matches. Open the page: a Babel error would show as a blank page with a console error.

- [ ] **Step 6: Tests and smoke**

`node tests/run.js` → all pass. Smoke with `?v=5`. Expected visual differences on the flashcard tab only: slightly darker page/panels, 660px content width, primary button unchanged (orange with dark text).

- [ ] **Step 7: Commit**

```bash
git add study-drill.html
git commit -m "refactor: makeTheme() replaces the duplicated fs/ms/hpS style objects

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `Toolbar` and `StartScreen`

**Files:**
- Modify: `study-drill.html` — add `/* ===== SHARED COMPONENTS ===== */` after the theme block (before `HistoryPanel`); replace the `tb` toolbar JSX and the `phase==="start"` branch in both components

**Interfaces:**
- Produces:
  - `Toolbar({t, name, countLabel, isSample, onTemplate, onImport(file), onExport, onClear})`
  - `StartScreen({t, badge, title, subtitle, extra?, cats:string[], total:number, catCount(cat)→number, selCat, onSelCat(cat|null), steps:ReactNode[], startLabel, onStart, children?})`
  - Constants `FC_STEPS`, `MCQ_STEPS` (arrays of three nodes)

- [ ] **Step 1: Add the components**

Insert before `function HistoryPanel`:

```jsx
/* ===== SHARED COMPONENTS ===== */
function Toolbar({t,name,countLabel,isSample,onTemplate,onImport,onExport,onClear}){
  return(<div style={t.toolbar}>
    <div style={t.tl}><span style={t.dk}>{name}</span><span style={t.cc}>{countLabel}</span></div>
    <div style={t.tr}>
      <button style={t.tb} onClick={onTemplate}>↓ Template</button>
      <label style={t.tb}>↑ Import<input type="file" accept=".json" onChange={e=>{const f=e.target.files?.[0];e.target.value="";if(f)onImport(f);}} style={{display:"none"}}/></label>
      {!isSample&&<button style={t.tb} onClick={onExport}>↓ Export</button>}
      {!isSample&&<button style={t.tb} onClick={onClear}>✕ Clear</button>}
    </div>
  </div>);
}

function StartScreen({t,badge,title,subtitle,extra,cats,total,catCount,selCat,onSelCat,steps,startLabel,onStart,children}){
  const pill=on=>on?{...t.pill,...t.pillOn}:t.pill;
  return(<div style={t.hero}>
    <div style={t.badge}>{badge}</div><h1 style={t.title}>{title}</h1>
    <p style={t.sub}>{subtitle}</p>
    {extra}
    <div style={t.cats}>
      <span style={pill(selCat===null)} onClick={()=>onSelCat(null)}>All ({total})</span>
      {cats.map(c=><span key={c} style={pill(selCat===c)} onClick={()=>onSelCat(selCat===c?null:c)}>{c} ({catCount(c)})</span>)}
    </div>
    <div style={t.wf}>{steps.map((s,i)=><div key={i} style={t.ws}><span style={t.sn}>{i+1}</span><span>{s}</span></div>)}</div>
    <button style={t.pri} onClick={onStart}>{startLabel}</button>
    {children}
  </div>);
}

const FC_STEPS=[<>Download the <strong>Template</strong> JSON</>,<>Give it to Claude with your notes</>,<><strong>Import</strong> the JSON back here and drill</>];
const MCQ_STEPS=[<>Download the <strong>Template</strong> JSON</>,<>Give it to Claude with your notes — it generates MCQs</>,<><strong>Import</strong> the JSON and test yourself</>];
```

- [ ] **Step 2: Rewire `FlashcardDrill`**

Change `handleImport` to take a `File` instead of an event: signature `const handleImport=useCallback((f)=>{ setErr(null); const r=new FileReader(); ... r.readAsText(f); },[]);` — delete the `const f=e.target.files?.[0];if(!f)return;` and `e.target.value="";` lines.

Replace the `const tb=(<div style={t.toolbar}>...</div>);` block with:

```jsx
  const tb=<Toolbar t={t} name={deckName} countLabel={`${cards.length} cards`} isSample={cards===SAMPLE_FC}
    onTemplate={()=>downloadJSON(FC_TEMPLATE,"flashcard-template.json")} onImport={handleImport}
    onExport={()=>downloadJSON({deck_name:deckName,cards},deckName.replace(/\s+/g,"-").toLowerCase()+"-deck.json")} onClear={clearDeck}/>;
```

Replace the whole `if(phase==="start"){ ... }` branch with:

```jsx
  if(phase==="start"){
    const cats=[...new Set(cards.map(c=>c.category||"Uncategorised"))];
    const boxCounts=[1,2,3].map(b=>cards.filter(c=>(srs[c.id]||1)===b).length);
    return(<div style={t.page}>{tb}{err&&<div style={t.err}>{err}</div>}
      <StartScreen t={t} badge="FLASHCARD DRILL" title={deckName} subtitle={`${cards.length} cards · ${cats.length} categories`}
        extra={<p style={t.extra}><span style={{color:"#e74c3c"}}>■ {boxCounts[0]}</span>{" · "}<span style={{color:"#f39c12"}}>■ {boxCounts[1]}</span>{" · "}<span style={{color:"#2ecc71"}}>■ {boxCounts[2]}</span>{" box 1 / 2 / 3"}</p>}
        cats={cats} total={cards.length} catCount={c=>cards.filter(x=>(x.category||"Uncategorised")===c).length}
        selCat={selCat} onSelCat={setSelCat} steps={FC_STEPS}
        startLabel={selCat?`Drill: ${selCat}`:"Start Drill"} onStart={()=>startQuiz()}/>
    </div>);
  }
```

- [ ] **Step 3: Rewire `MCQQuiz`**

Same `handleImport` signature change. Replace the toolbar block with:

```jsx
  const tb=<Toolbar t={t} name={deckName} countLabel={`${questions.length} Qs`} isSample={questions===SAMPLE_MCQ}
    onTemplate={()=>downloadJSON(MCQ_TEMPLATE,"mcq-template.json")} onImport={handleImport}
    onExport={()=>downloadJSON({quiz_name:deckName,questions},deckName.replace(/\s+/g,"-").toLowerCase()+"-quiz.json")} onClear={clearDeck}/>;
```

Replace the `if(phase==="start"){ ... }` branch with:

```jsx
  if(phase==="start"){
    const cats=[...new Set(questions.map(q=>q.category||"General"))];
    return(<div style={t.page}>{tb}{err&&<div style={t.err}>{err}</div>}
      <StartScreen t={t} badge="MULTIPLE CHOICE" title={deckName} subtitle={`${questions.length} questions · ${cats.length} categories`}
        cats={cats} total={questions.length} catCount={c=>questions.filter(x=>(x.category||"General")===c).length}
        selCat={selCat} onSelCat={setSelCat} steps={MCQ_STEPS}
        startLabel={selCat?`Exam: ${selCat}`:"Begin Exam"} onStart={()=>startQuiz()}>
        <HistoryPanel t={t} history={history} isSample={questions===SAMPLE_MCQ}/>
      </StartScreen>
    </div>);
  }
```

- [ ] **Step 4: Tests and smoke**

`node tests/run.js` → all pass. Smoke with `?v=6`; steps 1, 2, 8, 9, 10, 15, 16 cover the toolbar and start screens.

- [ ] **Step 5: Commit**

```bash
git add study-drill.html
git commit -m "refactor: shared Toolbar and StartScreen components

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: `SessionList`, `HistoryPanel` on it, and `ReviewScreen`

**Files:**
- Modify: `study-drill.html` — shared components section; `HistoryPanel`; the `phase==="review"` branch in both components

**Interfaces:**
- Produces:
  - `SessionList({t, rows, wrongLabel})` — rows are history records `{sess, pct, cat, ok, miss, ts?}`; keyed by `ts ?? sess`
  - `HistoryPanel({t, history, isSample, wrongLabel})`
  - `ReviewScreen({t, sess, header?, stats:{value,label,color?}[], missed?:ReactNode, history, wrongLabel, actions:ReactNode})`

- [ ] **Step 1: Add `SessionList` and `ReviewScreen`, rewrite `HistoryPanel`**

Add after `StartScreen`:

```jsx
function SessionList({t,rows,wrongLabel}){
  return rows.map(h=><div key={h.ts??h.sess} style={t.hi}>
    <span style={t.hn}>#{h.sess}</span><span style={t.hp}>{h.pct}%</span>
    <span style={t.hd}>{h.cat||"All"} · {h.ok} correct · {h.miss} {wrongLabel}</span>
  </div>);
}

function ReviewScreen({t,sess,header,stats,missed,history,wrongLabel,actions}){
  const prev=[...history].reverse().slice(1);
  return(<div style={t.rev}>
    <div style={t.badge}>SESSION {sess}</div>
    {header}
    <div style={t.strip}>{stats.map((s,i)=><React.Fragment key={s.label}>
      {i>0&&<div style={t.sdiv}/>}
      <div style={t.ss}><span style={s.color?{...t.snum,color:s.color}:t.snum}>{s.value}</span><span style={t.slbl}>{s.label}</span></div>
    </React.Fragment>)}</div>
    {missed}
    {prev.length>0&&<div style={t.hl}><h3 style={t.ht}>Session History</h3><SessionList t={t} rows={prev} wrongLabel={wrongLabel}/></div>}
    <div style={t.br}>{actions}</div>
  </div>);
}
```

Replace `HistoryPanel` entirely with:

```jsx
function HistoryPanel({t,history,isSample,wrongLabel}){
  if(isSample)return null;
  const recent=[...history].reverse().slice(0,5);
  const sections=sectionStats(history);
  return(<div style={t.hpWrap}>
    <div style={t.hpTitle}>SESSION HISTORY</div>
    {!history.length
      ?<p style={t.hpEmpty}>No sessions recorded yet.</p>
      :<>
        <div style={t.hpSub}>RECENT</div>
        <SessionList t={t} rows={recent} wrongLabel={wrongLabel}/>
        <div style={{...t.hpSub,marginTop:14}}>BY SECTION</div>
        {sections.map(s=><div key={s.cat} style={t.hi}>
          <span style={t.hpCat}>{s.cat}</span><span style={t.hp}>{s.avg}%</span>
          <span style={t.hd}>{s.count} session{s.count!==1?"s":""}</span>
        </div>)}
      </>}
  </div>);
}
```

Update the MCQ start screen call to `<HistoryPanel t={t} history={history} isSample={questions===SAMPLE_MCQ} wrongLabel="wrong"/>`.

- [ ] **Step 2: Rewire the flashcard review branch**

Replace the whole `if(phase==="review"){ ... }` in `FlashcardDrill` with:

```jsx
  if(phase==="review"){
    const {tot,pct}=summarise(results);const hm=miss>0;
    const missed=hm&&<div style={t.ml}><h3 style={t.mt}>Missed</h3>{results.filter(r=>!r.correct).map(r=>{const c=cards.find(x=>x.id===r.cardId);
      return(<div key={r.cardId} style={fsQ.mi}><div style={fsQ.mc}>{c?.category}</div><div style={fsQ.mq}>{c?.question}</div><div className="md" style={fsQ.ma} dangerouslySetInnerHTML={{__html:renderMd(c?.answer)}}/></div>);})}</div>;
    return(<div style={t.page}>{tb}
      <ReviewScreen t={t} sess={sess} history={history} wrongLabel="missed" missed={missed}
        stats={[{value:ok,label:"Correct"},{value:miss,label:"Missed",color:miss?"#e74c3c":"#2ecc71"},{value:`${pct}%`,label:"Score"}]}
        actions={<>
          <button style={t.pri} onClick={()=>startQuiz()}>Full Deck</button>
          {hm&&<button style={t.sec} onClick={startMissed}>Missed Only ({miss})</button>}
          <button style={t.ghost} onClick={()=>setPhase("start")}>← Back</button>
        </>}/>
    </div>);
  }
```

- [ ] **Step 3: Rewire the MCQ review branch**

Replace the whole `if(phase==="review"){ ... }` in `MCQQuiz` with:

```jsx
  if(phase==="review"){
    const {tot,pct}=summarise(results);const hm=miss>0;
    const grade=pct>=90?"A":pct>=80?"B":pct>=70?"C":pct>=60?"D":"F";
    const gc=pct>=80?"#2ecc71":pct>=60?"#f39c12":"#e74c3c";
    const missed=hm&&<div style={t.ml}><h3 style={t.mt}>Review Incorrect</h3>{results.filter(r=>!r.correct).map(r=>{
      const qo=quizQs.find(x=>x.id===r.qId);if(!qo)return null;
      const ch=qo.options.find(o=>o.label===r.chose);const co=qo.options.find(o=>o.label===qo.correct);
      return(<div key={r.qId} style={msQ.mc2}><div style={msQ.mcat}>{qo.category}</div><div style={msQ.mqt}>{qo.question}</div>
        <div style={msQ.ac}><div style={msQ.ya}><span style={{fontWeight:800}}>✗</span> You: <strong>{r.chose}</strong> — {ch?.text}</div><div style={msQ.ca}><span style={{fontWeight:800}}>✓</span> Correct: <strong>{qo.correct}</strong> — {co?.text}</div></div>
        {qo.explanation&&<div className="md" style={msQ.exp} dangerouslySetInnerHTML={{__html:renderMd(qo.explanation)}}/>}</div>);})}</div>;
    return(<div style={t.page}>{tb}
      <ReviewScreen t={t} sess={sess} history={history} wrongLabel="wrong" missed={missed}
        header={<div style={msQ.gc}><span style={{...msQ.gl,color:gc}}>{grade}</span><span style={msQ.gp}>{pct}%</span></div>}
        stats={[{value:ok,label:"Correct"},{value:miss,label:"Wrong",color:miss?"#e74c3c":"#2ecc71"},{value:tot,label:"Total"}]}
        actions={<>
          <button style={t.pri} onClick={()=>startQuiz()}>Full Quiz</button>
          {hm&&<button style={t.sec} onClick={startMissed}>Wrong Only ({miss})</button>}
          <button style={t.ghost} onClick={()=>setPhase("start")}>← Back</button>
        </>}/>
    </div>);
  }
```

- [ ] **Step 4: Tests and smoke**

`node tests/run.js` → all pass. Smoke with `?v=7`; steps 4, 6, 10, 12, 14 cover the review screen and both history renderings. Confirm no React key warnings in the console.

- [ ] **Step 5: Commit**

```bash
git add study-drill.html
git commit -m "refactor: shared ReviewScreen and one SessionList for both history renderings

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: `useDeck` and `useHistory`; final shape of both components

**Files:**
- Modify: `study-drill.html` — hooks section; `FlashcardDrill` and `MCQQuiz` are rewritten in full (below)

**Interfaces:**
- Produces:
  - `useDeck(kind, sample, validate, onImport?) → {items, name, deckId, isSample, err, setErr, importFile(file), clear(), exportDeck()}`
  - `useHistory(deckId, {persist}) → {history, sess, startSession(), endSession(rec)}` where `endSession` stamps `ts` and `sess`
- Consumes: `store`, `STORAGE_ERR`, validators, `orderByBox`, `shuffleMcqOptions`, `summarise`, `useKeys`, `Toolbar`, `StartScreen`, `ReviewScreen`, `HistoryPanel`, `T_FC`, `T_MCQ`, `fsQ`, `msQ`, `FC_STEPS`, `MCQ_STEPS`

- [ ] **Step 1: Add the hooks**

In the `/* ===== HOOKS ===== */` section, after `useKeys`:

```jsx
const DEFAULT_NAME={fc:"No deck loaded",mcq:"No quiz loaded"};
const EXPORT_SHAPE={fc:{name:"deck_name",items:"cards",suffix:"-deck.json"},mcq:{name:"quiz_name",items:"questions",suffix:"-quiz.json"}};

function useDeck(kind,sample,validate,onImport){
  const [deck,setDeck]=useState(()=>{
    const d=store.loadDeck(kind);
    return d?{items:d.items,name:d.name||DEFAULT_NAME[kind],deckId:store.loadDeckId(kind)}:{items:sample,name:DEFAULT_NAME[kind],deckId:null};
  });
  const [err,setErr]=useState(null);
  const importFile=useCallback(f=>{
    setErr(null);
    const r=new FileReader();
    r.onload=ev=>{
      let d;try{d=JSON.parse(ev.target.result);}catch{setErr("Invalid JSON.");return;}
      const v=validate(d,f.name.replace(/\.json$/,""));
      if(!v.ok){setErr(v.error);return;}
      const stored=store.loadDeck(kind),storedId=store.loadDeckId(kind);
      const deckId=(storedId&&stored&&stored.name===v.name)?storedId:generateUUID();
      if(!store.saveDeck(kind,{name:v.name,items:v.items})||!store.saveDeckId(kind,deckId)){setErr(STORAGE_ERR);return;}
      setDeck({items:v.items,name:v.name,deckId});
      if(onImport)onImport(deckId);
    };
    r.readAsText(f);
  },[kind,validate,onImport]);
  const clear=useCallback(()=>{
    store.clearDeck(kind);store.clearDeckId(kind);
    setDeck({items:sample,name:DEFAULT_NAME[kind],deckId:null});
  },[kind,sample]);
  const exportDeck=useCallback(()=>{
    const S=EXPORT_SHAPE[kind];
    downloadJSON({[S.name]:deck.name,[S.items]:deck.items},deck.name.replace(/\s+/g,"-").toLowerCase()+S.suffix);
  },[kind,deck]);
  return{items:deck.items,name:deck.name,deckId:deck.deckId,isSample:deck.items===sample,err,setErr,importFile,clear,exportDeck};
}

function useHistory(deckId,{persist}){
  const load=()=>persist&&deckId?store.loadHistory(deckId).map((r,i)=>({...r,sess:i+1})):[];
  const [history,setHistory]=useState(load);
  const [sess,setSess]=useState(()=>load().length);
  const first=useRef(true);
  useEffect(()=>{
    if(first.current){first.current=false;return;}
    const h=load();setHistory(h);setSess(h.length);
  },[deckId,persist]);
  const startSession=useCallback(()=>setSess(s=>s+1),[]);
  const endSession=useCallback(rec=>{
    const full={...rec,ts:Date.now(),sess};
    if(persist&&deckId)store.appendHistory(deckId,full);
    setHistory(h=>[...h,full]);
  },[deckId,persist,sess]);
  return{history,sess,startSession,endSession};
}
```

- [ ] **Step 2: Replace `FlashcardDrill` in full**

```jsx
/* ===== FLASHCARD COMPONENT ===== */
function FlashcardDrill(){
  const t=T_FC;
  const [phase,setPhase]=useState("start");
  const [selCat,setSelCat]=useState(null);
  const [srs,setSrs]=useState(()=>store.loadSrs());
  const [quizCards,setQuizCards]=useState([]);
  const [ci,setCi]=useState(0);
  const [showAns,setShowAns]=useState(false);
  const [results,setResults]=useState([]);

  const onImport=useCallback(()=>{store.clearSrs();setSrs({});setPhase("start");setSelCat(null);},[]);
  const deck=useDeck("fc",SAMPLE_FC,validateFlashcards,onImport);
  const cards=deck.items;
  const {history,sess,startSession,endSession}=useHistory(deck.deckId,{persist:false});

  const clearAll=useCallback(()=>{deck.clear();store.clearSrs();setSrs({});setPhase("start");setSelCat(null);},[deck.clear]);

  const startQuiz=useCallback((sub)=>{
    const pool=sub||(selCat?cards.filter(c=>(c.category||"Uncategorised")===selCat):cards);
    setQuizCards(orderByBox(pool,srs));setCi(0);setShowAns(false);setResults([]);startSession();setPhase("quiz");
  },[cards,selCat,srs,startSession]);

  const startMissed=useCallback(()=>{
    const ids=results.filter(r=>!r.correct).map(r=>r.cardId);
    const m=cards.filter(c=>ids.includes(c.id));if(m.length)startQuiz(m);
  },[results,cards,startQuiz]);

  const mark=useCallback((correct)=>{
    const cardId=quizCards[ci].id;
    const newBox=correct?Math.min((srs[cardId]||1)+1,3):1;
    const newSrs={...srs,[cardId]:newBox};
    setSrs(newSrs);if(!store.saveSrs(newSrs))deck.setErr(STORAGE_ERR);
    const newResults=[...results,{cardId,correct}];
    setResults(newResults);
    if(ci+1<quizCards.length){setCi(i=>i+1);setShowAns(false);}
    else{const s=summarise(newResults);endSession({cat:selCat,pct:s.pct,ok:s.ok,miss:s.miss,tot:s.tot});setPhase("review");}
  },[quizCards,ci,results,selCat,srs,endSession,deck.setErr]);

  useKeys(phase==="quiz",e=>{
    if(!showAns){if(e.code==="Space"){e.preventDefault();setShowAns(true);}}
    else{
      if(e.key==="y"||e.key==="Y"||e.key==="ArrowRight")mark(true);
      if(e.key==="n"||e.key==="N"||e.key==="ArrowLeft")mark(false);
    }
  });

  const card=quizCards[ci];
  const {ok,miss}=summarise(results);

  const tb=<Toolbar t={t} name={deck.name} countLabel={`${cards.length} cards`} isSample={deck.isSample}
    onTemplate={()=>downloadJSON(FC_TEMPLATE,"flashcard-template.json")} onImport={deck.importFile} onExport={deck.exportDeck} onClear={clearAll}/>;

  if(phase==="start"){
    const cats=[...new Set(cards.map(c=>c.category||"Uncategorised"))];
    const boxCounts=[1,2,3].map(b=>cards.filter(c=>(srs[c.id]||1)===b).length);
    return(<div style={t.page}>{tb}{deck.err&&<div style={t.err}>{deck.err}</div>}
      <StartScreen t={t} badge="FLASHCARD DRILL" title={deck.name} subtitle={`${cards.length} cards · ${cats.length} categories`}
        extra={<p style={t.extra}><span style={{color:"#e74c3c"}}>■ {boxCounts[0]}</span>{" · "}<span style={{color:"#f39c12"}}>■ {boxCounts[1]}</span>{" · "}<span style={{color:"#2ecc71"}}>■ {boxCounts[2]}</span>{" box 1 / 2 / 3"}</p>}
        cats={cats} total={cards.length} catCount={c=>cards.filter(x=>(x.category||"Uncategorised")===c).length}
        selCat={selCat} onSelCat={setSelCat} steps={FC_STEPS}
        startLabel={selCat?`Drill: ${selCat}`:"Start Drill"} onStart={()=>startQuiz()}/>
    </div>);
  }

  if(phase==="review"){
    const {tot,pct}=summarise(results);const hm=miss>0;
    const missed=hm&&<div style={t.ml}><h3 style={t.mt}>Missed</h3>{results.filter(r=>!r.correct).map(r=>{const c=cards.find(x=>x.id===r.cardId);
      return(<div key={r.cardId} style={fsQ.mi}><div style={fsQ.mc}>{c?.category}</div><div style={fsQ.mq}>{c?.question}</div><div className="md" style={fsQ.ma} dangerouslySetInnerHTML={{__html:renderMd(c?.answer)}}/></div>);})}</div>;
    return(<div style={t.page}>{tb}
      <ReviewScreen t={t} sess={sess} history={history} wrongLabel="missed" missed={missed}
        stats={[{value:ok,label:"Correct"},{value:miss,label:"Missed",color:miss?"#e74c3c":"#2ecc71"},{value:`${pct}%`,label:"Score"}]}
        actions={<>
          <button style={t.pri} onClick={()=>startQuiz()}>Full Deck</button>
          {hm&&<button style={t.sec} onClick={startMissed}>Missed Only ({miss})</button>}
          <button style={t.ghost} onClick={()=>setPhase("start")}>← Back</button>
        </>}/>
    </div>);
  }

  return(<div style={t.page}>{tb}
    <div style={t.topb}><span style={t.prog}>{ci+1} / {quizCards.length}</span><span style={t.cat}>{card?.category}</span><span style={{...t.cat,color:["","#e74c3c","#f39c12","#2ecc71"][srs[card?.id]||1]}}>BOX {srs[card?.id]||1}</span><span style={t.rs}><span style={{color:"#2ecc71"}}>✓{ok}</span>{" · "}<span style={{color:"#e74c3c"}}>✗{miss}</span></span></div>
    <div style={t.pb}><div style={{...t.pf,width:`${(ci+1)/quizCards.length*100}%`}}/></div>
    <div style={fsQ.co}><div style={fsQ.qs}><p style={fsQ.qt}>{card?.question}</p></div>
      {!showAns?<button style={fsQ.rb} onClick={()=>setShowAns(true)}>Reveal Answer<span style={t.kh}>[Space]</span></button>:
      <div style={fsQ.as}><div style={fsQ.al}>CORRECT ANSWER</div><div className="md" style={fsQ.at} dangerouslySetInnerHTML={{__html:renderMd(card?.answer)}}/>
        <div style={fsQ.jb}><button style={fsQ.gi} onClick={()=>mark(true)}>✓ Got It<span style={t.kh}>[Y / →]</span></button><button style={fsQ.mi2} onClick={()=>mark(false)}>✗ Missed It<span style={t.kh}>[N / ←]</span></button></div>
      </div>}
    </div>
  </div>);
}
```

(`fsQ` stays where Task 5 put it.)

- [ ] **Step 3: Replace `MCQQuiz` in full**

```jsx
/* ===== MCQ COMPONENT ===== */
function MCQQuiz(){
  const t=T_MCQ;
  const [phase,setPhase]=useState("start");
  const [selCat,setSelCat]=useState(null);
  const [quizQs,setQuizQs]=useState([]);
  const [idx,setIdx]=useState(0);
  const [selected,setSelected]=useState(null);
  const [locked,setLocked]=useState(false);
  const [results,setResults]=useState([]);

  const onImport=useCallback(()=>{setPhase("start");setSelCat(null);},[]);
  const deck=useDeck("mcq",SAMPLE_MCQ,validateMcq,onImport);
  const questions=deck.items;
  const {history,sess,startSession,endSession}=useHistory(deck.deckId,{persist:true});

  const clearAll=useCallback(()=>{if(deck.deckId)store.clearHistory(deck.deckId);deck.clear();setPhase("start");setSelCat(null);},[deck.deckId,deck.clear]);

  const startQuiz=useCallback((sub)=>{
    const pool=sub||(selCat?questions.filter(q=>(q.category||"General")===selCat):questions);
    setQuizQs(shuffleArray(pool).map(shuffleMcqOptions));setIdx(0);setSelected(null);setLocked(false);setResults([]);startSession();setPhase("quiz");
  },[questions,selCat,startSession]);

  const startMissed=useCallback(()=>{
    const ids=results.filter(r=>!r.correct).map(r=>r.qId);
    const m=questions.filter(q=>ids.includes(q.id));if(m.length)startQuiz(m);
  },[results,questions,startQuiz]);

  const confirmAns=useCallback(()=>{
    if(selected===null||locked)return;
    const q=quizQs[idx];setLocked(true);
    setResults(p=>[...p,{qId:q.id,chose:selected,correct:selected===q.correct}]);
  },[selected,locked,quizQs,idx]);

  const nextQ=useCallback(()=>{
    if(idx+1<quizQs.length){setIdx(i=>i+1);setSelected(null);setLocked(false);}
    else{const s=summarise(results);endSession({cat:selCat,pct:s.pct,ok:s.ok,miss:s.miss,tot:s.tot});setPhase("review");}
  },[idx,quizQs,results,selCat,endSession]);

  useKeys(phase==="quiz",e=>{
    // preventDefault stops a focused button from also firing its native click on Enter
    if(e.key==="Enter")e.preventDefault();
    if(!locked){
      const map={a:"A",b:"B",c:"C",d:"D","1":"A","2":"B","3":"C","4":"D"};
      if(map[e.key])setSelected(map[e.key]);
      if(e.key==="Enter"&&selected!==null)confirmAns();
    }else{
      if(e.key==="Enter")nextQ();
    }
  });

  const q=quizQs[idx];
  const {ok,miss}=summarise(results);

  const tb=<Toolbar t={t} name={deck.name} countLabel={`${questions.length} Qs`} isSample={deck.isSample}
    onTemplate={()=>downloadJSON(MCQ_TEMPLATE,"mcq-template.json")} onImport={deck.importFile} onExport={deck.exportDeck} onClear={clearAll}/>;

  if(phase==="start"){
    const cats=[...new Set(questions.map(q=>q.category||"General"))];
    return(<div style={t.page}>{tb}{deck.err&&<div style={t.err}>{deck.err}</div>}
      <StartScreen t={t} badge="MULTIPLE CHOICE" title={deck.name} subtitle={`${questions.length} questions · ${cats.length} categories`}
        cats={cats} total={questions.length} catCount={c=>questions.filter(x=>(x.category||"General")===c).length}
        selCat={selCat} onSelCat={setSelCat} steps={MCQ_STEPS}
        startLabel={selCat?`Exam: ${selCat}`:"Begin Exam"} onStart={()=>startQuiz()}>
        <HistoryPanel t={t} history={history} isSample={deck.isSample} wrongLabel="wrong"/>
      </StartScreen>
    </div>);
  }

  if(phase==="review"){
    const {tot,pct}=summarise(results);const hm=miss>0;
    const grade=pct>=90?"A":pct>=80?"B":pct>=70?"C":pct>=60?"D":"F";
    const gc=pct>=80?"#2ecc71":pct>=60?"#f39c12":"#e74c3c";
    const missed=hm&&<div style={t.ml}><h3 style={t.mt}>Review Incorrect</h3>{results.filter(r=>!r.correct).map(r=>{
      const qo=quizQs.find(x=>x.id===r.qId);if(!qo)return null;
      const ch=qo.options.find(o=>o.label===r.chose);const co=qo.options.find(o=>o.label===qo.correct);
      return(<div key={r.qId} style={msQ.mc2}><div style={msQ.mcat}>{qo.category}</div><div style={msQ.mqt}>{qo.question}</div>
        <div style={msQ.ac}><div style={msQ.ya}><span style={{fontWeight:800}}>✗</span> You: <strong>{r.chose}</strong> — {ch?.text}</div><div style={msQ.ca}><span style={{fontWeight:800}}>✓</span> Correct: <strong>{qo.correct}</strong> — {co?.text}</div></div>
        {qo.explanation&&<div className="md" style={msQ.exp} dangerouslySetInnerHTML={{__html:renderMd(qo.explanation)}}/>}</div>);})}</div>;
    return(<div style={t.page}>{tb}
      <ReviewScreen t={t} sess={sess} history={history} wrongLabel="wrong" missed={missed}
        header={<div style={msQ.gc}><span style={{...msQ.gl,color:gc}}>{grade}</span><span style={msQ.gp}>{pct}%</span></div>}
        stats={[{value:ok,label:"Correct"},{value:miss,label:"Wrong",color:miss?"#e74c3c":"#2ecc71"},{value:tot,label:"Total"}]}
        actions={<>
          <button style={t.pri} onClick={()=>startQuiz()}>Full Quiz</button>
          {hm&&<button style={t.sec} onClick={startMissed}>Wrong Only ({miss})</button>}
          <button style={t.ghost} onClick={()=>setPhase("start")}>← Back</button>
        </>}/>
    </div>);
  }

  return(<div style={t.page}>{tb}
    <div style={t.topb}><span style={t.prog}>{idx+1} / {quizQs.length}</span><span style={t.cat}>{q?.category}</span><span style={t.rs}><span style={{color:"#2ecc71"}}>✓{ok}</span>{" · "}<span style={{color:"#e74c3c"}}>✗{miss}</span></span></div>
    <div style={t.pb}><div style={{...t.pf,width:`${(idx+1)/quizQs.length*100}%`}}/></div>
    <div style={msQ.qcard}>
      <div style={msQ.stem}><p style={msQ.stxt}>{q?.question}</p></div>
      <div style={msQ.opts}>{q?.options.map(opt=>{
        const isSel=selected===opt.label;const isCor=locked&&opt.label===q.correct;const isWS=locked&&isSel&&opt.label!==q.correct;
        let bg="#0c0c14",bdr="#1e1e2e",col="#ccc",lbg="#1a1a28",lc="#888";
        if(!locked&&isSel){bg="#1a1a2e";bdr="#3b82f6";lbg="#3b82f6";lc="#fff";}
        if(isCor){bg="#2ecc7112";bdr="#2ecc7155";col="#2ecc71";lbg="#2ecc71";lc="#000";}
        if(isWS){bg="#e74c3c12";bdr="#e74c3c55";col="#e74c3c";lbg="#e74c3c";lc="#fff";}
        return(<button key={opt.label} style={{...msQ.obtn,background:bg,borderColor:bdr,color:col,cursor:locked?"default":"pointer"}} onClick={()=>!locked&&setSelected(opt.label)} disabled={locked}>
          <span style={{...msQ.olab,background:lbg,color:lc}}>{opt.label}</span><span style={{flex:1}}>{opt.text}</span></button>);
      })}</div>
      {locked&&q?.explanation&&<div style={msQ.ebox}><div style={msQ.elab}>EXPLANATION</div><div className="md" style={msQ.etxt} dangerouslySetInnerHTML={{__html:renderMd(q.explanation)}}/></div>}
      <div style={msQ.abar}>{!locked?
        <button style={{...msQ.conf,opacity:selected===null?0.35:1,cursor:selected===null?"default":"pointer"}} onClick={confirmAns} disabled={selected===null}>Lock Answer<span style={t.kh}>[Enter]</span></button>:
        <button style={msQ.next} onClick={nextQ}>{idx+1<quizQs.length?"Next Question →":"See Results →"}<span style={t.kh}>[Enter]</span></button>
      }</div>
    </div>
  </div>);
}
```

- [ ] **Step 4: Remove dead code and check the file**

`handleImport`, `clearDeck`, `deckName`/`setDeckName`, `cards`/`setCards`, `questions`/`setQuestions`, `deckId`/`setDeckId`, `sess`/`setSess`, `history`/`setHistory` state declarations must be gone from both components (the hooks own them). Search for `localStorage` — exactly one match (`createStore(localStorage)`). Search for `useState(()=>{try` — no matches.

- [ ] **Step 5: Tests and full smoke**

`node tests/run.js` → all pass. Full 16-step smoke with `?v=8`. In addition, on the flashcard tab after finishing a session, run `JSON.stringify(history)` is not accessible — instead confirm via the review screen after a second session that the Session History block appears with `#1`, and via `localStorage.getItem('fc_deck_id')` that an id exists after a flashcard import (new additive key).

- [ ] **Step 6: Commit**

```bash
git add study-drill.html
git commit -m "refactor: useDeck and useHistory own deck and session state for both modes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Documentation

**Files:**
- Modify: `CLAUDE.md` — Architecture section, Open work item 11, line count

- [ ] **Step 1: Rewrite the Architecture section**

Replace everything from `## Architecture` to the line before `## Specs and plans` with:

```markdown
## Architecture

Everything lives in `study-drill.html` inside a single `<script type="text/babel">` block (~N lines — update after Task 9), in this order:

- **Pure block** (`/* PURE-START */` … `/* PURE-END */`) — plain JS, no JSX/React/DOM: `shuffleArray`, `generateUUID`, `validateFlashcards`, `validateMcq`, `orderByBox`, `shuffleMcqOptions`, `summarise`, `sectionStats`, `createStore`. Only `function` declarations and `var` at top level, so `tests/run.js` can slice it out and run it under Node.
- **`store`** — `createStore(localStorage)`. The only place that touches `localStorage`; keys `fc_deck`, `fc_deck_id`, `fc_srs`, `mcq_deck`, `mcq_deck_id`, `mcq_history_<uuid>`. Writes return `false` on failure (surfaced as `STORAGE_ERR`). Phase 2 of the commercialisation plan swaps this object for a Supabase-backed one.
- **DOM utilities** — `renderMd` (marked + DOMPurify), `downloadJSON`.
- **Hooks** — `useKeys(active, handler)`, `useDeck(kind, sample, validate, onImport)`, `useHistory(deckId, {persist})`.
- **Theme** — `makeTheme({accent, onAccent})`; `T_FC` (orange) and `T_MCQ` (blue). Greys and widths are shared; only the accent differs.
- **Shared components** — `Toolbar`, `StartScreen`, `SessionList`, `HistoryPanel`, `ReviewScreen`. Presentational; take the theme as `t`.
- **`FlashcardDrill`** — quiz-phase JSX, `mark`, 3-box Leitner box transitions (`fc_srs`), local styles `fsQ`. History is ephemeral (`persist:false`).
- **`MCQQuiz`** — quiz-phase JSX, `confirmAns`/`nextQ`, local styles `msQ`. History persists per deck UUID (`persist:true`).
- **`App`** — tab switcher.
- **Templates** (`FC_TEMPLATE`, `MCQ_TEMPLATE`) — JSON schemas with embedded Claude prompting instructions.

Data flow: JSON files are imported via `Toolbar` → `useDeck.importFile` → validator → `store.saveDeck`. Sessions end via `useHistory.endSession`, which stamps `ts` and `sess` and, when persisting, appends through the store (capped at 20).

## Tests

`node tests/run.js` — no dependencies. Slices the pure block out of the HTML and runs `node:assert` cases against it with a Map-backed storage stub. Run it after any change to the pure block or the store. UI flows are checked by a scripted browser smoke against the `launch.json` static server (`http://localhost:8765/study-drill.html`); `file://` cannot be used because the Browser pane disables storage for it.
```

Replace `~N lines — update after Task 9` with the real `wc -l` count.

- [ ] **Step 2: Update open work**

Remove item 11 (consolidated session-history rendering — done by Task 7). In item 7 add: "The `persist` flag on `useHistory` and `fc_deck_id` already exist; the remaining work is the history key, the SRS key, and rendering `HistoryPanel` on the flashcard start screen." In item 8 add: "`endSession` already writes `sess` into stored records; `useHistory.load` just needs to stop overwriting it."

- [ ] **Step 3: Update the architectural notes**

Replace the 13th September 2026 architectural note's body with one sentence: "Done 14 Sep 2026 — see `docs/superpowers/specs/2026-09-14-shared-structure-refactor-design.md`." Leave the 7th April note.

- [ ] **Step 4: Final check and commit**

`node tests/run.js` → all pass. Full smoke one last time.

```bash
git add CLAUDE.md
git commit -m "docs: describe the shared structure, tests and storage seam in CLAUDE.md

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
