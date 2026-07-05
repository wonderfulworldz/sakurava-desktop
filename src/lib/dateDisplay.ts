const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateOnlyValue(value: string | null | undefined) {
  return Boolean(value?.trim().match(DATE_ONLY_PATTERN));
}

export function formatDateOnlyDisplay(
  value: string | null | undefined,
  fallback = "N/A",
) {
  const parts = parseDateOnlyParts(value);
  if (!parts) {
    return fallback;
  }

  return `${MONTH_LABELS[parts.month - 1]} ${padDay(parts.day)}, ${parts.year}`;
}

export function formatLocalTimestampDisplay(
  value: string | number | null | undefined,
  fallback = "N/A",
) {
  if (value === null || value === undefined) {
    return fallback;
  }

  const rawValue = String(value).trim();
  if (!rawValue) {
    return fallback;
  }

  const date = /^\d+$/.test(rawValue)
    ? new Date(Number(rawValue))
    : new Date(rawValue);

  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  const datePart = `${part("month")} ${part("day")}, ${part("year")}`;
  const timePart = [part("hour"), part("minute")].filter(Boolean).join(":");
  const dayPeriod = part("dayPeriod");
  const timeZoneName = part("timeZoneName");
  const timeWithPeriod = [timePart, dayPeriod].filter(Boolean).join(" ");
  const timeAndZone = [timeWithPeriod, timeZoneName].filter(Boolean).join(" ");

  return [datePart, timeAndZone].filter(Boolean).join(", ");
}

function parseDateOnlyParts(value: string | null | undefined) {
  const match = value?.trim().match(DATE_ONLY_PATTERN);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  if (month < 1 || month > 12) {
    return null;
  }

  const maxDay = daysInMonth(year, month);
  if (day < 1 || day > maxDay) {
    return null;
  }

  return { day, month, year };
}

function daysInMonth(year: number, month: number) {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }

  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function padDay(day: number) {
  return String(day).padStart(2, "0");
}
