export type ExpirationLevel = 'expired' | 'urgent' | 'soon';

export interface ExpirationInfo {
  level: ExpirationLevel;
  /** 오늘 기준 남은 일수(음수면 이미 지남) */
  daysLeft: number;
}

/**
 * 유통기한(YYYY-MM-DD)을 오늘 날짜와 비교해 배지 표시용 정보를 계산한다.
 * 유통기한이 없거나 8일 이상 남았으면 null(배지 없음).
 * - expired: 이미 지남
 * - urgent: 오늘 포함 3일 이내(빨간색)
 * - soon: 4~7일 이내(주황색)
 */
export function getExpirationInfo(expirationDate: string | undefined | null): ExpirationInfo | null {
  if (!expirationDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(expirationDate);
  target.setHours(0, 0, 0, 0);
  if (Number.isNaN(target.getTime())) return null;

  const daysLeft = Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (daysLeft < 0) return { level: 'expired', daysLeft };
  if (daysLeft <= 3) return { level: 'urgent', daysLeft };
  if (daysLeft <= 7) return { level: 'soon', daysLeft };
  return null;
}

export function formatExpirationBadge(info: ExpirationInfo): string {
  if (info.level === 'expired') return '유통기한 지남';
  if (info.level === 'urgent') return `⚠️ D-${info.daysLeft}`;
  return `D-${info.daysLeft}`;
}
