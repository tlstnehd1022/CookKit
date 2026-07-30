-- ============================================================================
-- 0016_ingredient_expiration.sql — 재료 유통기한 필드 추가
-- ============================================================================
-- 재료별 유통기한(선택 사항)을 저장한다. 화면 표시(임박 배지)와 예정된 웹 푸시 알림
-- (api/check-expiring-ingredients.ts, Vercel Cron)이 이 컬럼을 기준으로 판단한다.
alter table public.ingredients add column if not exists expiration_date date;
