import { useEffect, useMemo, useState } from "react";
import commonWords from "./data/common-words.json";

const API = import.meta.env.VITE_API_URL || "/api";

export default function Quiz({ onBack }) {
  const [mode, setMode] = useState("bank"); // bank | dict
  const [items, setItems] = useState([]); // [{ id?, word, examples? }]
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [dictDefs, setDictDefs] = useState([]);
  const [dictLoading, setDictLoading] = useState(false);
  const [questionCount, setQuestionCount] = useState(10);

  const totalQuestions = items.length;
  const currentItem = useMemo(() => {
    if (!items || items.length === 0) return null;
    return items[currentIndex] || null;
  }, [items, currentIndex]);

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function sampleN(arr, n) {
    if (!Array.isArray(arr) || arr.length === 0) return [];
    const sh = shuffle(arr);
    return sh.slice(0, Math.min(n, sh.length));
  }

  async function startQuiz() {
    setStarted(false);
    setFinished(false);
    setScore(0);
    setCurrentIndex(0);
    setShowHint(false);
    setDictDefs([]);
    setLoading(true);
    try {
      if (mode === "bank") {
        const res = await fetch(`${API}/words`);
        if (res.ok) {
          const data = await res.json();
          const picked = sampleN(data, Math.max(1, Number(questionCount) || 10));
          setItems(picked);
        } else {
          setItems([]);
        }
      } else {
        const cnt = Math.max(1, Number(questionCount) || 10);
        const res = await fetch(`${API}/common_words?count=${encodeURIComponent(cnt)}`);
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : [];
          const words = list.map((w) => ({ word: String(w) }));
          if (words.length < cnt) {
            const fallback = sampleN(Array.isArray(commonWords) ? commonWords : [], cnt - words.length).map((w) => ({ word: w }));
            setItems([...words, ...fallback]);
          } else {
            setItems(words);
          }
        } else {
          const picked = sampleN(Array.isArray(commonWords) ? commonWords : [], cnt).map((w) => ({ word: w }));
          setItems(picked);
        }
      }
      setStarted(true);
      setFinished(false);
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert("Failed to start quiz: " + e.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function submitAnswer(correct) {
    const it = currentItem;
    if (!it) return;
    try {
      if (mode === "bank" && it.id != null) {
        const outcome = correct ? "yes" : "no";
        await fetch(`${API}/word_stats/${it.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ outcome }),
        }).catch(() => {});
      }
    } finally {
      if (correct) setScore((s) => s + 1);
      gotoNext();
    }
  }

  function gotoNext() {
    setShowHint(false);
    setDictDefs([]);
    if (currentIndex + 1 >= totalQuestions) {
      setFinished(true);
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }

  useEffect(() => {
    let aborted = false;
    async function loadDefs() {
      const w = currentItem?.word;
      if (!w || !showHint) {
        setDictDefs([]);
        return;
      }
      try {
        setDictLoading(true);
        const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`);
        if (!res.ok) {
          setDictDefs([]);
          return;
        }
        const data = await res.json();
        if (aborted) return;
        setDictDefs(extractDefinitionsFromApi(data));
      } catch {
        if (!aborted) setDictDefs([]);
      } finally {
        if (!aborted) setDictLoading(false);
      }
    }
    loadDefs();
    return () => { aborted = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHint, currentItem?.word]);

  function extractDefinitionsFromApi(data) {
    try {
      if (!Array.isArray(data)) return [];
      const defs = [];
      for (const entry of data) {
        const meanings = Array.isArray(entry?.meanings) ? entry.meanings : [];
        for (const meaning of meanings) {
          const ds = Array.isArray(meaning?.definitions) ? meaning.definitions : [];
          for (const d of ds) {
            const defText = (d?.definition || "").trim();
            if (defText) defs.push(defText);
          }
        }
      }
      // de-duplicate while preserving order
      const seen = new Set();
      const unique = [];
      for (const d of defs) {
        if (!seen.has(d)) {
          seen.add(d);
          unique.push(d);
        }
      }
      return unique.slice(0, 5);
    } catch {
      return [];
    }
  }

  const containerStyle = { minHeight: "100vh", padding: "1.25rem", fontFamily: "sans-serif", maxWidth: 900, margin: "0 auto" };
  const controlsStyle = { display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" };
  const questionStyle = { fontSize: 36, textAlign: "center", margin: "1rem 0" };

  return (
    <div style={containerStyle}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
        <button onClick={onBack} style={{ padding: "0.5rem 0.75rem" }}>Back</button>
        <h2 style={{ margin: 0 }}>Quiz</h2>
      </div>
      <div style={controlsStyle}>
        <label>
          <select value={mode} onChange={(e) => setMode(e.target.value)} disabled={started && !finished} style={{ padding: 6 }}>
            <option value="bank">Word Bank (random 10)</option>
            <option value="dict">Dictionary (random 10)</option>
          </select>
        </label>
        <label>
          <span style={{ marginRight: 6 }}>Count:</span>
          <input
            type="number"
            min={1}
            max={50}
            value={questionCount}
            onChange={(e) => setQuestionCount(Number(e.target.value))}
            disabled={started && !finished}
            style={{ width: 80, padding: 6 }}
          />
        </label>
        <button onClick={startQuiz} disabled={loading} style={{ padding: "0.5rem 1rem" }}>
          {started ? "Restart" : "Start"}
        </button>
        <span style={{ fontSize: 18, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          {started ? `${Math.min(currentIndex + 1, totalQuestions)}/${totalQuestions}` : "0/0"}
        </span>
        {started && !finished && (
          <span style={{ fontSize: 18, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            Score: {score}
          </span>
        )}
      </div>

      {!started ? (
        <p>Pick a mode and click Start to begin a 10-question quiz.</p>
      ) : finished ? (
        <div style={{ textAlign: "center", marginTop: 24 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>Final Score</div>
          <div style={{ fontSize: 40, fontWeight: 700 }}>{score} / {totalQuestions}</div>
          <div style={{ marginTop: 16 }}>
            <button onClick={startQuiz} style={{ padding: "0.5rem 1rem" }}>Retake</button>
          </div>
        </div>
      ) : loading ? (
        <p>Loading...</p>
      ) : !currentItem ? (
        <p>No items available.</p>
      ) : (
        <div>
          <div style={questionStyle}>
            <strong>{currentItem.word}</strong>
          </div>
          {showHint && (
            <div style={{ marginBottom: 12 }}>
              {mode === "bank" ? (
                <>
                  {(currentItem.examples || []).length > 0 ? (
                    <ul style={{ paddingLeft: 18, lineHeight: 1.5 }}>
                      {currentItem.examples.map((ex, idx) => (
                        <li key={idx} style={{ color: "#444" }}>{ex}</li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ color: "#666" }}>No examples available.</div>
                  )}
                </>
              ) : (
                <div style={{ color: "#333" }}>
                  <div style={{ marginBottom: 6, fontWeight: 600 }}>Meaning:</div>
                  {dictLoading ? "Loading…" : (dictDefs && dictDefs.length > 0 ? (
                    <ul style={{ paddingLeft: 18, lineHeight: 1.5 }}>
                      {dictDefs.map((d, i) => <li key={i}>{d}</li>)}
                    </ul>
                  ) : "—")}
                </div>
              )}
            </div>
          )}
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => setShowHint(true)} style={{ padding: "0.5rem 1rem" }}>Hint</button>
            <button onClick={() => submitAnswer(true)} style={{ padding: "0.5rem 1rem" }}>Yes</button>
            <button onClick={() => submitAnswer(false)} style={{ padding: "0.5rem 1rem" }}>No</button>
          </div>
        </div>
      )}
    </div>
  );
}


