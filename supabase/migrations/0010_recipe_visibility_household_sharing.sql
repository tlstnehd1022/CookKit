-- ============================================================================
-- 0010_recipe_visibility_household_sharing.sql — 레시피 공개 범위 3단계로 확장
-- ============================================================================
-- 배경: 지금까지 recipes.is_public(boolean)은 "본인만" / "전체공개" 둘뿐이라, 같은 가구
-- 식구끼리도 서로의 레시피가 자동으로 안 보였음(레시피는 household가 아니라 user 소유라서).
-- is_public을 없애고 visibility('private'|'household'|'public') 3단계로 바꾼다.
-- 기본값은 'household' — 가족 앱이라는 이 프로젝트 성격상 가구원끼리는 기본으로 공유되는 게
-- 자연스럽고, "전체공개"는 그 위에 한 단계 더(다른 가구까지) 여는 개념으로 재정의.
--
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 한 번 실행.
-- 주의: 기존에 is_public=false였던 레시피는 전부 visibility='household'로 바뀜(가구원에게
-- 공개됨) — 지금까지 "비공개"라고 생각했던 레시피가 있다면 실행 후 "개인 소유"로 다시
-- 바꿔줘야 함(1인 가구라면 사실상 체감 차이 없음).
-- ============================================================================

alter table public.recipes
  add column if not exists visibility text not null default 'household'
    check (visibility in ('private', 'household', 'public'));

update public.recipes set visibility = case when is_public then 'public' else 'household' end;

-- ---- recipes ---------------------------------------------------------
drop policy if exists "recipes_select_public_or_own" on public.recipes;
create policy "recipes_select_visibility" on public.recipes
  for select using (
    visibility = 'public'
    or user_id = auth.uid()
    or (visibility = 'household' and public.shares_household_with(user_id))
  );

-- ---- recipe_tags ---------------------------------------------------------
drop policy if exists "recipe_tags_select_via_recipe" on public.recipe_tags;
create policy "recipe_tags_select_via_recipe" on public.recipe_tags
  for select using (
    recipe_id in (
      select id from public.recipes
      where visibility = 'public'
        or user_id = auth.uid()
        or (visibility = 'household' and public.shares_household_with(user_id))
    )
  );

-- ---- tags/ingredients/profiles: "다른 household 참조"는 public 등급에만 필요함 —
-- household 등급은 어차피 같은 household 멤버끼리라 기존 household 단위 정책이 이미 커버함.
drop policy if exists "tags_select_via_public_recipe" on public.tags;
create policy "tags_select_via_public_recipe" on public.tags
  for select using (
    exists (
      select 1 from public.recipe_tags rt
      join public.recipes r on r.id = rt.recipe_id
      where rt.tag_id = tags.id and r.visibility = 'public'
    )
  );

drop policy if exists "ingredients_select_via_public_recipe" on public.ingredients;
create policy "ingredients_select_via_public_recipe" on public.ingredients
  for select using (
    exists (
      select 1 from public.recipes r
      where r.visibility = 'public'
        and exists (
          select 1 from jsonb_array_elements(coalesce(r.content->'ingredients', '[]'::jsonb)) as ing
          where (ing->>'ingredientId')::uuid = ingredients.id
        )
    )
  );

drop policy if exists "profiles_select_via_public_recipe" on public.profiles;
create policy "profiles_select_via_public_recipe" on public.profiles
  for select using (
    id in (select user_id from public.recipes where visibility = 'public')
  );
-- household 등급 레시피 작성자 이름은 profiles_select_own_or_household(shares_household_with)
-- 정책이 이미 커버하므로 별도 정책 불필요.

-- ---- recipe_likes ---------------------------------------------------------
drop policy if exists "recipe_likes_select_via_recipe" on public.recipe_likes;
create policy "recipe_likes_select_via_recipe" on public.recipe_likes
  for select using (
    recipe_id in (
      select id from public.recipes
      where visibility = 'public'
        or user_id = auth.uid()
        or (visibility = 'household' and public.shares_household_with(user_id))
    )
  );

-- ---- recipe-images storage ---------------------------------------------------------
-- household 등급 이미지는 경로 자체가 {household_id}/... 라 기존 household 멤버 정책이
-- 이미 커버함(같은 household면 같은 경로 prefix로 통과). public 등급만 별도 정책 필요.
drop policy if exists "recipe_images_select_via_public_recipe" on storage.objects;
create policy "recipe_images_select_via_public_recipe" on storage.objects
  for select using (
    bucket_id = 'recipe-images'
    and exists (
      select 1 from public.recipes r
      where r.id = ((storage.foldername(name))[2])::uuid
        and r.visibility = 'public'
    )
  );

-- ---- is_public 컬럼 정리 ---------------------------------------------------------
alter table public.recipes drop column if exists is_public;
