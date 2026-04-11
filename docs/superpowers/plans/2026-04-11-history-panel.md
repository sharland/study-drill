# History Panel (MCQ) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist MCQ session history per deck and display it on the start screen so users see their progress immediately on load.

**Architecture:** All changes are in `study-drill.html`. A `generateUUID` utility generates stable deck identifiers stored in localStorage. Session records are persisted under `mcq_history_<uuid>`. A new `HistoryPanel` pure function renders the panel and is designed to lift into a future dedicated view (Option B) without rewriting.

**Tech Stack:** React 18 (CDN), Babel standalone, localStorage, no build step.

---

## File map

| File | Changes |
|---|---|
| `study-drill.html` | All changes — see tasks below for exact line regions |

Insertion points (by current line):
- **~line 45** (after `downloadJSON`) — add `generateUUID`
- **~line 70** (after `SAMPLE_MCQ`) — add `HistoryPanel` function + `hpS` style object
- **~line 262** (`MCQQuiz` state declarations) — add `deckId` state; update `sess` and `history` initialisers
- **~line 275** (`handleImport`) — add UUID logic
- **~line 289** (`clearDeck`) — remove history key
- **~line 316** (`nextQ`) — write session record to localStorage
- **~line 355** (MCQ start screen JSX) — add `<HistoryPanel>`

---

## Task 1: UUID utility + deck identity on import

**Files:**
- Modify: `study-drill.html` (~line 45, ~line 262, ~line 275)

- [ ] **Step 1: Add `generateUUID` after `downloadJSON` (~line 45)**

Find this line:
```javascript
}
/* ===== TEMPLATES ===== */
```

Insert between them:
```javascript
function generateUUID(){
  return'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{
    const r=Math.random()*16|0;
    return(c==='x'?r:(r&0x3|0x8)).toString(16);
  });
}
```

- [ ] **Step 2: Add `deckId` state to `MCQQuiz` state declarations**

Find the existing `const [err,setErr]` line in `MCQQuiz` and add after it:
```javascript
const [deckId,setDeckId]=useState(()=>localStorage.getItem("mcq_deck_id")||null);
```

- [ ] **Step 3: Update `handleImport` in `MCQQuiz` to generate/reuse UUID**

Replace the existing `handleImport` in `MCQQuiz`:
```javascript
const handleImport=useCallback((e)=>{
    const f=e.target.files?.[0];if(!f)return;setErr(null);
    const r=new FileReader();
    r.onload=(ev)=>{try{
      const d=JSON.parse(ev.target.result);const a=d.questions||d;
      if(!Array.isArray(a)||!a.length){setErr("JSON must contain a 'questions' array.");return;}
      if(!a.every(q=>q.id!==undefined&&q.question&&Array.isArray(q.options)&&q.options.length>=2&&q.correct)){setErr("Every question needs id, question, options[], correct.");return;}
      const name=d.quiz_name||f.name.replace(/\.json$/,"");
      const storedId=localStorage.getItem("mcq_deck_id");
      const storedName=JSON.parse(localStorage.getItem("mcq_deck")||"{}").quiz_name;
      const id=(storedId&&storedName===name)?storedId:generateUUID();
      const storedSess=JSON.parse(localStorage.getItem(`mcq_history_${id}`)||"[]").length;
      const newHistory=JSON.parse(localStorage.getItem(`mcq_history_${id}`)||"[]").map((rec,i)=>({...rec,sess:i+1}));
      setQuestions(a);setDeckName(name);setDeckId(id);setPhase("start");setSess(storedSess);setSelCat(null);setHistory(newHistory);
      localStorage.setItem("mcq_deck",JSON.stringify({quiz_name:name,questions:a}));
      localStorage.setItem("mcq_deck_id",id);
    }catch{setErr("Invalid JSON.");}};
    r.readAsText(f);e.target.value="";
  },[]);
```

- [ ] **Step 4: Verify in browser**

Open `study-drill.html`. Import any MCQ JSON.
Open DevTools → Application → Local Storage.
Confirm `mcq_deck_id` now appears with a UUID value (e.g. `550e8400-e29b-41d4-a716-446655440000`).
Import the same deck again — confirm the UUID is unchanged.
Import a deck with a different `quiz_name` — confirm a new UUID is generated.

- [ ] **Step 5: Commit**
```bash
git add study-drill.html
git commit -m "feat: add UUID deck identity on MCQ import"
```

---

## Task 2: Persist and restore session history

**Files:**
- Modify: `study-drill.html` (~line 262 state declarations, ~line 316 `nextQ`)

- [ ] **Step 1: Update `sess` and `history` state initialisers in `MCQQuiz`**

