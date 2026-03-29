// Timer engine: flatten hierarchical schedule into sequential phases

export function isPositiveNumber(n) {
  return typeof n === "number" && isFinite(n) && n > 0;
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// schedule shape:
// {
//   id, name, breakBetweenExercisesSeconds,
//   exercises: [
//     { id, name, breakBetweenSetsSeconds, sets: [ { id, reps, holdSeconds, breakBetweenRepsSeconds } ] }
//   ]
// }

export function flattenSchedule(schedule) {
  const phases = [];
  if (!schedule || !Array.isArray(schedule.exercises)) return phases;
  const scheduleBex = Number(schedule.breakBetweenExercisesSeconds) || 0;
  schedule.exercises.forEach((ex, exIdx) => {
    const bsets = Math.max(0, Number(ex?.breakBetweenSetsSeconds) || 0);
    // Support two shapes:
    // 1) Legacy: ex.sets: [{ reps, holdSeconds, breakBetweenRepsSeconds }]
    // 2) Simplified: ex.setsCount, ex.repsPerSet, ex.repHoldSeconds, ex.breakBetweenRepsSeconds, ex.setReps (array)
    let setsData = null;
    if (Array.isArray(ex?.sets) && ex.sets.length > 0) {
      setsData = ex.sets;
    } else {
      const setsCount = Math.max(0, Number(ex?.setsCount) || 0);
      const repsPerSet = Math.max(0, Number(ex?.repsPerSet) || 0);
      const repHold = Math.max(0, Number(ex?.repHoldSeconds) || 0);
      const breps = Math.max(0, Number(ex?.breakBetweenRepsSeconds) || 0);
      const setRepsArr = Array.isArray(ex?.setReps) && ex.setReps.length > 0
        ? ex.setReps.map((n) => Math.max(0, Number(n) || 0))
        : null;
      if (setRepsArr) {
        setsData = setRepsArr.map((reps) => ({ reps, holdSeconds: repHold, breakBetweenRepsSeconds: breps }));
      } else {
        setsData = Array.from({ length: setsCount }, () => ({
          reps: repsPerSet,
          holdSeconds: repHold,
          breakBetweenRepsSeconds: breps,
        }));
      }
    }

    setsData.forEach((set, setIdx) => {
      const reps = Math.max(0, Number(set?.reps) || 0);
      const hold = Math.max(0, Number(set?.holdSeconds) || 0);
      const breps = Math.max(0, Number(set?.breakBetweenRepsSeconds) || 0);
      for (let r = 1; r <= reps; r++) {
        if (isPositiveNumber(hold)) {
          phases.push({
            type: "hold",
            label: `${ex?.name || "Exercise"} – Set ${setIdx + 1} Rep ${r}`,
            durationSeconds: hold,
            meta: { exerciseIndex: exIdx, setIndex: setIdx, repIndex: r - 1 },
          });
        }
        if (r < reps && isPositiveNumber(breps)) {
          phases.push({
            type: "break",
            label: "Break between reps",
            durationSeconds: breps,
            meta: { exerciseIndex: exIdx, setIndex: setIdx },
          });
        }
      }
      if (setIdx < setsData.length - 1) {
        let bset = bsets;
        if (Array.isArray(ex?.setBreakSeconds) && ex.setBreakSeconds.length > 0) {
          const v = Number(ex.setBreakSeconds[setIdx]);
          if (isPositiveNumber(v) || v === 0) {
            bset = Math.max(0, v || 0);
          }
        }
        if (isPositiveNumber(bset)) {
          phases.push({ type: "break", label: "Break between sets", durationSeconds: bset, meta: { exerciseIndex: exIdx } });
        } else if (bset === 0) {
          // explicit 0 is allowed: skip adding a break
        } else if (isPositiveNumber(bsets)) {
          phases.push({ type: "break", label: "Break between sets", durationSeconds: bsets, meta: { exerciseIndex: exIdx } });
        }
      }
    });
    if (exIdx < schedule.exercises.length - 1) {
      const override = Number(ex?.breakAfterExerciseSeconds);
      const bex = isPositiveNumber(override) ? override : scheduleBex;
      if (isPositiveNumber(bex)) {
        phases.push({ type: "break", label: "Break between exercises", durationSeconds: bex, meta: {} });
      }
    }
  });
  return phases;
}

export function totalSeconds(phases) {
  return (phases || []).reduce((acc, p) => acc + (Number(p?.durationSeconds) || 0), 0);
}


