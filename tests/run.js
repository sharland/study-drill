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
