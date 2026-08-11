const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 오늘이 속한 주(월~일) 7일치 YYYY-MM-DD 배열을 반환한다. */
export function getCurrentWeekDates(today: Date = new Date()): string[] {
  const day = today.getDay(); // 0=일요일 ... 6=토요일
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + mondayOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    return toDateString(d);
  });
}

export function todayDateString(): string {
  return toDateString(new Date());
}

/** '2026-08-12' → '수' */
export function formatWeekdayShort(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return WEEKDAY_LABELS[new Date(y, m - 1, d).getDay()];
}

/** '2026-08-12' → '수요일' */
export function formatWeekdayLong(dateStr: string): string {
  return `${formatWeekdayShort(dateStr)}요일`;
}

/** '2026-08-12' → 12 */
export function formatDayOfMonth(dateStr: string): number {
  return Number(dateStr.split('-')[2]);
}
