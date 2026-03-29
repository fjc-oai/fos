import { useState, useEffect } from "react";
import "./LearningApp.css";
import Review from "./Review";
import Quiz from "./Quiz";
import BackMechTimer from "./backmech/TimerPage";

const API = import.meta.env.VITE_API_URL || "/api";


function AddTopicForm({ topicName, setTopicName, submitting, onSubmit }) {
  return (
    <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
      <input
        type="text"
        value={topicName}
        onChange={(e) => setTopicName(e.target.value)}
        placeholder="New topic"
        required
        style={{ flex: 1, padding: 8, fontSize: 16 }}
      />
      <button type="submit" disabled={submitting}>{submitting ? "Adding..." : "Add"}</button>
    </form>
  );
}

function TopicList({ topics, loading }) {
  if (loading) return <p>Loading...</p>;
  if (!topics || topics.length === 0) return <p>No topics.</p>;
  return (
    <ul style={{ paddingLeft: 18 }}>
      {topics.map((t) => (
        <li key={t.id} style={{ marginBottom: 6 }}>
          <strong>{t.name}</strong>
        </li>
      ))}
    </ul>
  );
}

const LEARNING_PAGES = [
  { id: "home", label: "Dashboard" },
  { id: "wordBank", label: "Word Bank" },
  { id: "review", label: "Review" },
  { id: "quiz", label: "Quiz" },
  { id: "backMech", label: "Back Mechanic" },
];

const QUICK_SESSION_MINUTES = [15, 30, 45, 60];

