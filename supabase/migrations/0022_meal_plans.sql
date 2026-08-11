-- ============================================================================
-- 0022_meal_plans.sql — 주간 일정(저녁 메뉴 계획), household 단위 공유
-- ============================================================================
-- 홈 화면의 "이번 주 일정" 스트립 + 주간 일정 화면(디자인 시스템 전면 교체, DIS-07)이 쓴다.
-- 지금은 저녁 한 끼만 관리(아침/점심 구분 없음) — 나중에 mealType을 추가할 수 있도록
-- (date, recipe_id)만 유니크로 두고 하루 한 행만 허용한다(같은 날 두 번 계획 불가, 나중에
-- mealType이 생기면 (date, meal_type) 유니크로 바꾸면 됨).
create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  date date not null,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (household_id, date)
);

create index meal_plans_household_id_idx on public.meal_plans (household_id);

alter table public.meal_plans enable row level security;

create policy "meal_plans_all_household_member" on public.meal_plans
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
