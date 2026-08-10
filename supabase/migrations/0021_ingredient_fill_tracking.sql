-- ============================================================================
-- 0021_ingredient_fill_tracking.sql — 재료 "채움" 이력 추적(냉장고 컨셉 개편, DIS-06)
-- ============================================================================
-- last_filled_at: 가장 최근에 채워진 시각(냉장고 화면의 "n일 전 채움" 배지용, 빠른 단일 조회).
-- ingredient_fill_log: 채워질 때마다 남기는 이력 한 줄씩(장보기 화면의 "자주 채우시는데 지금
-- 없어요" 선제 제안이 최근 90일 채움 횟수/평균 재구매 주기를 계산할 때 씀). 이미 owned=true인
-- 상태에서 다시 채워도(예: 아직 남았는데 미리 사둔 경우) 유효한 구매 이력으로 보고 매번 기록한다.
alter table public.ingredients add column if not exists last_filled_at timestamptz;

create table if not exists public.ingredient_fill_log (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  filled_at timestamptz not null default now()
);

create index if not exists ingredient_fill_log_household_id_idx on public.ingredient_fill_log (household_id);
create index if not exists ingredient_fill_log_ingredient_id_idx on public.ingredient_fill_log (ingredient_id);

alter table public.ingredient_fill_log enable row level security;

drop policy if exists "ingredient_fill_log_all_household_member" on public.ingredient_fill_log;
create policy "ingredient_fill_log_all_household_member" on public.ingredient_fill_log
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
