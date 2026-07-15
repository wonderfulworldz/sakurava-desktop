export type ImportDateInput = string | number | Date | null | undefined;

export type ImportDateOptions = {
  locale: string;
  excelDateFormatted?: boolean;
  excelDate1904?: boolean;
};

export type ImportDateResult =
  | { state: "empty"; value: "" }
  | { state: "valid"; value: string }
  | { state: "invalid"; value: string };

export function normalizeImportDate(
  input: ImportDateInput,
  options: ImportDateOptions,
): ImportDateResult {
  if (input == null || (typeof input === "string" && input.trim() === "")) {
    return { state: "empty", value: "" };
  }

  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return invalidDate(input);
    return validParts(input.getFullYear(), input.getMonth() + 1, input.getDate());
  }

  if (typeof input === "number") {
    if (!options.excelDateFormatted || !Number.isFinite(input)) {
      return invalidDate(input);
    }
    const parts = excelSerialDateParts(input, options.excelDate1904 === true);
    return parts ? validParts(parts.year, parts.month, parts.day) : invalidDate(input);
  }

  const value = input.trim();
  const stable = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (stable) {
    return validParts(Number(stable[1]), Number(stable[2]), Number(stable[3]), value);
  }

  const localNumeric = parseLocalNumericDate(value, options.locale);
  if (localNumeric) {
    return validParts(localNumeric.year, localNumeric.month, localNumeric.day, value);
  }

  const localTextual = parseLocalTextualDate(value, options.locale);
  if (localTextual) {
    return validParts(localTextual.year, localTextual.month, localTextual.day, value);
  }

  return { state: "invalid", value };
}

export function localDateFormatHint(locale: string) {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(2006, 10, 22)).map((part) => {
    if (part.type === "year") return "YYYY";
    if (part.type === "month") return "MM";
    if (part.type === "day") return "DD";
    return part.value;
  }).join("").replace(/\u202f/g, " ");
}

export function isClearlyExcelDateFormat(numberFormat: string | undefined) {
  if (!numberFormat) return false;
  const withoutQuotedText = numberFormat.replace(/"[^"]*"/g, "");
  return /[dy]/i.test(withoutQuotedText) && /[my]/i.test(withoutQuotedText);
}

function parseLocalNumericDate(value: string, locale: string) {
  const match = value.match(/^(\d{1,4})\D(\d{1,2})\D(\d{1,4})$/);
  if (!match) return null;
  const order = localDateOrder(locale);
  const values = Object.fromEntries(
    order.map((part, index) => [part, Number(match[index + 1])]),
  ) as Record<"year" | "month" | "day", number>;
  return validDateParts(values.year, values.month, values.day) ? values : null;
}

function parseLocalTextualDate(value: string, locale: string) {
  const tokens = value
    .toLocaleLowerCase(locale)
    .replace(/[,./-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length !== 3) return null;

  const monthNames = localMonthNames(locale);
  const monthIndex = tokens.findIndex((token) => monthNames.has(normalizeWord(token)));
  const yearIndex = tokens.findIndex((token) => /^\d{4}$/.test(token));
  if (monthIndex < 0 || yearIndex < 0 || monthIndex === yearIndex) return null;
  const dayIndex = [0, 1, 2].find((index) => index !== monthIndex && index !== yearIndex);
  if (dayIndex == null || !/^\d{1,2}$/.test(tokens[dayIndex])) return null;

  const parts = {
    year: Number(tokens[yearIndex]),
    month: monthNames.get(normalizeWord(tokens[monthIndex]))!,
    day: Number(tokens[dayIndex]),
  };
  return validDateParts(parts.year, parts.month, parts.day) ? parts : null;
}

function localDateOrder(locale: string) {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date(2006, 10, 22))
    .map((part) => part.type)
    .filter((part): part is "year" | "month" | "day" =>
      part === "year" || part === "month" || part === "day",
    );
}

function localMonthNames(locale: string) {
  const result = new Map<string, number>();
  for (let month = 0; month < 12; month += 1) {
    for (const width of ["long", "short"] as const) {
      const name = new Intl.DateTimeFormat(locale, { month: width })
        .format(new Date(2006, month, 1));
      result.set(normalizeWord(name), month + 1);
    }
  }
  return result;
}

function normalizeWord(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\.$/, "");
}

function excelSerialDateParts(serial: number, date1904: boolean) {
  const wholeDays = Math.floor(serial);
  if (wholeDays < 0) return null;
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const date = new Date(epoch + wholeDays * 86_400_000);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function validParts(year: number, month: number, day: number, original = ""):
  ImportDateResult {
  return validDateParts(year, month, day)
    ? { state: "valid", value: canonicalDate(year, month, day) }
    : { state: "invalid", value: original };
}

function validDateParts(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(year, month, 0).getDate();
}

function canonicalDate(year: number, month: number, day: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function invalidDate(input: string | number | Date): ImportDateResult {
  return { state: "invalid", value: input instanceof Date ? String(input) : String(input) };
}
