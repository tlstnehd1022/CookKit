-- 요리 기록(cooking_log)에 사진을 붙일 수 있게 컬럼 추가(30차 확장 2번/4번/5번).
-- 레시피의 대표 사진(recipes.final_image_id)과는 별개로, 그 "한 번의 요리"를 만든 모습을
-- 기록하는 사진이다 — RecipeDetailPage의 "우리집에서 만든 모습" 갤러리, 요리 기록 직접
-- 추가 화면의 사진 업로드가 이 컬럼을 쓴다.
alter table public.cooking_log add column if not exists image_id text;
