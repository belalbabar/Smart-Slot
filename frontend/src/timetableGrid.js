function hourValue(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const match = /^(\d{1,2}):\d{2}/.exec(String(value));
  return match ? Number(match[1]) : Number.NaN;
}

export function buildTimetableGrid(entries, settings, shownDays) {
  const dayStart = Number(settings.day_start);
  const dayEnd = Number(settings.day_end);
  const lunchStart = Number(settings.lunch_start);
  const lunchEnd = Number(settings.lunch_end);
  const lunchDuration = lunchEnd - lunchStart;
  const workingDays = new Set(settings.days.map((day) => String(day).trim().toLowerCase()));
  const isLunch = (hour) => hour >= lunchStart && hour < lunchEnd;
  const isVisible = (entry) => {
    const day = String(entry.day).trim().toLowerCase();
    const start = hourValue(entry.start);
    const end = hourValue(entry.end);
    return workingDays.has(day)
      && start >= dayStart && start < dayEnd && !isLunch(start)
      && end > start && end <= dayEnd
      && !(start < lunchEnd && end > lunchStart);
  };
  const visibleEntries = entries.filter(isVisible);
  const headers = [];

  for (let hour = dayStart; hour < dayEnd;) {
    if (isLunch(hour)) {
      if (hour === lunchStart) {
        headers.push({
          column: hour - dayStart + 2,
          span: lunchDuration,
          start: lunchStart,
          end: lunchEnd,
        });
      }
      hour++;
      continue;
    }
    headers.push({
      column: hour - dayStart + 2,
      span: 1,
      label: hour,
    });
    hour++;
  }

  const rows = shownDays.map((day) => {
    if (!workingDays.has(day.toLowerCase())) {
      return { day, off: true, cells: [] };
    }

    const entriesByStart = new Map(
      visibleEntries
        .filter((entry) => String(entry.day).trim().toLowerCase() === day.toLowerCase())
        .map((entry) => [hourValue(entry.start), entry])
    );
    const cells = [];

    for (let hour = dayStart; hour < dayEnd;) {
      if (isLunch(hour)) {
        if (hour === lunchStart) {
          cells.push({
            kind: "lunch",
            column: hour - dayStart + 2,
            span: lunchDuration,
          });
        }
        hour++;
        continue;
      }

      const entry = entriesByStart.get(hour);
      if (!entry) {
        cells.push({ kind: "empty", column: hour - dayStart + 2, span: 1 });
        hour++;
        continue;
      }

      const end = hourValue(entry.end);
      const duration = end - hour;
      cells.push({
        kind: "entry",
        column: hour - dayStart + 2,
        span: duration,
        entry,
        start: hour,
        end,
      });
      hour += duration;
    }

    return { day, off: false, cells };
  });

  return {
    columns: `90px repeat(${dayEnd - dayStart}, minmax(112px, 1fr))`,
    headers,
    rows,
    visibleEntryCount: visibleEntries.length,
  };
}
