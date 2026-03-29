import { useEffect, useMemo, useState } from "react";

const API = import.meta.env.VITE_API_URL || "/api";

export default function Review({ onBack }) {
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [mode, setMode] = useState("random_all"); // random_all | reverse_chrono | yesterday | last_week | last_month
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth <= 768 : false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [exhausted, setExhausted] = useState(false);

  const [reviewStartMs, setReviewStartMs] = useState(null);
  const [reviewEndMs, setReviewEndMs] = useState(null);
  const [reviewEnded, setReviewEnded] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [reviewedCount, setReviewedCount] = useState(0);
  // Question prompt state:
  // - type: "word" | "sentence"
  // - text: string (for "word" mode)
  // - sentences: string[] (masked sentences for "sentence" mode)
  const [questionPrompt, setQuestionPrompt] = useState({ type: "word", text: "" });
  // Dictionary definitions (for hint/explanation)
  const [dictDefs, setDictDefs] = useState([]);
  const [dictLoading, setDictLoading] = useState(false);
  // Pause state
  const [reviewPaused, setReviewPaused] = useState(false);
  const [pauseStartedAt, setPauseStartedAt] = useState(null);
  const [pausedAccumMs, setPausedAccumMs] = useState(0);

  useEffect(() => {
    setReviewStartMs(Date.now());
  }, []);

  useEffect(() => {
    function onResize() {
      setIsMobile(window.innerWidth <= 768);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (reviewStartMs && !reviewEnded) {
      const id = setInterval(() => setNowMs(Date.now()), 1000);
      return () => clearInterval(id);
    }
  }, [reviewStartMs, reviewEnded]);

  function formatDurationMs(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function localYmd(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function todayIso() {
    return localYmd();
  }

  function isoNDaysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return localYmd(d);
  }

  function shuffleIndexes(n) {
    const arr = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function shouldShuffle(m) {
    return m === "random_all" || m === "yesterday" || m === "last_week" || m === "last_month";
  }

  async function fetchWordsForMode(m) {
    setLoading(true);
    try {
      let url = `${API}/words`;
      const params = [];
      if (m === "yesterday") {
        const y = isoNDaysAgo(1);
        params.push(`start=${encodeURIComponent(y)}`);
        params.push(`end=${encodeURIComponent(y)}`);
      } else if (m === "last_week") {
        params.push(`start=${encodeURIComponent(isoNDaysAgo(6))}`);
        params.push(`end=${encodeURIComponent(todayIso())}`);
      } else if (m === "last_month") {
        params.push(`start=${encodeURIComponent(isoNDaysAgo(29))}`);
        params.push(`end=${encodeURIComponent(todayIso())}`);
      }
      if (params.length > 0) url += `?${params.join("&")}`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setWords(data);
        if (shouldShuffle(m)) {
          const weights = data.map((w) => Math.max(0, 1 - computeFamiliarity(w)));
          const ord = weightedOrder(data.length, weights);
          setOrder(ord);
        } else {
          // reverse_chrono uses API's default order (newest first)
          setOrder(Array.from({ length: data.length }, (_, i) => i));
        }
        setCurrentIndex(0);
        setExhausted(false);
        setReviewedCount(0);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchWordsForMode(mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const currentPausedMs = reviewPaused && pauseStartedAt ? Math.max(0, nowMs - pauseStartedAt) : 0;
  const totalPausedMs = pausedAccumMs + currentPausedMs;
  const elapsedMs = reviewStartMs ? Math.max(0, ((reviewEndMs ?? nowMs) - reviewStartMs - totalPausedMs)) : 0;

  const currentWord = useMemo(() => {
    if (!order || order.length === 0) return null;
    const idx = order[currentIndex];
    return words[idx] || null;
  }, [order, currentIndex, words]);

  function computeFamiliarity(w) {
    const yes = Number(w?.yes_count ?? 0);
    const no = Number(w?.no_count ?? 1);
    const denom = yes + no;
    return denom > 0 ? yes / denom : 0;
  }

  function countWords(s) {
    if (!s || typeof s !== "string") return 0;
    const parts = s.trim().split(/\s+/);
    return parts.filter(Boolean).length;
  }

  function isSentenceText(s) {
    return countWords(s) > 5;
  }

  function escapeRegExp(str) {
    return (str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function buildWordForms(word) {
    if (!word || typeof word !== "string") return [];
    const w = word.toLowerCase();
    const forms = new Set([w]);
    // Basic plural/3rd person
    forms.add(w + "s");
    forms.add(w + "es");
    // Past and present participle
    if (w.endsWith("y") && w.length > 1 && !/[aeiou]/i.test(w[w.length - 2])) {
      // study -> studies, studied, studying
      forms.add(w.slice(0, -1) + "ies");
      forms.add(w.slice(0, -1) + "ied");
      forms.add(w.slice(0, -1) + "ying");
    } else if (w.endsWith("e")) {
      // live -> lived, living
      forms.add(w + "d");
      forms.add(w.slice(0, -1) + "ing");
    } else {
      forms.add(w + "ed");
      forms.add(w + "ing");
    }
    return Array.from(forms);
  }

  function maskWordInSentence(sentence, word) {
    if (!sentence || !word) return { text: sentence || "", found: false };
    const forms = buildWordForms(word).map((f) => escapeRegExp(f));
    const pattern = new RegExp(`\\b(?:${forms.join("|")})\\b`, "gi");
    let matched = false;
    const masked = sentence.replace(pattern, (m) => {
      matched = true;
      return "_".repeat(m.length);
    });
    // If not matched (e.g., example is an explanation), return original per requirement
    return { text: masked, found: matched };
  }

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
      // cap to avoid overly long hints
      return unique.slice(0, 5);
    } catch {
      return [];
    }
  }

  function weightedOrder(n, weights) {
    const idxs = Array.from({ length: n }, (_, i) => i);
    const w = weights.slice();
    const total = w.reduce((a, b) => a + (isFinite(b) ? b : 0), 0);
    if (!isFinite(total) || total <= 0) {
      return shuffleIndexes(n);
    }
    const result = [];
    while (idxs.length > 0) {
      let sum = 0;
      for (let k = 0; k < w.length; k++) sum += w[k] || 0;
      if (sum <= 0) {
        // fallback to any remaining order
        for (let k = 0; k < idxs.length; k++) result.push(idxs[k]);
        break;
      }
      let r = Math.random() * sum;
      let pick = 0;
      for (let k = 0; k < idxs.length; k++) {
        r -= w[idxs[k]] || 0;
        if (r <= 0) { pick = k; break; }
      }
      const chosenIdx = idxs.splice(pick, 1)[0];
      result.push(chosenIdx);
      w[chosenIdx] = 0;
    }
    return result;
  }

  function nextWord() {
    if (!order || order.length === 0) return;
    const next = currentIndex + 1;
    if (next >= order.length) {
      // Do not repeat within one review session
      setExhausted(true);
    } else {
      setCurrentIndex(next);
    }
    setShowHint(false);
  }

  function togglePause() {
    if (reviewEnded) return;
    if (!reviewPaused) {
      setReviewPaused(true);
      setPauseStartedAt(Date.now());
    } else {
      const now = Date.now();
      setReviewPaused(false);
      setPausedAccumMs((ms) => ms + Math.max(0, now - (pauseStartedAt || now)));
      setPauseStartedAt(null);
    }
  }

  // Decide prompt (word vs sentence) whenever the current word changes
  useEffect(() => {
    if (!currentWord) {
      setQuestionPrompt({ type: "word", text: "" });
      setDictDefs([]);
      return;
    }
    // reset hint when switching to a new word
    setShowHint(false);

    const examples = Array.isArray(currentWord.examples) ? currentWord.examples : [];
    const sentenceCandidates = examples.filter((ex) => isSentenceText(ex));
    const isPhraseWord = countWords(currentWord.word) > 1;
    const shouldUseSentence = !isPhraseWord && sentenceCandidates.length > 0 && Math.random() < 0.5;
    if (shouldUseSentence) {
      const maskedAll = sentenceCandidates.map((s) => {
        const { text } = maskWordInSentence(s, currentWord.word);
        return text || s;
      });
      setQuestionPrompt({ type: "sentence", sentences: maskedAll });
    } else {
      setQuestionPrompt({ type: "word", text: currentWord.word });
    }
  }, [currentWord]);

  // Fetch dictionary definitions (Free Dictionary API)
  useEffect(() => {
    const w = currentWord?.word;
    if (!w) {
      setDictDefs([]);
      return;
    }
    let aborted = false;
    async function load() {
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
    load();
    return () => { aborted = true; };
  }, [currentWord?.word]);

  async function submitOutcome(outcome) {
    const w = currentWord;
    if (!w) return;
    try {
      const res = await fetch(`${API}/word_stats/${w.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome }),
      });
      if (res.ok) {
        const data = await res.json();
        // update local counts
        setWords((prev) => prev.map((it) => (it.id === w.id ? { ...it, yes_count: data.yes_count, no_count: data.no_count } : it)));
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    } finally {
      // count this review in the current session
      setReviewedCount((c) => c + 1);
      nextWord();
    }
  }

  async function endReview() {
    const end = Date.now();
    setReviewEndMs(end);
    setReviewEnded(true);
    if (!reviewStartMs) return;
    const pausedSoFar = pausedAccumMs + (reviewPaused && pauseStartedAt ? Math.max(0, end - pauseStartedAt) : 0);
    const effectiveElapsedMs = Math.max(0, end - reviewStartMs - pausedSoFar);
    const elapsedMin = Math.max(1, Math.round(effectiveElapsedMs / 60000));
    const today = localYmd();
    try {
      const res = await fetch(`${API}/review_sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: today, duration: elapsedMin }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        // non-blocking alert
        // eslint-disable-next-line no-alert
        alert("Failed to save review: " + JSON.stringify(err));
      }
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert("Failed to save review: " + e.message);
    }
  }

  const containerStyle = { minHeight: "100vh", display: "flex", flexDirection: isMobile ? "column" : "row", fontFamily: "sans-serif" };
  const sidebarStyle = { width: isMobile ? "100%" : 320, borderRight: isMobile ? "none" : "1px solid #eee", borderBottom: isMobile ? "1px solid #eee" : "none", padding: isMobile ? "0.75rem 1rem" : "1rem", position: isMobile ? "sticky" : "static", top: 0, background: isMobile ? "#fff" : undefined, zIndex: 1 };
  const contentStyle = { flex: 1, padding: isMobile ? "1rem" : "1.5rem" };
  const primaryBtnStyle = { width: isMobile ? "auto" : "100%", padding: isMobile ? "0.5rem 0.75rem" : "0.75rem", fontSize: isMobile ? 16 : 18, marginBottom: isMobile ? 0 : "1rem" };
  const secondaryBtnStyle = { width: isMobile ? "auto" : "100%", padding: isMobile ? "0.5rem 0.75rem" : "0.5rem", marginBottom: isMobile ? 0 : "1rem" };

  return (
    <div style={containerStyle}>
      {sidebarOpen && (
        <div style={sidebarStyle}>
        {isMobile ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", marginBottom: 6 }}>
            <button onClick={endReview} disabled={reviewEnded} style={primaryBtnStyle}>{reviewEnded ? "Session Ended" : "End Session"}</button>
            <button onClick={togglePause} disabled={reviewEnded} style={secondaryBtnStyle}>{reviewPaused ? "Resume" : "Pause"}</button>
            <button onClick={onBack} style={secondaryBtnStyle}>Back</button>
          </div>
        ) : (
          <>
            <button onClick={endReview} disabled={reviewEnded} style={primaryBtnStyle}>{reviewEnded ? "Session Ended" : "End Session"}</button>
            <button onClick={togglePause} disabled={reviewEnded} style={secondaryBtnStyle}>{reviewPaused ? "Resume" : "Pause"}</button>
            <button onClick={onBack} style={secondaryBtnStyle}>Back</button>
          </>
        )}
        <div style={{ color: "#666", fontSize: isMobile ? 12 : 14, marginBottom: 6 }}>
          Review started: {reviewStartMs ? new Date(reviewStartMs).toLocaleTimeString() : "-"}
        </div>
        {reviewStartMs && (
          <div style={{ color: "#222", fontSize: isMobile ? 16 : 18, fontVariantNumeric: "tabular-nums", marginBottom: isMobile ? 4 : 8 }}>
            Elapsed: {formatDurationMs(elapsedMs)}
          </div>
        )}
        </div>
      )}
      <div style={contentStyle}>
        <h2 style={{ marginTop: 0 }}>Word Review</h2>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <label>
            <select value={mode} onChange={(e) => setMode(e.target.value)} style={{ padding: 6 }}>
              <option value="random_all">Random</option>
              <option value="reverse_chrono">Reverse chronological</option>
              <option value="yesterday">Yesterday</option>
              <option value="last_week">Last week</option>
              <option value="last_month">Last month</option>
            </select>
          </label>
          <button onClick={() => setSidebarOpen((v) => !v)} style={{ padding: isMobile ? "0.5rem 0.75rem" : "0.5rem 1rem" }}>
            {sidebarOpen ? "Hide Panel" : "Show Panel"}
          </button>
          <span style={{ fontSize: isMobile ? 18 : 20, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            {reviewedCount}/{words.length}
          </span>
        </div>
        {loading ? (
          <p>Loading...</p>
        ) : exhausted ? (
          <div>
            <p>All done for this review set. Change mode or end the session.</p>
          </div>
        ) : !currentWord ? (
          <p>No words available.</p>
        ) : (
          <div>
            <div style={{ fontSize: questionPrompt.type === "sentence" ? (isMobile ? 20 : 24) : (isMobile ? 32 : 36), marginBottom: 16, textAlign: "center" }}>
              {questionPrompt.type === "sentence" ? (
                <>
                  <ul style={{ listStyle: "disc", textAlign: "left", display: "inline-block", paddingLeft: 18, margin: 0, lineHeight: 1.5 }}>
                    {(questionPrompt.sentences || []).map((s, idx) => (
                      <li key={idx} style={{ color: "#222" }}>{s}</li>
                    ))}
                  </ul>
                  <div style={{ marginTop: 10, color: "#333", fontSize: isMobile ? 14 : 16 }}>
                    <span style={{ fontWeight: 600 }}>Meaning:</span>{" "}
                    {dictLoading ? "Loading…" : (dictDefs && dictDefs.length > 0 ? dictDefs[0] : "—")}
                  </div>
                </>
              ) : (
                <strong>{currentWord.word}</strong>
              )}
            </div>
            {showHint && (
              <div style={{ marginBottom: 16 }}>
                {currentWord.examples && currentWord.examples.length > 0 && (
                  <ul style={{ paddingLeft: 18, marginTop: 4, marginBottom: 8, lineHeight: 1.5 }}>
                    {currentWord.examples.map((ex, idx) => (
                      <li key={idx} style={{ color: "#444" }}>{ex}</li>
                    ))}
                  </ul>
                )}
                {/* Definitions are shown above in sentence mode; no need to repeat in Hint */}
              </div>
            )}
            <div style={{ display: "flex", gap: 12, justifyContent: isMobile ? "center" : "flex-start", flexWrap: "wrap" }}>
              <button onClick={() => setShowHint(true)} disabled={reviewEnded || exhausted || reviewPaused} style={{ padding: isMobile ? "0.5rem 0.75rem" : "0.5rem 1rem" }}>Hint</button>
              <button onClick={() => submitOutcome("yes")} disabled={reviewEnded || exhausted || reviewPaused} style={{ padding: isMobile ? "0.5rem 0.75rem" : "0.5rem 1rem" }}>Yes</button>
              <button onClick={() => submitOutcome("no")} disabled={reviewEnded || exhausted || reviewPaused} style={{ padding: isMobile ? "0.5rem 0.75rem" : "0.5rem 1rem" }}>No</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


