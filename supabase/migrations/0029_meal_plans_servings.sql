-- meal_plans에 항목별 인분(servings)을 추가한다(B-4) — shopping_selection과 같은 이유:
-- "이 날 살 것"/영양 정보 하루 합계가 recipe.servingsBase가 아니라 실제 배치된 인분 기준으로
-- 계산되도록. 기존 행은 그 레시피의 servingsBase로 백필(지금 동작이 안 깨지게).
alter table public.meal_plans add column servings integer;

update public.meal_plans mp
set servings = coalesce((r.content->>'servingsBase')::integer, 2)
from public.recipes r
where r.id = mp.recipe_id and mp.servings is null;

update public.meal_plans set servings = 2 where servings is null;

alter table public.meal_plans alter column servings set not null;
alter table public.meal_plans alter column servings set default 2;
alter table public.meal_plans add constraint meal_plans_servings_check check (servings > 0);
