const ISO_DATE = /^\d{4}-(\d{2})-(\d{2})/;

/** `2026-10-14` → `14.10` */
export const shortDate = (iso: string): string => {
  const match = ISO_DATE.exec(iso);
  return match === null ? iso : `${match[2] ?? ""}.${match[1] ?? ""}`;
};

const MOSCOW_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" });

/** Today in Moscow, where lectures and tests take place, wherever the reader is: `2026-10-25`. */
export const todayIso = (now: Date): string => MOSCOW_DAY.format(now);
