const KEY = "backmech_schedules_v1";
const API = import.meta.env.VITE_API_URL || "/api";

export function loadCustomSchedules() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

export function saveCustomSchedule(schedule) {
  const all = loadCustomSchedules();
  const idx = all.findIndex((s) => s && s.id === schedule.id);
  if (idx >= 0) {
    all[idx] = schedule;
  } else {
    all.push(schedule);
  }
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function deleteCustomSchedule(id) {
  const all = loadCustomSchedules().filter((s) => s && s.id !== id);
  localStorage.setItem(KEY, JSON.stringify(all));
}

export async function fetchServerSchedules() {
  try {
    const res = await fetch(`${API}/back_schedules`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data; // [{id, name, schedule}]
  } catch (e) {
    return [];
  }
}

export async function saveServerSchedule(name, schedule) {
  const res = await fetch(`${API}/back_schedules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, schedule })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error("Failed to save schedule: " + JSON.stringify(err));
  }
  return await res.json(); // {id, name, schedule}
}

export async function updateServerSchedule(id, name, schedule) {
  const res = await fetch(`${API}/back_schedules/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, schedule })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error("Failed to update schedule: " + JSON.stringify(err));
  }
  return await res.json(); // {id, name, schedule}
}


