-- cooking_log에 실제로 만든 인분(servings)을 기록한다(B-6) — 재료 차감(owned=false)이 이
-- 인분 기준이었다는 걸 남겨두기 위함(2인분 레시피를 4인분 만들었으면 재료도 2배 소모).
-- 기존 행은 실제 인분을 알 수 없으므로 그 레시피의 servingsBase로 백필(추정치).
alter table public.cooking_log add column servings integer;

update public.cooking_log cl
set servings = coalesce((r.content->>'servingsBase')::integer, 2)
from public.recipes r
where r.id = cl.recipe_id and cl.servings is null;

update public.cooking_log set servings = 2 where servings is null;

alter table public.cooking_log alter column servings set not null;
alter table public.cooking_log alter column servings set default 2;
alter table public.cooking_log add constraint cooking_log_servings_check check (servings > 0);
