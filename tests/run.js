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
  // Run in this realm (not vm.runInNewContext's separate context) so object/array
  // literals the pure functions return share Object/Array prototypes with this file's
  // realm — otherwise assert.deepStrictEqual reports "not reference-equal" even when
  // structurally identical, because a fresh vm context has its own intrinsics.
  // Because this runs in this realm, the pure block's function declarations land on
  // Node's `global` for the lifetime of this test process (not just on the returned object).
  const names = [];
  const nameRe = /^function\s+(\w+)/gm;
  let mm;
  while ((mm = nameRe.exec(m[1]))) names.push(mm[1]);
  const wrapped = m[1] + "\n;({" + names.join(",") + "});";
  const P = vm.runInThisContext(wrapped, { filename: "study-drill.html(pure)" });
  P.__source = m[1];
  return P;
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

console.log("pure block invariants");
test("pure block declares no top-level const/let and references no React/DOM/localStorage identifiers", () => {
  const noComments = P.__source.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/^(const|let)\s/m.test(noComments), "pure block must not declare top-level const/let");
  for (const id of ["React", "document", "window", "localStorage"]) {
    assert.ok(!new RegExp("\\b" + id + "\\b").test(noComments), "pure block must not reference " + id);
  }
});

if (require.main === module) {
  console.log(`\n${results.pass} passed, ${results.fail} failed`);
  process.exit(results.fail ? 1 : 0);
}