Replace the existing:
```javascript
const [sess,setSess]=useState(0);
```
with:
```javascript
const [sess,setSess]=useState(()=>{
  try{
    const id=localStorage.getItem("mcq_deck_id");
    if(!id)return 0;
    return JSON.parse(localStorage.getItem(`mcq_history_${id}`)||"[]").length;
  }catch{return 0;}
});
```

Replace the existing:
```javascript
const [history,setHistory]=useState([]);
```
with:
```javascript
const [history,setHistory]=useState(()=>{
  try{
    const id=localStorage.getItem("mcq_deck_id");
    if(!id)return[];
    return JSON.parse(localStorage.getItem(`mcq_history_${id}`)||"[]").map((rec,i)=>({...rec,sess:i+1}));
  }catch{return[];}
});
```

- [ ] **Step 2: Update `nextQ` to persist the completed session record**

Replace the existing `nextQ`:
```javascript
const nextQ=useCallback(()=>{
    if(idx+1<quizQs.length){setIdx(i=>i+1);setSelected(null);setLocked(false);}
    else{
      const okCount=results.filter(r=>r.correct).length;
      const record={ts:Date.now(),cat:selCat,pct:Math.round(okCount/results.length*100),ok:okCount,miss:results.length-okCount,tot:results.length};
      if(deckId){
        const key=`mcq_history_${deckId}`;
        const stored=JSON.parse(localStorage.getItem(key)||"[]");
        localStorage.setItem(key,JSON.stringify([...stored,record].slice(-20)));
      }
      setHistory(h=>[...h,{...record,sess}]);
      setPhase("review");
    }
  },[idx,quizQs,results,sess,selCat,deckId]);
```

- [ ] **Step 3: Verify in browser**

Open `study-drill.html`. Import an MCQ deck. Complete a full quiz session.
Open DevTools → Application → Local Storage.
Confirm `mcq_history_<uuid>` appears with an array containing one record, e.g.:
```json
[{"ts":1712345678000,"cat":null,"pct":80,"ok":8,"miss":2,"tot":10}]
```
Reload the page. Confirm the deck is still loaded and the session counter starts from 1 (not 0) on the next quiz start.
Complete a second session. Confirm a second record appears in localStorage.

- [ ] **Step 4: Commit**
```bash
git add study-drill.html
git commit -m "feat: persist MCQ session records to localStorage per deck UUID"
```

---

## Task 3: Update clearDeck to remove history

**Files:**
- Modify: `study-drill.html` (~line 289 `clearDeck`)

- [ ] **Step 1: Replace `clearDeck` in `MCQQuiz`**

Replace the existing `clearDeck`:
```javascript
const clearDeck=useCallback(()=>{
    const id=localStorage.getItem("mcq_deck_id");
    localStorage.removeItem("mcq_deck");
    localStorage.removeItem("mcq_deck_id");
    if(id)localStorage.removeItem(`mcq_history_${id}`);
    setQuestions(SAMPLE_MCQ);setDeckName("No quiz loaded");setDeckId(null);setPhase("start");setSess(0);setSelCat(null);setHistory([]);
  },[]);
```

- [ ] **Step 2: Verify in browser**

Import a deck. Complete a session (confirm `mcq_history_<uuid>` appears in localStorage).
Click "✕ Clear".
Open DevTools → Application → Local Storage.
Confirm `mcq_deck`, `mcq_deck_id`, and `mcq_history_<uuid>` are all gone.
Confirm the app returns to the sample deck state.

- [ ] **Step 3: Commit**
```bash
git add study-drill.html
git commit -m "feat: clear deck removes UUID and history from localStorage"
```

---

## Task 4: HistoryPanel component

**Files:**
- Modify: `study-drill.html` (~line 70, after `SAMPLE_MCQ` declaration)

- [ ] **Step 1: Add `HistoryPanel` function and `hpS` style object after `SAMPLE_MCQ`**

Find:
```javascript
const SAMPLE_MCQ=[{id:1,...}];
```

