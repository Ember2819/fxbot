// When a routine runs: five-field cron in numbers, or one local time, with no library and no fxbot imports, so a script
// can check it alone. Times are read in a zone with Intl, and the walk moves through instants, so the clocks need no
// special case: a time they skip never turns up, and one they repeat turns up twice, which the plugin's key runs once.

const fields = [
  ["minute", 0, 59],
  ["hour", 0, 23],
  ["day of month", 1, 31],
  ["month", 1, 12],
  ["day of week", 0, 7],
] as const;

export type Cron = { minute: Set<number>; hour: Set<number>; day: Set<number>; month: Set<number>; weekday: Set<number>; bothDays: boolean };

// One field's values, or a reason it can't be read.
function values(text: string, name: string, low: number, high: number) {
  const found = new Set<number>();
  for (const part of text.split(",")) {
    const match = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
    if (!match) throw new Error(/[a-z]/i.test(part) ? `use numbers, not ${part}` : `${part} isn't a ${name}`);
    const [, range, step] = match;
    const [a, b] = range === "*" ? [low, high] : range.split("-").map(Number);
    const end = b ?? (step ? high : a);
    if (a < low || end > high || a > end) throw new Error(`${part} is outside ${low} to ${high}, for the ${name}`);
    if (step !== undefined && Number(step) < 1) throw new Error(`${part} has a step of 0`);
    for (let n = a; n <= end; n += step ? Number(step) : 1) found.add(n);
  }
  return found;
}

/** A cron's parts, or an Error that says why it can't be read. */
export function parse(cron: string): Cron {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`it has ${parts.length} fields, not 5`);
  const [minute, hour, day, month, weekdays] = parts.map((part, i) => values(part, fields[i][0], fields[i][1], fields[i][2]));
  // 0 and 7 are both Sunday.
  const weekday = new Set([...weekdays].map((n) => n % 7));
  return { minute, hour, day, month, weekday, bothDays: day.size < 31 && weekday.size < 7 };
}

const formats = new Map<string, Intl.DateTimeFormat>();
function format(zone: string) {
  const made = formats.get(zone) ?? new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short" });
  formats.set(zone, made);
  return made;
}
const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// An instant's wall clock in a zone.
function clock(at: Date, zone: string) {
  const part: Record<string, string> = {};
  for (const { type, value } of format(zone).formatToParts(at)) part[type] = value;
  return { year: Number(part.year), month: Number(part.month), day: Number(part.day), hour: Number(part.hour), minute: Number(part.minute), weekday: days.indexOf(part.weekday) };
}

const minute = 60_000;
const two = (n: number) => String(n).padStart(2, "0");

/** The first time a cron comes round after `after`, or null when it never does. Eight years reach any 29 February. */
export function next(cron: Cron, after: Date, zone: string) {
  let at = Math.floor(after.getTime() / minute) * minute + minute;
  const end = at + 8 * 366 * 24 * 60 * minute;
  while (at < end) {
    const t = clock(new Date(at), zone);
    const onDay = cron.bothDays ? cron.day.has(t.day) || cron.weekday.has(t.weekday) : cron.day.has(t.day) && cron.weekday.has(t.weekday);
    if (!onDay || !cron.month.has(t.month) || !cron.hour.has(t.hour)) at += (60 - t.minute) * minute;
    else if (!cron.minute.has(t.minute)) at += minute;
    else return new Date(at);
  }
  return null;
}

/** The fewest minutes between two runs, over 50 runs or a year from a fixed date, or null when it never comes round. */
export function closest(cron: Cron) {
  const start = new Date("2026-01-01T00:00:00Z");
  let last = next(cron, start, "UTC");
  if (!last) return null;
  let least = Infinity;
  for (let i = 0; i < 50; i++) {
    const then = next(cron, last, "UTC");
    if (!then || then.getTime() - start.getTime() > 366 * 24 * 60 * minute) break;
    least = Math.min(least, (then.getTime() - last.getTime()) / minute);
    last = then;
  }
  return least;
}

/** A local time such as 2026-11-06T09:00 as an instant in the zone, or null when it isn't one. */
export function atTime(text: string, zone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const [year, month, day, hour, min] = match.slice(1).map(Number);
  const wanted = Date.UTC(year, month - 1, day, hour, min);
  const back = new Date(wanted);
  if (back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day || hour > 23 || min > 59) return null;
  // The zone's offset, found by how far off a guess reads, twice, since the guess may be across a clock change.
  let at = wanted;
  for (let i = 0; i < 2; i++) {
    const t = clock(new Date(at), zone);
    at += wanted - Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute);
  }
  return new Date(at);
}

/** An instant as its local minute, such as 2026-11-06 09:00. A routine's firing is unique by this. */
export function slot(at: Date, zone: string) {
  const t = clock(at, zone);
  return `${t.year}-${two(t.month)}-${two(t.day)} ${two(t.hour)}:${two(t.minute)}`;
}

const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const list = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/** A cron in words, for the owner and the bot: the cron itself when it isn't one of the usual shapes. */
export function describe(cron: string) {
  const [min, hour, day, month, weekday] = cron.trim().split(/\s+/);
  const whole = /^\d+$/;
  const time = whole.test(hour) && whole.test(min) ? `${two(Number(hour))}:${two(Number(min))}` : "";
  if (month === "*" && time) {
    if (day === "*" && weekday === "*") return `every day at ${time}`;
    if (day === "*" && weekday === "1-5") return `every weekday at ${time}`;
    if (day === "*" && /^[0-7](,[0-7])*$/.test(weekday)) return `every ${list(weekday.split(",").map((n) => names[Number(n) % 7]))} at ${time}`;
    if (weekday === "*" && whole.test(day)) return `on day ${Number(day)} of each month at ${time}`;
  }
  if (day === "*" && month === "*" && weekday === "*") {
    if (whole.test(min) && hour === "*") return `every hour at :${two(Number(min))}`;
    const hours = /^\*\/(\d+)$/.exec(hour);
    if (min === "0" && hours) return `every ${hours[1]} hours`;
    const minutes = /^\*\/(\d+)$/.exec(min);
    if (minutes && hour === "*") return `every ${minutes[1]} minutes`;
  }
  return cron.trim();
}
