const ISO_DATE = /^\d{4}-(\d{2})-(\d{2})/;

/** `2026-10-14` → `14.10` */
export const shortDate = (iso: string): string => {
  const match = ISO_DATE.exec(iso);
  return match === null ? iso : `${match[2] ?? ""}.${match[1] ?? ""}`;
};

const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

/** `2026-10-23` → `23 окт` (a lecture's day on a button) */
export const dayMonth = (iso: string): string => {
  const match = ISO_DATE.exec(iso);
  const month = MONTHS[Number(match?.[1]) - 1];
  return match === null || month === undefined ? iso : `${Number(match[2])} ${month}`;
};

const DAY_MS = 86_400_000;

/** `2026-11-02`, −14 → `2026-10-19`: calendar arithmetic on ISO days, no time zone involved. Not a date → as is. */
export const addDays = (iso: string, days: number): string => {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? iso : new Date(time + days * DAY_MS).toISOString().slice(0, 10);
};

const MOSCOW_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" });

/** Today in Moscow, where lectures and tests take place, wherever the reader is: `2026-10-25`. */
export const todayIso = (now: Date): string => MOSCOW_DAY.format(now);
