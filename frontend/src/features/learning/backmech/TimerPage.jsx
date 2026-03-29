import { useEffect, useMemo, useState } from "react";
import TimerView from "./TimerView";
import ScheduleBuilder from "./ScheduleBuilder";
import { PRESET_SCHEDULES, createId } from "./presets";
import { flattenSchedule, totalSeconds, formatDuration } from "./engine";
import { fetchServerSchedules, saveServerSchedule, updateServerSchedule } from "./storage";

function defaultCustomSchedule() {
  return {
    id: createId("sch"),
    name: "My Back Routine",
    breakBetweenExercisesSeconds: 30,
    exercises: [
      {
        id: createId("ex"),
        name: "Exercise 1",
        breakBetweenSetsSeconds: 20,
        sets: [ { id: createId("set"), reps: 3, holdSeconds: 10, breakBetweenRepsSeconds: 10 } ],
      },
    ],
  };
}

export default function TimerPage({ onBack }) {
  const [mode, setMode] = useState("preset"); // preset | custom
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [custom, setCustom] = useState(defaultCustomSchedule());
  const [runningSchedule, setRunningSchedule] = useState(null);
  const [editTarget, setEditTarget] = useState(null); // null | { type: 'server', id, name } | { type: 'builtin', id }

  const [serverPresets, setServerPresets] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchServerSchedules();
      if (!cancelled) setServerPresets(data);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedPresetId && serverPresets && serverPresets.length > 0) {
      setSelectedPresetId(`server:${serverPresets[0].id}`);
    }
  }, [serverPresets, selectedPresetId]);

  // Built-in presets removed; only server presets are used

  function start() {
    let schedule = null;
    if (mode === "preset") {
      if (selectedPresetId.startsWith("server:")) {
        const sid = Number(selectedPresetId.slice("server:".length));
        const s = serverPresets.find((x) => x.id === sid);
        if (s) schedule = { id: `server_${s.id}`, name: s.name, ...s.schedule };
      }
    } else {
      schedule = custom;
    }
    if (!schedule) return;
    setRunningSchedule(schedule);
  }

  function stop() {
    setRunningSchedule(null);
  }

  async function handleSaveCurrentCustom(sch) {
    try {
      const payload = { ...sch };
      const name = payload.name || "Custom Back Routine";
      if (editTarget && editTarget.type === "server") {
        const updated = await updateServerSchedule(editTarget.id, name, payload);
        setServerPresets((prev) => {
          const arr = prev.slice();
          const idx = arr.findIndex((s) => s.id === updated.id);
          if (idx >= 0) arr[idx] = { id: updated.id, name: updated.name, schedule: updated.schedule };
          else arr.unshift({ id: updated.id, name: updated.name, schedule: updated.schedule });
          return arr;
        });
        setMode("preset");
        setSelectedPresetId(`server:${editTarget.id}`);
        setEditTarget(null);
        alert("Updated.");
      } else {
        const saved = await saveServerSchedule(name, payload);
        setServerPresets((prev) => [{ id: saved.id, name: saved.name, schedule: saved.schedule }, ...prev]);
        // Switch to preset mode and select the newly saved one
        setMode("preset");
        setSelectedPresetId(`server:${saved.id}`);
        alert("Saved.");
      }
    } catch (e) {
      alert(e.message || "Failed to save.");
    }
  }

  if (runningSchedule) {
    return (
      <div style={{ minHeight: "100vh", fontFamily: "sans-serif", padding: "1rem", maxWidth: 1000, margin: "0 auto" }}>
        <TimerView schedule={runningSchedule} onBackToConfig={stop} />
      </div>
    );
  }

  function getSelectedPresetSchedule() {
    if (mode !== "preset") return null;
    if (!selectedPresetId) return null;
    if (selectedPresetId.startsWith("server:")) {
      const sid = Number(selectedPresetId.slice("server:".length));
      const s = serverPresets.find((x) => x.id === sid);
      if (!s) return null;
      return { id: `server_${s.id}`, name: s.name, ...s.schedule };
    }
    return null;
  }

  const selectedPresetSchedule = getSelectedPresetSchedule();
  const selectedPhases = selectedPresetSchedule ? flattenSchedule(selectedPresetSchedule) : [];
  const selectedTotal = selectedPresetSchedule ? totalSeconds(selectedPhases) : 0;

  return (
    <div style={{ minHeight: "100vh", fontFamily: "sans-serif", padding: "1rem", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <button onClick={onBack} style={{ padding: "0.5rem 0.75rem" }}>Back</button>
        <h2 style={{ margin: 0 }}>Back Mechanic Timer</h2>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="radio" name="mode" value="preset" checked={mode === "preset"} onChange={() => setMode("preset")} />
          Use preset
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="radio" name="mode" value="custom" checked={mode === "custom"} onChange={() => setMode("custom")} />
          Create new
        </label>
      </div>

      {mode === "preset" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 8, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <label>
              <span style={{ marginRight: 6 }}>Preset:</span>
              <select value={selectedPresetId} onChange={(e) => setSelectedPresetId(e.target.value)} style={{ padding: 6, minWidth: 260 }}>
                {serverPresets.map((s) => (
                  <option key={`server:${s.id}`} value={`server:${s.id}`}>{`Saved: ${s.name}`}</option>
                ))}
              </select>
            </label>
            <button onClick={start} style={{ padding: "0.6rem 1rem" }}>Start Timer</button>
            {selectedPresetId && selectedPresetId.startsWith("server:") && (
              <button
                onClick={() => {
                  const sid = Number(selectedPresetId.slice("server:".length));
                  const s = serverPresets.find((x) => x.id === sid);
                  if (!s) return;
                  setCustom({ name: s.name, ...s.schedule });
                  setEditTarget({ type: "server", id: sid, name: s.name });
                  setMode("custom");
                }}
                style={{ padding: "0.6rem 1rem" }}
              >
                Edit
              </button>
            )}
            
          </div>
          {selectedPresetSchedule && (
            <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <strong>{selectedPresetSchedule.name}</strong>
                <span style={{ fontVariantNumeric: "tabular-nums", color: "#444" }}>Total: {formatDuration(selectedTotal)}</span>
              </div>
              <ol style={{ paddingLeft: 18, margin: 0, lineHeight: 1.6 }}>
                {selectedPhases.map((p, i) => (
                  <li key={i}>
                    <span>{p.label}</span>
                    <span style={{ marginLeft: 8, fontVariantNumeric: "tabular-nums", color: "#666" }}>{formatDuration(p.durationSeconds)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <ScheduleBuilder schedule={custom} onChange={setCustom} onSave={handleSaveCurrentCustom} />
          <div>
            <button onClick={start} style={{ padding: "0.6rem 1rem" }}>Start Timer</button>
          </div>
        </div>
      )}
    </div>
  );
}