function LearningApp() {
  const [page, setPage] = useState("home");
  const [sessions, setSessions] = useState([]);
  const [sessionStartMs, setSessionStartMs] = useState(null);
  const [sessionEndMs, setSessionEndMs] = useState(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [sessionWords, setSessionWords] = useState([]);
  const [quickDurMin, setQuickDurMin] = useState(30);
  const [quickDate, setQuickDate] = useState(localYmd());
  const [reviewing, setReviewing] = useState(false);

  // word form
  const [word, setWord] = useState("");
  const [examplesText, setExamplesText] = useState(""); // one example per line
  const [submittingWord, setSubmittingWord] = useState(false);

  // word bank
  const [wordBankWords, setWordBankWords] = useState([]);
  const [wordBankLoading, setWordBankLoading] = useState(false);
  const [wbFilterMode, setWbFilterMode] = useState("week"); // day | week | month | custom | all
  const [wbCustomStart, setWbCustomStart] = useState(""); // YYYY-MM-DD
  const [wbCustomEnd, setWbCustomEnd] = useState(""); // YYYY-MM-DD
  const [hoveredWordId, setHoveredWordId] = useState(null);

  // topics
  const [topics, setTopics] = useState([]);
  const [topicName, setTopicName] = useState("");
  const [submittingTopic, setSubmittingTopic] = useState(false);
  const [topicsLoading, setTopicsLoading] = useState(false);

  async function refreshSessions() {
    try {
      const [resA, resB] = await Promise.all([
        fetch(`${API}/sessions`),
        fetch(`${API}/review_sessions`),
      ]);
      const dataA = resA.ok ? await resA.json() : [];
      const dataB = resB.ok ? await resB.json() : [];
      setSessions([...(Array.isArray(dataA) ? dataA : []), ...(Array.isArray(dataB) ? dataB : [])]);
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    refreshSessions();
  }, []);

  useEffect(() => {
    refreshTopics();
  }, []);

  // ticking clock while session is running
  useEffect(() => {
    if (page === "session" && sessionStartMs && !sessionEnded) {
      const id = setInterval(() => setNowMs(Date.now()), 1000);
      return () => clearInterval(id);
    }
  }, [page, sessionStartMs, sessionEnded]);

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

  async function refreshTopics() {
    setTopicsLoading(true);
    try {
      const res = await fetch(`${API}/topics`);
      if (res.ok) {
        const data = await res.json();
        setTopics(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTopicsLoading(false);
    }
  }

  async function submitTopic(e) {
    e.preventDefault();
    const name = (topicName || "").trim();
    if (!name) {
      alert("Please enter a topic.");
      return;
    }
    setSubmittingTopic(true);
    try {
      const res = await fetch(`${API}/topics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setTopicName("");
        await refreshTopics();
      } else {
        const err = await res.json().catch(() => ({}));
        alert("Failed to add topic: " + JSON.stringify(err));
      }
    } catch (e) {
      alert("Failed to add topic: " + e.message);
    } finally {
      setSubmittingTopic(false);
    }
  }

  const elapsedMs = sessionStartMs ? ((sessionEndMs ?? nowMs) - sessionStartMs) : 0;

  function startSession() {
    setSessionStartMs(Date.now());
    setSessionEndMs(null);
    setSessionEnded(false);
    setSessionWords([]);
    setReviewing(false);
    setPage("session");
  }

  function goHome() {
    setPage("home");
    setSessionStartMs(null);
    setSessionEndMs(null);
    setSessionEnded(false);
    setSessionWords([]);
    setReviewing(false);
  }

  function renderSidebar() {
    return (
      <aside className="learning-sidebar">
        <div className="learning-brand-block">
          <h1>3000r</h1>
          <p>Sessions, review, quiz, topics, and back work in the same shell.</p>
        </div>

        <nav className="learning-nav">
          {LEARNING_PAGES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`learning-nav__item ${page === item.id ? "learning-nav__item--active" : ""}`}
              onClick={() => setPage(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <section className="learning-sidebar-card">
          <h3>Topics</h3>
          <AddTopicForm
            topicName={topicName}
            setTopicName={setTopicName}
            submitting={submittingTopic}
            onSubmit={submitTopic}
          />
          <TopicList topics={topics} loading={topicsLoading} />
        </section>
      </aside>
    );
  }

  function endSession() {
    if (!sessionStartMs) {
      goHome();
      return;
    }
    // Enter review mode; keep timer running until review is finished
    setReviewing(true);
  }

  async function saveSessionAfterReview() {
    if (!sessionStartMs) {
      goHome();
      return;
    }
    const elapsedMin = Math.max(1, Math.round((Date.now() - sessionStartMs) / 60000));
    const today = localYmd();
    try {
      const res = await fetch(`${API}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: today, duration: elapsedMin }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert("Failed to save session: " + JSON.stringify(err));
      }
    } catch (e) {
      alert("Failed to save session: " + e.message);
    } finally {
      setSessionEndMs(Date.now());
      setSessionEnded(true);
      setReviewing(false);
      await refreshSessions();
    }
  }

  async function quickLogSession(e) {
    e.preventDefault();
    const chosen = (quickDate && /^\d{4}-\d{2}-\d{2}$/.test(quickDate)) ? quickDate : localYmd();
    try {
      const dur = Math.max(1, Number(quickDurMin));
      const res = await fetch(`${API}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: chosen, duration: dur }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert("Failed to save session: " + JSON.stringify(err));
        return;
      }
      setQuickDurMin(30);
      await refreshSessions();
    } catch (e) {
      alert("Failed to save session: " + e.message);
    }
  }

  async function submitWord(e) {
    e.preventDefault();
    const examples = examplesText
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (!word.trim() || examples.length === 0) {
      alert("Please enter a word and at least one example.");
      return;
    }
    setSubmittingWord(true);
    try {
      const res = await fetch(`${API}/words`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: word.trim(), examples }),
      });
      if (res.ok) {
        const data = await res.json();
        setWord("");
        setExamplesText("");
        if (page === "session" && !sessionEnded && !reviewing && data && data.id) {
          setSessionWords((prev) => [{ id: data.id, word: data.word, date: data.date, examples: data.examples }, ...prev]);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        alert("Failed to add word: " + JSON.stringify(err));
      }
    } catch (e) {
      alert("Failed to add word: " + e.message);
    } finally {
      setSubmittingWord(false);
    }
  }

  // --- Word Bank helpers ---
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

  function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  // Aggregate total minutes per day for the last N days (including today), newest first
  function aggregateSessionsLastNDays(numDays) {
    const totalsByDate = new Map();
    for (const s of sessions) {
      const key = s.date;
      const dur = Number(s.duration) || 0;
      totalsByDate.set(key, (totalsByDate.get(key) || 0) + dur);
    }
    const result = [];
    for (let i = 0; i < numDays; i++) {
      const day = isoNDaysAgo(i);
      result.push({ date: day, minutes: totalsByDate.get(day) || 0 });
    }
    return result; // [today, yesterday, ...]
  }

  function aggregateSessionsCurrentWeek() {
    const totalsByDate = new Map();
    for (const s of sessions) {
      const key = s.date;
      const dur = Number(s.duration) || 0;
      totalsByDate.set(key, (totalsByDate.get(key) || 0) + dur);
    }

    const today = new Date();
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = addDays(today, mondayOffset);

    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(monday, index);
      const key = localYmd(date);
      return {
        date: key,
        day: date.toLocaleDateString(undefined, { weekday: "short" }),
        minutes: totalsByDate.get(key) || 0,
      };
    });
  }

  // --- Stats helpers ---
  function totalMinutesAll() {
    let sum = 0;
    for (const s of sessions) {
      sum += Number(s.duration) || 0;
    }
    return sum;
  }

  function averageMinutesLastNDays(numDays) {
    const days = aggregateSessionsLastNDays(numDays);
    const total = days.reduce((acc, d) => acc + (Number(d.minutes) || 0), 0);
    return Math.round(total / numDays);
  }

  function toHoursOneDecimal(totalMinutes) {
    const hours = totalMinutes / 60;
    return Math.round(hours * 10) / 10;
  }

  function lastNDaysMinutes(numDays) {
    return aggregateSessionsLastNDays(numDays).map((d) => Number(d.minutes) || 0);
  }

  function sparkline(values) {
    if (!values || values.length === 0) return "";
    // Use vertical bars for better readability across fonts
    const blocks = ["▏","▎","▍","▌","▋","▊","▉","█"];
    // show oldest → newest
    const vals = values.slice().reverse();
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    const range = Math.max(1, max - min);
    return vals
      .map((v) => {
        const idx = Math.floor(((v - min) / range) * (blocks.length - 1));
        return blocks[Math.min(blocks.length - 1, Math.max(0, idx))];
      })
      .join("");
  }

  function sumMinutes(values) {
    return (values || []).reduce((acc, v) => acc + (Number(v) || 0), 0);
  }

  const currentWeekSessions = aggregateSessionsCurrentWeek();
  const maxWeekMinutes = Math.max(60, ...currentWeekSessions.map((day) => day.minutes));

  function currentRangeFromMode(mode) {
    if (mode === "all") return { start: null, end: null };
    if (mode === "day") {
      const t = todayIso();
      return { start: t, end: t };
    }
    if (mode === "week") {
      // last 7 days including today
      return { start: isoNDaysAgo(6), end: todayIso() };
    }
    if (mode === "month") {
      // last 30 days including today
      return { start: isoNDaysAgo(29), end: todayIso() };
    }
    if (mode === "custom") {
      if (wbCustomStart && wbCustomEnd) return { start: wbCustomStart, end: wbCustomEnd };
      return { start: null, end: null };
    }
    return { start: null, end: null };
  }

  async function refreshWordBank() {
    const { start, end } = currentRangeFromMode(wbFilterMode);
    let url = `${API}/words`;
    const params = [];
    if (start) params.push(`start=${encodeURIComponent(start)}`);
    if (end) params.push(`end=${encodeURIComponent(end)}`);
    if (params.length > 0) url += `?${params.join("&")}`;
    setWordBankLoading(true);
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setWordBankWords(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setWordBankLoading(false);
    }
  }

  useEffect(() => {
    if (page === "wordBank") {
      if (wbFilterMode === "custom") {
        if (wbCustomStart && wbCustomEnd) {
          refreshWordBank();
        }
      } else {
        refreshWordBank();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, wbFilterMode]);

  useEffect(() => {
    if (page === "wordBank" && wbFilterMode === "custom" && wbCustomStart && wbCustomEnd) {
      refreshWordBank();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wbCustomStart, wbCustomEnd]);

  if (page === "home") {
    return (
      <div className="learning-shell">
        {renderSidebar()}
        <main className="learning-workspace">
          <section className="learning-hero">
            <div>
              <span className="learning-eyebrow">learning</span>
              <h2>Log magazine reading fast.</h2>
              <p>Quickly record an English reading session, then add words when you need them.</p>
            </div>
          </section>

          <section className="learning-panel learning-quick-session-panel">
            <div className="learning-panel-header">
              <div>
                <h3>Quick add session</h3>
              </div>
              <button type="button" onClick={startSession}>Live timer</button>
            </div>

            <form onSubmit={quickLogSession} className="learning-quick-session-form">
              <div className="learning-duration-picks" aria-label="Quick duration">
                {QUICK_SESSION_MINUTES.map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    className={`learning-duration-pick ${Number(quickDurMin) === minutes ? "learning-duration-pick--active" : ""}`}
                    onClick={() => setQuickDurMin(minutes)}
                  >
                    {minutes}m
                  </button>
                ))}
              </div>

              <div className="learning-quick-session-fields">
                <label className="learning-quick-session-field">
                  <span>Minutes</span>
                  <input
                    type="number"
                    value={quickDurMin}
                    onChange={(e) => setQuickDurMin(e.target.value)}
                    min={1}
                    max={1440}
                    required
                    placeholder="Minutes"
                  />
                </label>

                <label className="learning-quick-session-field">
                  <span>Date</span>
                  <input
                    type="date"
                    value={quickDate}
                    onChange={(e) => setQuickDate(e.target.value)}
                  />
                </label>

                <button type="submit" className="learning-log-session-button">
                  Log
                </button>
              </div>
            </form>

            <div className="learning-session-stats">
              <div className="learning-session-stats__summary">
                <span>Past week avg <strong>{averageMinutesLastNDays(7)}m</strong></span>
                <span>Past month avg <strong>{averageMinutesLastNDays(30)}m</strong></span>
                <span>Total <strong>{toHoursOneDecimal(totalMinutesAll())}h</strong></span>
              </div>

              <div className="learning-week-bars" aria-label="Current week hours">
                {currentWeekSessions.map((day) => (
                  <div key={day.date} className="learning-week-bar">
                    <div className="learning-week-bar__track">
                      <div
                        className="learning-week-bar__fill"
                        style={{ height: `${Math.max(8, (day.minutes / maxWeekMinutes) * 100)}%` }}
                      />
                    </div>
                    <span className="learning-week-bar__value">{toHoursOneDecimal(day.minutes)}h</span>
                    <span className="learning-week-bar__day">{day.day}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="learning-grid">
            <button type="button" className="learning-action-card" onClick={() => setPage("wordBank")}>Word Bank</button>
            <button type="button" className="learning-action-card" onClick={() => setPage("review")}>Review</button>
            <button type="button" className="learning-action-card" onClick={() => setPage("quiz")}>Quiz</button>
            <button type="button" className="learning-action-card learning-action-card--wide" onClick={() => setPage("backMech")}>Back Mechanic Timer</button>
          </section>

          <section className="learning-panel">
            <h3>Add word</h3>
            <form onSubmit={submitWord} className="learning-form">
              <input
                type="text"
                value={word}
                onChange={(e) => setWord(e.target.value)}
                placeholder="Word"
                required
              />
              <textarea
                value={examplesText}
                onChange={(e) => setExamplesText(e.target.value)}
                placeholder={"Examples (one per line)"}
                rows={4}
              />
              <button type="submit" disabled={submittingWord}>
                {submittingWord ? "Adding..." : "Add word"}
              </button>
            </form>
          </section>
        </main>
      </div>
    );
  }

  if (page === "review") {
    return <Review onBack={() => setPage("home")} />;
  }

  if (page === "quiz") {
    return <Quiz onBack={() => setPage("home")} />;
  }

  if (page === "backMech") {
    return <BackMechTimer onBack={() => setPage("home")} />;
  }

  if (page === "wordBank") {
    return (
      <div className="learning-shell">
        {renderSidebar()}
        <main className="learning-workspace">
        <section className="learning-panel">
        <div className="learning-panel-header">
          <h2>Word Bank</h2>
          <button type="button" onClick={() => setPage("home")}>Back</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 12 }}>
          <label>
            <select value={wbFilterMode} onChange={(e) => setWbFilterMode(e.target.value)} style={{ padding: 6 }}>
              <option value="day">Past day</option>
              <option value="week">Past week</option>
              <option value="month">Past month</option>
              <option value="custom">Custom range</option>
              <option value="all">All</option>
            </select>
          </label>
          {wbFilterMode === "custom" && (
            <>
              <input type="date" value={wbCustomStart} onChange={(e) => setWbCustomStart(e.target.value)} />
              <span>to</span>
              <input type="date" value={wbCustomEnd} onChange={(e) => setWbCustomEnd(e.target.value)} />
            </>
          )}
        </div>
        <div>
          {wordBankLoading ? (
            <p>Loading...</p>
          ) : wordBankWords.length === 0 ? (
            <p>No words.</p>
          ) : (
            <ul style={{ paddingLeft: 18 }}>
              {wordBankWords.map((w) => (
                <li
                  key={w.id}
                  onMouseEnter={() => setHoveredWordId(w.id)}
                  onMouseLeave={() => setHoveredWordId(null)}
                  style={{ marginBottom: 10 }}
                >
                  <strong>{w.word}</strong>
                  {hoveredWordId === w.id && w.examples && w.examples.length > 0 && (
                    <ul style={{ paddingLeft: 18, marginTop: 4 }}>
                      {w.examples.map((ex, idx) => (
                        <li key={idx} style={{ color: "#444" }}>{ex}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        </section>
        </main>
      </div>
    );
  }

  return (
    <div className="learning-shell">
      <aside className="learning-sidebar">
        <div className="learning-brand-block">
          <h1>3000r</h1>
          <p>Active session mode.</p>
        </div>
        {sessionEnded ? (
          <button disabled style={{ width: "100%", padding: "0.75rem", fontSize: 18, marginBottom: "1rem" }}>Session Ended</button>
        ) : reviewing ? (
          <button onClick={saveSessionAfterReview} style={{ width: "100%", padding: "0.75rem", fontSize: 18, marginBottom: "1rem" }}>Finish Review & Save</button>
        ) : (
          <button onClick={endSession} style={{ width: "100%", padding: "0.75rem", fontSize: 18, marginBottom: "1rem" }}>End Session</button>
        )}
        <button onClick={goHome} style={{ width: "100%", padding: "0.5rem", marginBottom: "1rem" }}>Back</button>
        <div style={{ color: "#666", fontSize: 14, marginBottom: 8 }}>
          Session started: {sessionStartMs ? new Date(sessionStartMs).toLocaleTimeString() : "-"}
        </div>
        {sessionStartMs && (
          <div style={{ color: "#222", fontSize: 18, fontVariantNumeric: "tabular-nums", marginBottom: 8 }}>
            Elapsed: {formatDurationMs(elapsedMs)}
          </div>
        )}
        <div style={{ marginTop: "1rem" }}>
          <h4 style={{ margin: "0 0 6px 0" }}>Learning Stats</h4>
          <ul style={{ paddingLeft: 18, marginTop: 4 }}>
            <li>
              Past week: {averageMinutesLastNDays(7)} m/d
              <ul style={{ paddingLeft: 18, marginTop: 4 }}>
                {aggregateSessionsLastNDays(7).map((d) => (
                  <li key={d.date} style={{ marginBottom: 6 }}>
                    <strong>{d.date}</strong> – {d.minutes} min
                  </li>
                ))}
              </ul>
            </li>
            <li>Past month: {averageMinutesLastNDays(30)} m/d</li>
            <li>Total: {toHoursOneDecimal(totalMinutesAll())} hr</li>
          </ul>
        </div>
      </aside>
      <main className="learning-workspace">
        <section className="learning-panel">
        {(reviewing || sessionEnded) ? (
          <div>
            <h2 style={{ marginTop: 0 }}>{reviewing && !sessionEnded ? "Review Words" : "Session Summary"}</h2>
            {sessionWords.length === 0 ? (
              <p>No words added this session.</p>
            ) : (
              <ul style={{ paddingLeft: 18 }}>
                {sessionWords.map((w) => (
                  <li key={w.id} style={{ marginBottom: 10 }}>
                    <strong>{w.word}</strong>
                    {w.examples && w.examples.length > 0 && (
                      <ul style={{ paddingLeft: 18, marginTop: 4 }}>
                        {w.examples.map((ex, idx) => (
                          <li key={idx} style={{ color: "#444" }}>{ex}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div>
            <h2 style={{ marginTop: 0 }}>Add New Word</h2>
            <form onSubmit={submitWord} style={{ maxWidth: 640 }}>
              <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                <input
                  type="text"
                  value={word}
                  onChange={(e) => setWord(e.target.value)}
                  placeholder="Word"
                  required
                  style={{ flex: 1, padding: 8, fontSize: 16 }}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <textarea
                  value={examplesText}
                  onChange={(e) => setExamplesText(e.target.value)}
                  placeholder={"Examples (one per line)"}
                  rows={8}
                  style={{ width: "100%", padding: 8, fontSize: 14 }}
                />
              </div>
              <button type="submit" disabled={submittingWord} style={{ padding: "0.6rem 1rem", fontSize: 16 }}>
                {submittingWord ? "Adding..." : "Add"}
              </button>
            </form>
          </div>
        )}
        </section>
      </main>
    </div>
  );
}

export default LearningApp;
