export const DEFAULT_RESTAURANT_DAY_START = '00:00';

export type RestaurantDayBounds = {
  key: string;
  start: Date;
  end: Date;
};

export function normalizeRestaurantDayStart(value: string | null | undefined) {
  const match = /^(0\d|1\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.exec(value || '');

  return match
    ? `${match[1]}:${value!.slice(3, 5)}`
    : DEFAULT_RESTAURANT_DAY_START;
}

function getTimeZoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  return Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  ) as Record<string, number>;
}

function getTimeZoneOffset(date: Date, timeZone: string) {
  const parts = getTimeZoneParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  return asUtc - date.getTime();
}

function zonedDateToUtc(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  timeZone: string
) {
  const wallClock = Date.UTC(year, month - 1, day, hours, minutes);
  const initial = new Date(wallClock);
  const offset = getTimeZoneOffset(initial, timeZone);
  const adjusted = new Date(wallClock - offset);
  const correctedOffset = getTimeZoneOffset(adjusted, timeZone);

  return new Date(wallClock - correctedOffset);
}

function shiftCalendarDate(
  year: number,
  month: number,
  day: number,
  amount: number
) {
  const shifted = new Date(Date.UTC(year, month - 1, day + amount));

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

export function getRestaurantTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function getCurrentRestaurantDayBounds(
  date = new Date(),
  dayStart = DEFAULT_RESTAURANT_DAY_START,
  timeZone = getRestaurantTimeZone()
): RestaurantDayBounds {
  const normalized = normalizeRestaurantDayStart(dayStart);
  const [hours, minutes] = normalized.split(':').map(Number);
  const local = getTimeZoneParts(date, timeZone);
  const localMinutes = local.hour * 60 + local.minute;
  const startMinutes = hours * 60 + minutes;
  const businessDate = localMinutes >= startMinutes
    ? { year: local.year, month: local.month, day: local.day }
    : shiftCalendarDate(local.year, local.month, local.day, -1);
  const nextDate = shiftCalendarDate(
    businessDate.year,
    businessDate.month,
    businessDate.day,
    1
  );
  const start = zonedDateToUtc(
    businessDate.year,
    businessDate.month,
    businessDate.day,
    hours,
    minutes,
    timeZone
  );
  const end = zonedDateToUtc(
    nextDate.year,
    nextDate.month,
    nextDate.day,
    hours,
    minutes,
    timeZone
  );

  return {
    key: `${businessDate.year}-${String(businessDate.month).padStart(2, '0')}-${String(businessDate.day).padStart(2, '0')}`,
    start,
    end,
  };
}

export function isInCurrentRestaurantDay(
  date: Date,
  dayStart = DEFAULT_RESTAURANT_DAY_START,
  timeZone = getRestaurantTimeZone(),
  now = new Date()
) {
  const bounds = getCurrentRestaurantDayBounds(now, dayStart, timeZone);
  const timestamp = date.getTime();

  return timestamp >= bounds.start.getTime() && timestamp < bounds.end.getTime();
}

export function getCurrentRestaurantDayStart(
  date = new Date(),
  dayStart = DEFAULT_RESTAURANT_DAY_START,
  timeZone = getRestaurantTimeZone()
) {
  return getCurrentRestaurantDayBounds(date, dayStart, timeZone).start;
}

export function getCurrentRestaurantDayEnd(
  date = new Date(),
  dayStart = DEFAULT_RESTAURANT_DAY_START,
  timeZone = getRestaurantTimeZone()
) {
  return getCurrentRestaurantDayBounds(date, dayStart, timeZone).end;
}

export function restaurantDayKey(
  date: Date,
  dayStart = DEFAULT_RESTAURANT_DAY_START,
  timeZone = getRestaurantTimeZone()
) {
  return getCurrentRestaurantDayBounds(date, dayStart, timeZone).key;
}

export function restaurantDayDate(
  date: Date,
  dayStart = DEFAULT_RESTAURANT_DAY_START,
  timeZone = getRestaurantTimeZone()
) {
  return getCurrentRestaurantDayBounds(date, dayStart, timeZone).start;
}
