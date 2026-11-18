const formats = new Map();
function formatter(timeZone) {
  if (!formats.has(timeZone)) {
    formats.set(
      timeZone,
      new Intl.DateTimeFormat("en-GB", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }),
    );
  }
  return formats.get(timeZone);
}
function parts(instant, timeZone) {
  return Object.fromEntries(
    formatter(timeZone)
      .formatToParts(new Date(instant))
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, Number(value)]),
  );
}
function asUTC(value) {
  return Date.UTC(
    value.year,
    value.month - 1,
    value.day,
    value.hour,
    value.minute,
    value.second,
  );
}

/** Next local calendar occurrence. Skip nonexistent DST times; use first repeated time. */
export function nextOccurrence(runAt, timeZone, recurrence, after = Date.parse(runAt)) {
  if (!recurrence || recurrence === "none") return null;
  if (!["daily", "weekdays"].includes(recurrence))
    throw new Error("Unsupported recurrence");
  const previous = Date.parse(runAt);
  if (!Number.isFinite(previous)) throw new Error("Invalid occurrence date");
  const local = parts(previous, timeZone);
  const cutoff = Math.max(previous, after);
  if (!Number.isFinite(cutoff)) throw new Error('Invalid recurrence cutoff');
  const cutoffLocal = parts(cutoff, timeZone);
  const calendarDays = Math.floor((Date.UTC(cutoffLocal.year, cutoffLocal.month - 1, cutoffLocal.day)
    - Date.UTC(local.year, local.month - 1, local.day)) / 86_400_000);
  const firstDay = Math.max(1, calendarDays);
  for (let days = firstDay; days <= firstDay + 10; days++) {
    const calendar = new Date(
      Date.UTC(local.year, local.month - 1, local.day + days),
    );
    if (recurrence === "weekdays" && [0, 6].includes(calendar.getUTCDay()))
      continue;
    const target = {
      ...local,
      year: calendar.getUTCFullYear(),
      month: calendar.getUTCMonth() + 1,
      day: calendar.getUTCDate(),
    };
    const naive = asUTC(target);
    const offsets = new Set();
    // Sample both sides of timezone transitions without assuming whole-hour offsets.
    for (const hours of [-36, -24, -12, 0, 12, 24, 36]) {
      const sample = naive + hours * 3_600_000;
      offsets.add(asUTC(parts(sample, timeZone)) - sample);
    }
    const candidates = [...offsets]
      .map((offset) => naive - offset)
      .filter(
        (candidate) =>
          candidate > cutoff && asUTC(parts(candidate, timeZone)) === naive,
      )
      .sort((a, b) => a - b);
    if (candidates.length) return new Date(candidates[0]).toISOString();
  }
  throw new Error("Could not resolve the next local occurrence");
}
