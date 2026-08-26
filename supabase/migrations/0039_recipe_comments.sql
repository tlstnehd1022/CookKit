-- ============================================================================
-- 0039_recipe_comments.sql — 레시피 댓글 기능
-- ============================================================================
-- recipe_likes와 같은 가시성 규칙(본인 것 + household 공유 + public)을 그대로 재사용한다.
-- 댓글 삭제는 작성자 본인 + 레시피 소유자(부적절한 댓글에 대한 최소한의 대응 수단, 완전한
-- 신고/차단 시스템은 이번 범위 밖) 둘 다 허용한다.
--
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 한 번 실행.
-- ============================================================================

create table public.recipe_comments (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index recipe_comments_recipe_id_idx on public.recipe_comments (recipe_id, created_at);

alter table public.recipe_comments enable row level security;

create policy "recipe_comments_select_via_recipe" on public.recipe_comments
  for select using (
    recipe_id in (
      select id from public.recipes
      where visibility = 'public'
        or user_id = auth.uid()
        or (visibility = 'household' and public.shares_household_with(user_id))
    )
  );

create policy "recipe_comments_insert_own" on public.recipe_comments
  for insert with check (
    user_id = auth.uid()
    and recipe_id in (
      select id from public.recipes
      where visibility = 'public'
        or user_id = auth.uid()
        or (visibility = 'household' and public.shares_household_with(user_id))
    )
  );

create policy "recipe_comments_update_own" on public.recipe_comments
  for update using (user_id = auth.uid());

create policy "recipe_comments_delete_own_or_owner" on public.recipe_comments
  for delete using (
    user_id = auth.uid()
    or recipe_id in (select id from public.recipes where user_id = auth.uid())
  );

-- ---- 다른 household 댓글 작성자의 프로필/가구 이름 표시용 예외 ------------------------------
-- profiles_select_via_public_recipe(0012)는 "레시피 작성자"만 커버해서, 공개 레시피에 댓글을
-- 남긴 다른 household 사용자의 프로필까지는 못 본다 — households_select_via_public_cooking_log
-- (0034)와 같은 이유로 별도 예외가 필요하다.
create policy "profiles_select_via_public_recipe_comment" on public.profiles
  for select using (
    id in (
      select user_id from public.recipe_comments
      where recipe_id in (select id from public.recipes where visibility = 'public')
    )
  );

create policy "household_members_select_via_public_recipe_comment" on public.household_members
  for select using (
    user_id in (
      select user_id from public.recipe_comments
      where recipe_id in (select id from public.recipes where visibility = 'public')
    )
  );

create policy "households_select_via_public_recipe_comment" on public.households
  for select using (
    id in (
      select hm.household_id
      from public.household_members hm
      join public.recipe_comments rc on rc.user_id = hm.user_id
      where rc.recipe_id in (select id from public.recipes where visibility = 'public')
    )
  );

-- ---- 알림(notifications) 타입 확장 -----------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('recipe_liked', 'household_recipe_added', 'recipe_commented'));

-- ---- create_recipe_commented_notification -----------------------------------------------------
create or replace function public.create_recipe_commented_notification(
  p_recipe_id uuid,
  p_comment_id uuid,
  p_content text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_commenter_name text;
begin
  select user_id into v_owner_id from public.recipes where id = p_recipe_id;
  if v_owner_id is null or v_owner_id = auth.uid() then
    return; -- 레시피가 없거나 본인 레시피에 본인이 댓글 단 경우 알림 생성 안 함
  end if;

  select display_name into v_commenter_name from public.profiles where id = auth.uid();

  insert into public.notifications (user_id, type, payload)
  values (
    v_owner_id,
    'recipe_commented',
    jsonb_build_object(
      'recipe_id', p_recipe_id,
      'comment_id', p_comment_id,
      'commenter_user_id', auth.uid(),
      'commenter_name', coalesce(v_commenter_name, '이름 없는 사용자'),
      'comment_preview', left(p_content, 80)
    )
  );
end;
$$;

revoke all on function public.create_recipe_commented_notification(uuid, uuid, text) from public;
grant execute on function public.create_recipe_commented_notification(uuid, uuid, text) to authenticated;

-- ---- delete_recipe_commented_notification -----------------------------------------------------
-- 댓글 삭제 시 호출 — 삭제 주체가 댓글 작성자 본인이든(자진 삭제) 레시피 소유자든(모더레이션
-- 삭제) 둘 다 호출할 수 있어야 해서, recipe_likes와 달리 "auth.uid() = 알림을 유발한 사람"으로
-- 한정하지 않고 "작성자 본인 또는 레시피 소유자"인지를 알림 payload 기준으로 검증한다.
create or replace function public.delete_recipe_commented_notification(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipe_id uuid;
  v_commenter_id uuid;
  v_owner_id uuid;
begin
  select (payload->>'recipe_id')::uuid, (payload->>'commenter_user_id')::uuid
    into v_recipe_id, v_commenter_id
  from public.notifications
  where type = 'recipe_commented' and payload->>'comment_id' = p_comment_id::text
  limit 1;

  if v_recipe_id is null then
    return; -- 알림이 없으면(이미 지워졌거나 애초에 안 만들어짐) 조용히 종료
  end if;

  select user_id into v_owner_id from public.recipes where id = v_recipe_id;

  if auth.uid() = v_commenter_id or auth.uid() = v_owner_id then
    delete from public.notifications
    where type = 'recipe_commented' and payload->>'comment_id' = p_comment_id::text;
  end if;
end;
$$;

revoke all on function public.delete_recipe_commented_notification(uuid) from public;
grant execute on function public.delete_recipe_commented_notification(uuid) to authenticated;
