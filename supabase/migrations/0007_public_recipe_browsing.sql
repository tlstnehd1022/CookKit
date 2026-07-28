-- ============================================================================
-- 0007_public_recipe_browsing.sql — 다른 가구 공개 레시피 둘러보기/복사 기능 지원
-- ============================================================================
-- 배경: recipes 테이블 자체의 RLS(`recipes_select_public_or_own`)는 이미 "본인 것 + is_public
-- =true"를 조회 가능하게 되어 있어서 추가 수정이 필요 없었음. 하지만 공개 레시피가 참조하는
-- tags/ingredients/profiles는 전부 household(또는 본인) 단위로만 보이게 막혀있어서, 다른
-- household의 공개 레시피를 열어봐도 그 레시피가 쓰는 태그 이름/재료 이름/작성자 이름을
-- 하나도 못 읽어오는 문제가 있었음(레시피 행 자체는 보여도 참조된 이름들이 비어보임).
-- 이 마이그레이션은 "공개 레시피가 참조하는 경우에 한해" 그 이름들을 읽을 수 있게 SELECT
-- 정책을 추가한다(수정/삭제 권한은 그대로 원래 household/본인 소유로 제한됨 — 조회만 열림).
--
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 한 번 실행.
-- 이미 있으면 건너뛰므로(drop policy if exists + add column if not exists) 여러 번 실행해도 안전.
-- ============================================================================

-- 레시피 "복사하기" 시 원본을 추적하기 위한 컬럼(어떤 공개 레시피에서 복사해왔는지 기록 —
-- "이미 있음" 배지 판단, 나중에 원본이 삭제/비공개로 바뀌어도 내 복사본은 그대로 유지됨).
alter table public.recipes
  add column if not exists source_recipe_id uuid references public.recipes(id) on delete set null;

create index if not exists recipes_source_recipe_id_idx on public.recipes (source_recipe_id);

-- ---- tags: 공개 레시피가 쓰는 태그는 다른 household여도 이름을 읽을 수 있어야 함 ----
drop policy if exists "tags_select_via_public_recipe" on public.tags;
create policy "tags_select_via_public_recipe" on public.tags
  for select using (
    exists (
      select 1
      from public.recipe_tags rt
      join public.recipes r on r.id = rt.recipe_id
      where rt.tag_id = tags.id and r.is_public = true
    )
  );

-- ---- ingredients: 공개 레시피가 재료로 참조하는 경우도 마찬가지(재료 참조는 jsonb 배열이라
-- 정식 FK/조인 테이블이 없어서 jsonb_array_elements로 훑어서 판단) ----
drop policy if exists "ingredients_select_via_public_recipe" on public.ingredients;
create policy "ingredients_select_via_public_recipe" on public.ingredients
  for select using (
    exists (
      select 1
      from public.recipes r
      where r.is_public = true
        and exists (
          select 1
          from jsonb_array_elements(coalesce(r.content->'ingredients', '[]'::jsonb)) as ing
          where (ing->>'ingredientId')::uuid = ingredients.id
        )
    )
  );

-- ---- profiles: 공개 레시피 작성자 이름("OO님의 레시피")을 다른 household 사용자도 볼 수 있어야 함 ----
drop policy if exists "profiles_select_via_public_recipe" on public.profiles;
create policy "profiles_select_via_public_recipe" on public.profiles
  for select using (
    id in (select user_id from public.recipes where is_public = true)
  );