Insert after it:
```javascript
function HistoryPanel({history,isSample}){
  if(isSample)return null;
  const recent=[...history].reverse().slice(0,5);
  const bySection={};
  history.forEach(h=>{
    const k=h.cat||"All";
    if(!bySection[k])bySection[k]={count:0,total:0};
    bySection[k].count++;bySection[k].total+=h.pct;
  });
  const sections=Object.entries(bySection)
    .map(([k,v])=>({cat:k,count:v.count,avg:Math.round(v.total/v.count)}))
    .sort((a,b)=>a.avg-b.avg);
  return(<div style={hpS.wrap}>
    <div style={hpS.title}>SESSION HISTORY</div>
    {!history.length
      ?<p style={hpS.empty}>No sessions recorded yet.</p>
      :<>
        <div style={hpS.sub}>RECENT</div>
        {recent.map((h,i)=><div key={i} style={hpS.row}>
          <span style={hpS.num}>#{h.sess}</span>
          <span style={hpS.pct}>{h.pct}%</span>
          <span style={hpS.detail}>{h.cat||"All"} · {h.ok} correct · {h.miss} wrong</span>
        </div>)}
        <div style={{...hpS.sub,marginTop:14}}>BY SECTION</div>
        {sections.map((s,i)=><div key={i} style={hpS.row}>
          <span style={hpS.cat}>{s.cat}</span>
          <span style={hpS.pct}>{s.avg}%</span>
          <span style={hpS.detail}>{s.count} session{s.count!==1?"s":""}</span>
        </div>)}
      </>}
  </div>);
}

const hpS={
  wrap:{width:"100%",maxWidth:560,background:"#0a0a12",border:"1px solid #151520",borderRadius:10,padding:"18px 20px",marginTop:20},
  title:{fontSize:10,fontWeight:700,letterSpacing:"0.16em",color:"#3b82f6",marginBottom:14,textTransform:"uppercase"},
  sub:{fontSize:10,fontWeight:700,letterSpacing:"0.12em",color:"#444",marginBottom:8,textTransform:"uppercase"},
  row:{display:"flex",alignItems:"center",gap:12,padding:"5px 0",borderBottom:"1px solid #0e0e16",fontSize:12},
  empty:{fontSize:12,color:"#444",textAlign:"center",padding:"8px 0"},
  num:{color:"#444",fontWeight:600,width:32,flexShrink:0},
  pct:{fontWeight:700,color:"#3b82f6",width:40,flexShrink:0},
  detail:{color:"#555",fontSize:11,flex:1},
  cat:{color:"#ccc",fontWeight:600,flex:1},
};
```

- [ ] **Step 2: Verify component exists (no wiring yet)**

Open `study-drill.html` in browser. Confirm no JS errors in DevTools console. The panel won't be visible yet — that's expected.

- [ ] **Step 3: Commit**
```bash
git add study-drill.html
git commit -m "feat: add HistoryPanel component for MCQ start screen"
```

---

## Task 5: Wire HistoryPanel + end-to-end verification

**Files:**
- Modify: `study-drill.html` (MCQ start screen JSX, ~line 369)

- [ ] **Step 1: Add `<HistoryPanel>` below the start button in MCQ start screen**

Find in the MCQ `phase==="start"` return block:
```javascript
<button style={ms.pri} onClick={()=>startQuiz()}>{selCat?`Exam: ${selCat}`:"Begin Exam"}</button>
```

Replace with:
```javascript
<button style={ms.pri} onClick={()=>startQuiz()}>{selCat?`Exam: ${selCat}`:"Begin Exam"}</button>
<HistoryPanel history={history} isSample={questions===SAMPLE_MCQ}/>
```

- [ ] **Step 2: End-to-end verification — no history**

Open `study-drill.html`. Go to Multiple Choice tab.
Without importing a deck (sample deck showing): confirm no history panel appears.
Import an MCQ deck: confirm the SESSION HISTORY panel appears with "No sessions recorded yet."

- [ ] **Step 3: End-to-end verification — after sessions**

Complete one full quiz session on the imported deck.
Go back to start (← Back button). Confirm the panel now shows:
- RECENT section with one row: `#<n>  <pct>%  <cat> · <ok> correct · <miss> wrong`
- BY SECTION section with one row for the category drilled

Complete two more sessions on different categories.
Confirm RECENT shows up to 3 rows (most recent first).
Confirm BY SECTION shows multiple rows sorted weakest-first (lowest avg % at top).

- [ ] **Step 4: End-to-end verification — persistence across reload**

After completing sessions, reload the page (F5).
Confirm the history panel still shows all previous sessions.
Confirm session numbering continues correctly on the next quiz (not reset to #1).

- [ ] **Step 5: End-to-end verification — clear**

Click "✕ Clear". Confirm history panel disappears (sample deck shown, panel hidden).

- [ ] **Step 6: Commit**
```bash
git add study-drill.html
git commit -m "feat: surface persistent MCQ history panel on start screen"
```

---

## Out of scope (follow-up)

- Flashcard history panel — identical pattern, separate session once MCQ is verified in use
- History for sessions completed before this feature shipped — not backfilled (no UUID exists for pre-existing decks until they are re-imported)
