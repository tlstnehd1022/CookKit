-- ============================================================================
-- 0009_recipe_likes.sql — 공개 레시피 좋아요(하트) 기능
-- ============================================================================
-- user_id + recipe_id 복합 기본키라 "한 사용자가 한 레시피에 좋아요 1번만" 자연스럽게 보장됨
-- (토글은 insert/delete로 처리 — update 불필요).
--
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 한 번 실행.
-- ============================================================================

create table if not exists public.recipe_likes (
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (recipe_id, user_id)
);

create index if not exists recipe_likes_recipe_id_idx on public.recipe_likes (recipe_id);

alter table public.recipe_likes enable row level security;

-- 좋아요 개수/여부는 그 레시피를 볼 수 있는 사람이면 다 볼 수 있어야 함(본인 것 + 공개 레시피)
drop policy if exists "recipe_likes_select_via_recipe" on public.recipe_likes;
create policy "recipe_likes_select_via_recipe" on public.recipe_likes
  for select using (
    recipe_id in (select id from public.recipes where is_public = true or user_id = auth.uid())
  );

drop policy if exists "recipe_likes_insert_own" on public.recipe_likes;
create policy "recipe_likes_insert_own" on public.recipe_likes
  for insert with check (user_id = auth.uid());

drop policy if exists "recipe_likes_delete_own" on public.recipe_likes;
create policy "recipe_likes_delete_own" on public.recipe_likes
  for delete using (user_id = auth.uid());
