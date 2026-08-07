-- ============================================================================
-- 0019_cooking_log_step_timings.sql — 요리 모드 실제 소요시간 기록
-- ============================================================================
-- 요리 모드(CookingModePage)에서 측정한 단계별 준비/조리 시간을 기록해서, 레시피에 설정된
-- 타이머 값이 실제와 얼마나 다른지 판단하고 조정을 제안하는 데 쓴다(src/data/cookingLog.ts의
-- fetchStepTimingAdjustments). step_timings는 CookingLogStepTiming[] 형태의 jsonb 배열 —
-- 기존 기록에는 없으므로 null 허용. is_multi_recipe=true(복합 요리)인 기록은 조정 제안 계산에서
-- 항상 제외한다(다른 레시피로 이탈했다가 돌아오는 흐름이라 cookSeconds가 부풀려짐).
--
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 한 번 실행.
-- ============================================================================

alter table public.cooking_log add column if not exists step_timings jsonb;
alter table public.cooking_log add column if not exists is_multi_recipe boolean not null default false;
