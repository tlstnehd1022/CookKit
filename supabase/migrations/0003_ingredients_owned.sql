-- ============================================================================
-- CookKit — ingredients에 보유 여부(owned) 컬럼 추가
-- ============================================================================
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일만 추가로 실행하면 됩니다.
--
-- 왜 필요한가: 기존 앱(localStorage 버전)은 재료의 "보유 여부"를 별도의 PantryStatus
-- 맵(ingredientId -> boolean)으로 관리했습니다. schema.sql의 ingredients 테이블에는
-- quantity(숫자)만 있고 boolean 개념이 없어서, 데이터 레이어를 Supabase로 옮기면서
-- 이 컬럼을 추가합니다. household 공유 테이블이라 "배우자가 체크하면 나한테도 바로
-- 보임" 요구사항과도 자연스럽게 맞습니다(별도 pantry_status 테이블보다 이쪽이 더 단순).

alter table public.ingredients
  add column owned boolean not null default false;
