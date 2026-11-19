export function parseManilaDate(dateStr, referenceNow = Date.now()) {
  if (typeof dateStr !== "string") {
    return { valid: false, error: "Date must be a string." };
  }

  const trimmed = dateStr.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/);
  if (!match) {
    return { valid: false, error: "Invalid format. Use YYYY-MM-DD or YYYY-MM-DD HH:mm (Asia/Manila time)." };
  }

  const [, yStr, mStr, dStr, hStr, minStr] = match;
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const d = parseInt(dStr, 10);
  const h = hStr !== undefined ? parseInt(hStr, 10) : 23;
  const min = minStr !== undefined ? parseInt(minStr, 10) : 59;

  if (m < 1 || m > 12 || d < 1 || d > 31 || h < 0 || h > 23 || min < 0 || min > 59) {
    return { valid: false, error: "Invalid calendar numbers in date." };
  }

  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > daysInMonth) {
    return { valid: false, error: "Day exceeds total days in month." };
  }

  const utcMs = Date.UTC(y, m - 1, d, h - 8, min, 0);

  if (utcMs <= referenceNow) {
    return { valid: false, error: "Deadline must be in the future (Asia/Manila time)." };
  }

  return { valid: true, timestamp: Math.floor(utcMs / 1000) };
}

export function formatManilaDate(unixTimestamp) {
  const date = new Date(unixTimestamp * 1000);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  return formatter.format(date).replace(",", "");
}
