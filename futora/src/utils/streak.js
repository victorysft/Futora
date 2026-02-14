function toDateParts(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(a, b) {
  return Math.round((toDateParts(b) - toDateParts(a)) / 86_400_000);
}

export function getToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function canCheckIn(lastCheckInDate) {
  if (!lastCheckInDate) return true;
  return lastCheckInDate !== getToday();
}

export function shouldResetStreak(lastCheckInDate) {
  if (!lastCheckInDate) return true;
  return daysBetween(lastCheckInDate, getToday()) > 1;
}

export function calculateNewStreak(currentStreak, lastCheckInDate) {
  if (shouldResetStreak(lastCheckInDate)) return 1;
  return currentStreak + 1;
}

export function formatDate(dateStr) {
  if (!dateStr) return "—";
  return toDateParts(dateStr).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
