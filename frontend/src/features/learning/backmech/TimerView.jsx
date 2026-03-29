import { useEffect, useMemo, useRef, useState } from "react";
import { flattenSchedule, formatDuration, totalSeconds } from "./engine";

export default function TimerView({ schedule, onBackToConfig }) {
  const phases = useMemo(() => flattenSchedule(schedule), [schedule]);
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState(phases[0]?.durationSeconds || 0);
  const [running, setRunning] = useState(true);
  const [beep, setBeep] = useState(true);
  const [voice, setVoice] = useState(true);
  const intervalRef = useRef(null);
  const spokenCountdownRef = useRef(new Set());
  const halfAnnouncedRef = useRef(false);

  const total = useMemo(() => totalSeconds(phases), [phases]);
  const elapsed = useMemo(() => {
    let sum = 0;
    for (let i = 0; i < index; i++) sum += phases[i]?.durationSeconds || 0;
    return sum + ((phases[index]?.durationSeconds || 0) - remaining);
  }, [index, remaining, phases]);

  useEffect(() => {
    setRemaining(phases[index]?.durationSeconds || 0);
    // New phase -> clear per-phase countdown spoken tracker
    spokenCountdownRef.current.clear();
  }, [index, phases]);

  useEffect(() => {
    if (!running) return;
    if (remaining <= 0) return;
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(intervalRef.current);
          handleNext();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [running, index, phases, remaining]);

  function speak(text) {
    if (!voice) return;
    try {
      const synth = window && window.speechSynthesis;
      if (!synth) return;
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1;
      u.pitch = 1;
      u.lang = "en-US";
      synth.speak(u);
    } catch (e) {
      // ignore
    }
  }

  function getExerciseByIndex(exIdx) {
    return Array.isArray(schedule?.exercises) && exIdx >= 0 ? schedule.exercises[exIdx] : null;
  }

  function getSetTotalReps(exIdx, setIdx) {
    const ex = getExerciseByIndex(exIdx);
    if (!ex) return 0;
    if (Array.isArray(ex.sets) && ex.sets[setIdx]) return Number(ex.sets[setIdx].reps) || 0;
    if (Array.isArray(ex.setReps) && ex.setReps[setIdx] != null) return Number(ex.setReps[setIdx]) || 0;
    if (Number.isFinite(ex.repsPerSet)) return Number(ex.repsPerSet) || 0;
    return 0;
  }

  function getTotalSets(exIdx) {
    const ex = getExerciseByIndex(exIdx);
    if (!ex) return 0;
    if (Array.isArray(ex.sets)) return ex.sets.length;
    if (Array.isArray(ex.setReps)) return ex.setReps.length;
    if (Number.isFinite(ex.setsCount)) return Number(ex.setsCount) || 0;
    return 0;
  }

  // Announce transitions
  // - At start of a hold: exercise name (if new exercise), sets left (if start of set), then "Start" and reps left
  // - Immediately after a hold ends (break begins): "Rest" and (if last set of exercise) "<exercise> is done"
  useEffect(() => {
    const cur = phases[index] || null;
    if (!cur) return;
    if (!running) return;
    const prev = index > 0 ? (phases[index - 1] || null) : null;
    if (cur.type === "break" && prev && prev.type === "hold") {
      speak("Rest");
      // If next hold belongs to a different exercise (or none), announce exercise done
      const nextHold = phases.slice(index + 1).find((p) => p && p.type === "hold");
      const prevEx = prev?.meta?.exerciseIndex;
      const nextEx = nextHold?.meta?.exerciseIndex;
      if (typeof prevEx === "number" && (nextHold == null || nextEx !== prevEx)) {
        const name = getExerciseByIndex(prevEx)?.name;
        if (name) speak(`${name} is done`);
      }
    }
    if (cur.type === "hold") {
      const curEx = typeof cur?.meta?.exerciseIndex === "number" ? cur.meta.exerciseIndex : undefined;
      const prevEx = index > 0 && phases[index - 1] ? phases[index - 1]?.meta?.exerciseIndex : undefined;
      if (curEx !== undefined && curEx !== prevEx) {
        const exName = schedule?.exercises?.[curEx]?.name;
        if (exName) speak(exName);
      }
      // Sets left (only at beginning of set)
      const setIdx = typeof cur?.meta?.setIndex === "number" ? cur.meta.setIndex : undefined;
      const repIdx = typeof cur?.meta?.repIndex === "number" ? cur.meta.repIndex : undefined;
      if (curEx !== undefined && setIdx !== undefined && repIdx === 0) {
        const totalSets = getTotalSets(curEx);
        const setsLeft = Math.max(0, totalSets - setIdx);
        if (setsLeft > 0) speak(`${setsLeft} ${setsLeft === 1 ? "set" : "sets"} left`);
      }
      // Start and reps left
      speak("Start");
      if (curEx !== undefined && setIdx !== undefined && repIdx !== undefined) {
        const totalReps = getSetTotalReps(curEx, setIdx);
        const repsLeft = Math.max(0, totalReps - repIdx);
        if (repsLeft > 0) speak(`${repsLeft} ${repsLeft === 1 ? "rep" : "reps"} left`);
      }
    }
  }, [index, phases, running, schedule]);

  // Countdown 3-2-1 at the end of any phase (holds and breaks)
  useEffect(() => {
    if (!running) return;
    const key = `${index}:${remaining}`;
    if (remaining <= 3 && remaining >= 1) {
      if (!spokenCountdownRef.current.has(key)) {
        spokenCountdownRef.current.add(key);
        speak(String(remaining));
      }
    }
  }, [remaining, running, index]);

  // Half-time announcement once per session
  useEffect(() => {
    if (!running) return;
    if (halfAnnouncedRef.current) return;
    if (total > 0 && elapsed >= total / 2) {
      halfAnnouncedRef.current = true;
      speak("Half time passed");
    }
  }, [elapsed, total, running]);

  function playBeep() {
    if (!beep) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
      o.start();
      o.stop(ctx.currentTime + 0.2);
    } catch (e) {
      // ignore
    }
  }

  function handleNext() {
    if (index < phases.length - 1) {
      setIndex((i) => i + 1);
      playBeep();
    } else {
      setRunning(false);
      playBeep();
      speak("Congrats, you finished all exercises");
    }
  }

  const current = phases[index] || null;
  const next = phases[index + 1] || null;
  const progress = total > 0 ? Math.min(1, Math.max(0, elapsed / total)) : 0;

  function handleEndSession() {
    try {
      if (window && window.speechSynthesis) window.speechSynthesis.cancel();
    } catch (e) {}
    onBackToConfig();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={handleEndSession} style={{ padding: "0.5rem 0.75rem" }}>End Session</button>
          <strong>{schedule?.name || "Unnamed schedule"}</strong>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => setRunning((v) => !v)} style={{ padding: "0.5rem 0.75rem" }}>{running ? "Pause" : "Resume"}</button>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} />
            Voice prompts
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={beep} onChange={(e) => setBeep(e.target.checked)} />
            Beep on phase change
          </label>
        </div>
      </div>

      <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 8 }}>
        <div style={{ fontSize: 14, color: "#666", marginBottom: 6 }}>Overall</div>
        <div style={{ height: 10, background: "#f2f2f2", borderRadius: 6, overflow: "hidden" }}>
          <div style={{ width: `${Math.round(progress * 100)}%`, height: "100%", background: "#4f46e5", transition: "width 0.3s" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontVariantNumeric: "tabular-nums", fontSize: 14, color: "#444" }}>
          <span>Elapsed {formatDuration(Math.floor(elapsed))}</span>
          <span>Total {formatDuration(total)}</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "stretch", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 260, padding: 16, border: "1px solid #eee", borderRadius: 8, background: "#fafafa" }}>
          <div style={{ fontSize: 13, color: "#666", marginBottom: 6 }}>Current</div>
          <div style={{ fontSize: 28, marginBottom: 8 }}>
            {current ? current.label : "Done"}
          </div>
          <div style={{ fontSize: 48, fontVariantNumeric: "tabular-nums", marginBottom: 8 }}>
            {formatDuration(remaining)}
          </div>
          {/* Auto-run: controls are intentionally minimal */}
        </div>
        <div style={{ flex: 1, minWidth: 260, padding: 16, border: "1px solid #eee", borderRadius: 8 }}>
          <div style={{ fontSize: 13, color: "#666", marginBottom: 6 }}>Up Next</div>
          <div style={{ fontSize: 18, marginBottom: 6 }}>
            {next ? next.label : "—"}
          </div>
          <div style={{ fontVariantNumeric: "tabular-nums" }}>
            {next ? formatDuration(next.durationSeconds) : ""}
          </div>
        </div>
      </div>

      <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 8 }}>
        <div style={{ fontSize: 13, color: "#666", marginBottom: 6 }}>All Phases</div>
        <ol style={{ paddingLeft: 18, margin: 0, lineHeight: 1.6 }}>
          {phases.map((p, i) => (
            <li key={i} style={{ color: i === index ? "#111" : "#555" }}>
              <span>{p.label}</span>
              <span style={{ marginLeft: 8, fontVariantNumeric: "tabular-nums", color: "#666" }}>{formatDuration(p.durationSeconds)}</span>
              {i === index && <span style={{ marginLeft: 8, color: "#4f46e5" }}>(current)</span>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}


