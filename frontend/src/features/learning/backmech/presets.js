// Preset schedules for the Back Mechanic timer

export function createId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const PRESET_SCHEDULES = [];


