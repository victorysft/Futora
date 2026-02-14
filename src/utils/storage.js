const KEY = {
  goal: "futora_goal",
  streak: "futora_streak",
  lastCheckIn: "futora_lastCheckIn",
};

export function getGoal() {
  return localStorage.getItem(KEY.goal) || "";
}

export function setGoal(value) {
  localStorage.setItem(KEY.goal, value);
}

export function getStreak() {
  return parseInt(localStorage.getItem(KEY.streak) || "0", 10);
}

export function setStreak(value) {
  localStorage.setItem(KEY.streak, String(value));
}

export function getLastCheckIn() {
  return localStorage.getItem(KEY.lastCheckIn) || null;
}

export function setLastCheckIn(value) {
  if (value) {
    localStorage.setItem(KEY.lastCheckIn, value);
  } else {
    localStorage.removeItem(KEY.lastCheckIn);
  }
}

export function clearAll() {
  Object.values(KEY).forEach((k) => localStorage.removeItem(k));
}
