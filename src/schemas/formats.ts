/** Format assertions shared by the validator and the test oracle (see ADR-0002). */

const DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/;
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** RFC 3339 date-time; a leap second (60) is accepted only at 23:59. */
export function isDateTime(value: string): boolean {
  const m = DATE_TIME.exec(value);
  if (!m) return false;
  const [year, month, day, hour, minute, second] = [1, 2, 3, 4, 5, 6].map((i) => Number(m[i]));
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined
  ) {
    return false;
  }
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  if (hour > 23 || minute > 59) return false;
  if (second > 60 || (second === 60 && !(hour === 23 && minute === 59))) return false;
  if (m[7] !== undefined && m[8] !== undefined) {
    if (Number(m[7]) > 23 || Number(m[8]) > 59) return false;
  }
  return true;
}

/** 8-4-4-4-12 hexadecimal digits, any case; version and variant are not checked. */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export const FORMATS: ReadonlyMap<string, (value: string) => boolean> = new Map([
  ["date-time", isDateTime],
  ["uuid", isUuid],
]);
