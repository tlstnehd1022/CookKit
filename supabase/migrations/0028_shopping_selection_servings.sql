-- shopping_selection에 항목별 인분(servings)을 추가한다 — 지금까지는 장보기 집계가 항상
-- recipe.servingsBase(레시피 원본 기준 인분)로만 계산돼서, 레시피 상세에서 4인분으로 보고
-- 담아도 실제로는 2인분만 담기는 문제가 있었다(B-0에서 버그로 확인).
--
-- 기존 행은 servings가 없으므로, 지금 동작과 동일하게 유지되도록 그 레시피의
-- content->>'servingsBase'로 백필한다(레시피가 삭제됐거나 값이 없으면 안전하게 2로 폴백).
alter table public.shopping_selection add column servings integer;

update public.shopping_selection ss
set servings = coalesce((r.content->>'servingsBase')::integer, 2)
from public.recipes r
where r.id = ss.recipe_id and ss.servings is null;

update public.shopping_selection set servings = 2 where servings is null;

alter table public.shopping_selection alter column servings set not null;
alter table public.shopping_selection alter column servings set default 2;
alter table public.shopping_selection add constraint shopping_selection_servings_check check (servings > 0);
