import { useMemo } from "react";
import { createId } from "./presets";
import { flattenSchedule, totalSeconds, formatDuration } from "./engine";

export default function ScheduleBuilder({ schedule, onChange, onSave }) {
  const phases = useMemo(() => flattenSchedule(schedule), [schedule]);
  const total = useMemo(() => totalSeconds(phases), [phases]);

  function update(partial) {
    onChange({ ...schedule, ...partial });
  }

  function updateExercise(idx, partial, options = {}) {
    const arr = schedule.exercises.slice();
    const next = { ...arr[idx], ...partial };
    if (options.removeSets) delete next.sets;
    arr[idx] = next;
    update({ exercises: arr });
  }

  function ensureLen(arr, len, fillVal) {
    const out = Array.isArray(arr) ? arr.slice(0, len) : [];
    while (out.length < len) out.push(fillVal);
    return out;
  }

  function deriveUniform(ex) {
    const setsCount = Number(ex?.setsCount) || (Array.isArray(ex?.sets) ? ex.sets.length : 1);
    const baseSet = Array.isArray(ex?.sets) && ex.sets.length > 0 ? ex.sets[0] : null;
    const repsPerSet = Number(ex?.repsPerSet) || Number(baseSet?.reps) || 1;
    const repHoldSeconds = Number(ex?.repHoldSeconds) || Number(baseSet?.holdSeconds) || 10;
    const breakBetweenRepsSeconds = Number(ex?.breakBetweenRepsSeconds) || Number(baseSet?.breakBetweenRepsSeconds) || 10;
    const breakBetweenSetsSeconds = Number(ex?.breakBetweenSetsSeconds) || 30;
    const setReps = ensureLen(ex?.setReps, setsCount, repsPerSet);
    const setBreakSeconds = ensureLen(ex?.setBreakSeconds, Math.max(0, setsCount - 1), breakBetweenSetsSeconds);
    return { setsCount, repsPerSet, repHoldSeconds, breakBetweenRepsSeconds, breakBetweenSetsSeconds, setReps, setBreakSeconds };
  }

  function addExercise() {
    const ex = { id: createId("ex"), name: "New Exercise", breakBetweenSetsSeconds: 30, setsCount: 2, repsPerSet: 5, repHoldSeconds: 10, breakBetweenRepsSeconds: 10, setReps: [5,5] };
    update({ exercises: [...schedule.exercises, ex] });
  }

  function removeExercise(idx) {
    const arr = schedule.exercises.slice();
    arr.splice(idx, 1);
    update({ exercises: arr });
  }

  // per-rep config is uniform across exercise; no per-set editing

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label>
          <span style={{ marginRight: 6 }}>Schedule name:</span>
          <input
            type="text"
            value={schedule.name || ""}
            onChange={(e) => update({ name: e.target.value })}
            placeholder="My Back Routine"
            style={{ padding: 6, minWidth: 240 }}
          />
        </label>
        <label>
          <span style={{ marginRight: 6 }}>Break between exercises (s):</span>
          <input
            type="number"
            min={0}
            value={schedule.breakBetweenExercisesSeconds}
            onChange={(e) => update({ breakBetweenExercisesSeconds: Math.max(0, Number(e.target.value) || 0) })}
            style={{ width: 100, padding: 6 }}
          />
        </label>
        {onSave && (
          <button onClick={() => onSave(schedule)} style={{ padding: "0.5rem 0.75rem" }}>Save</button>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "stretch", flexWrap: "wrap" }}>
        <div style={{ flex: 2, minWidth: 300, display: "flex", flexDirection: "column", gap: 12 }}>
          {schedule.exercises.map((ex, exIdx) => (
            <div key={ex.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="text"
                    value={ex.name}
                    onChange={(e) => updateExercise(exIdx, { name: e.target.value })}
                    placeholder={`Exercise ${exIdx + 1}`}
                    style={{ padding: 6, minWidth: 200 }}
                  />
                  <label>
                    <span style={{ marginRight: 6 }}>Break between sets (s):</span>
                    <input
                      type="number"
                      min={0}
                      value={Number(ex.breakBetweenSetsSeconds) || 0}
                      onChange={(e) => {
                        const val = Math.max(0, Number(e.target.value) || 0);
                        const u = deriveUniform(ex);
                        const nextSetBreaks = Array(Math.max(0, u.setsCount - 1)).fill(val);
                        updateExercise(exIdx, { breakBetweenSetsSeconds: val, setBreakSeconds: nextSetBreaks }, { removeSets: true });
                      }}
                      style={{ width: 120, padding: 6 }}
                    />
                  </label>
                  <label>
                    <span style={{ marginRight: 6 }}>Break after exercise (s):</span>
                    <input
                      type="number"
                      min={0}
                      value={Number(ex.breakAfterExerciseSeconds) || 0}
                      onChange={(e) => updateExercise(exIdx, { breakAfterExerciseSeconds: Math.max(0, Number(e.target.value) || 0) }, { removeSets: true })}
                      style={{ width: 160, padding: 6 }}
                    />
                  </label>
                </div>
                <button onClick={() => removeExercise(exIdx)} style={{ padding: "0.4rem 0.6rem" }}>Remove</button>
              </div>
              {(() => { const u = deriveUniform(ex); return (
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
                  <label>
                    <span style={{ marginRight: 6 }}>Sets:</span>
                    <input type="number" min={0} value={u.setsCount}
                      onChange={(e) => {
                        const nextCount = Math.max(0, Number(e.target.value) || 0);
                        const nextSetReps = ensureLen(ex?.setReps, nextCount, u.repsPerSet);
                        const nextSetBreaks = ensureLen(ex?.setBreakSeconds, Math.max(0, nextCount - 1), u.breakBetweenSetsSeconds);
                        updateExercise(exIdx, { setsCount: nextCount, setReps: nextSetReps, setBreakSeconds: nextSetBreaks }, { removeSets: true });
                      }}
                      style={{ width: 100, padding: 6 }} />
                  </label>
                  <label>
                    <span style={{ marginRight: 6 }}>Reps per set:</span>
                    <input type="number" min={0} value={u.repsPerSet}
                      onChange={(e) => {
                        const val = Math.max(0, Number(e.target.value) || 0);
                        const nextSetReps = Array(u.setsCount).fill(val);
                        updateExercise(exIdx, { repsPerSet: val, setReps: nextSetReps }, { removeSets: true });
                      }}
                      style={{ width: 120, padding: 6 }} />
                  </label>
                  <label>
                    <span style={{ marginRight: 6 }}>Hold per rep (s):</span>
                    <input type="number" min={0} value={u.repHoldSeconds}
                      onChange={(e) => updateExercise(exIdx, { repHoldSeconds: Math.max(0, Number(e.target.value) || 0) }, { removeSets: true })}
                      style={{ width: 140, padding: 6 }} />
                  </label>
                  <label>
                    <span style={{ marginRight: 6 }}>Break between reps (s):</span>
                    <input type="number" min={0} value={u.breakBetweenRepsSeconds}
                      onChange={(e) => updateExercise(exIdx, { breakBetweenRepsSeconds: Math.max(0, Number(e.target.value) || 0) }, { removeSets: true })}
                      style={{ width: 180, padding: 6 }} />
                  </label>
                </div>
              ); })()}
              {(() => { const u = deriveUniform(ex); return (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 13, color: "#666", marginBottom: 6 }}>Break after set (s)</div>
                  {u.setBreakSeconds.length === 0 ? (
                    <div style={{ color: "#666", fontSize: 13 }}>No inter-set breaks (only one set defined).</div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
                      {u.setBreakSeconds.map((val, i) => (
                        <label key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span>After set {i + 1}:</span>
                          <input type="number" min={0} value={val}
                            onChange={(e) => {
                              const v = Math.max(0, Number(e.target.value) || 0);
                              const arr = u.setBreakSeconds.slice();
                              arr[i] = v;
                              updateExercise(exIdx, { setBreakSeconds: arr }, { removeSets: true });
                            }}
                            style={{ width: 90, padding: 6 }} />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ); })()}
              {(() => { const u = deriveUniform(ex); return (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 13, color: "#666", marginBottom: 6 }}>Reps per set</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
                    {u.setReps.map((val, i) => (
                      <label key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span>Set {i + 1}:</span>
                        <input type="number" min={0} value={val}
                          onChange={(e) => {
                            const v = Math.max(0, Number(e.target.value) || 0);
                            const arr = u.setReps.slice();
                            arr[i] = v;
                            updateExercise(exIdx, { setReps: arr }, { removeSets: true });
                          }}
                          style={{ width: 80, padding: 6 }} />
                      </label>
                    ))}
                  </div>
                </div>
              ); })()}
            </div>
          ))}
          <button onClick={addExercise} style={{ padding: "0.5rem 0.75rem", alignSelf: "flex-start" }}>Add Exercise</button>
        </div>

        <div style={{ flex: 1, minWidth: 260, padding: 12, border: "1px solid #eee", borderRadius: 8 }}>
          <div style={{ fontSize: 13, color: "#666", marginBottom: 6 }}>Preview</div>
          <div style={{ marginBottom: 6, color: "#222" }}>
            Total time: <strong style={{ fontVariantNumeric: "tabular-nums" }}>{formatDuration(total)}</strong>
          </div>
          <ol style={{ paddingLeft: 18, margin: 0, lineHeight: 1.6 }}>
            {phases.map((p, i) => (
              <li key={i}>
                <span>{p.label}</span>
                <span style={{ marginLeft: 8, fontVariantNumeric: "tabular-nums", color: "#666" }}>{formatDuration(p.durationSeconds)}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}


