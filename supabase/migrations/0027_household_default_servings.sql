-- 가구 기본 인원(household.default_servings) — 레시피를 담거나 배치할 때 초기 인분값으로
-- 쓰인다. recipe.servingsBase("이 레시피는 원래 몇 인분 기준으로 작성됐는지")와는 다른
-- 개념("우리집은 보통 몇 인분씩 만드는지")이라 별도 컬럼으로 둔다.
alter table public.households
  add column default_servings integer not null default 2 check (default_servings > 0);
