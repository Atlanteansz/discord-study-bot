export function getDateAutocompleteChoices(currentValue = "", referenceNow = Date.now()) {
  const choices = [];
  const labelFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    weekday: "short",
    month: "short",
    day: "numeric"
  });
  const valueFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  for (let i = 0; i < 25; i++) {
    const targetDate = new Date(referenceNow + i * 86400000);
    const label = labelFormatter.format(targetDate);
    const value = valueFormatter.format(targetDate);
    choices.push({ name: label, value });
  }

  const query = (currentValue || "").toLowerCase().trim();
  if (!query) {
    return choices.slice(0, 25);
  }

  return choices
    .filter((c) => c.name.toLowerCase().includes(query) || c.value.includes(query))
    .slice(0, 25);
}

export function parseManilaDateTime({ dateStr, hour, minute, period }, referenceNow = Date.now()) {
  if (typeof dateStr !== "string") {
    return { valid: false, error: "Date is required. Use YYYY-MM-DD (e.g. 2026-11-25) or pick from autocomplete." };
  }

  const trimmedDate = dateStr.trim();
  const dateMatch = trimmedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) {
    return { valid: false, error: `Invalid date format: "${trimmedDate}". Use YYYY-MM-DD (e.g. 2026-11-25) or pick from autocomplete.` };
  }

  const [, yStr, mStr, dStr] = dateMatch;
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const d = parseInt(dStr, 10);

  if (m < 1 || m > 12 || d < 1 || d > 31) {
    return { valid: false, error: `Invalid calendar date numbers: "${trimmedDate}".` };
  }

  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > daysInMonth) {
    return { valid: false, error: `Day ${d} exceeds the ${daysInMonth} days in month ${m}.` };
  }

  const numHour = Number(hour);
  if (!Number.isInteger(numHour) || numHour < 1 || numHour > 12) {
    return { valid: false, error: "Hour must be between 1 and 12." };
  }

  const numMinute = Number(minute);
  if (!Number.isInteger(numMinute) || numMinute < 0 || numMinute > 59) {
    return { valid: false, error: "Minute must be between 0 and 59." };
  }

  if (typeof period !== "string") {
    return { valid: false, error: "Period must be AM or PM." };
  }

  const upperPeriod = period.trim().toUpperCase();
  if (upperPeriod !== "AM" && upperPeriod !== "PM") {
    return { valid: false, error: "Period must be AM or PM." };
  }

  let h24;
  if (upperPeriod === "AM") {
    h24 = numHour === 12 ? 0 : numHour;
  } else {
    h24 = numHour === 12 ? 12 : numHour + 12;
  }

  const utcMs = Date.UTC(y, m - 1, d, h24 - 8, numMinute, 0);

  if (utcMs <= referenceNow) {
    return { valid: false, error: "Deadline must be set in the future (Asia/Manila time)." };
  }

  return { valid: true, timestamp: Math.floor(utcMs / 1000) };
}

export function formatManila12Hour(unixTimestamp) {
  const date = new Date(unixTimestamp * 1000);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
  return formatter.format(date) + " (Asia/Manila)";
}
