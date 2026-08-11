-- ============================================================================
-- 0023_notifications.sql — 알림함(좋아요/가구원 레시피 추가), 인사말과는 별도 보관
-- ============================================================================
-- notifications.user_id는 "받는 사람"이라 실제 INSERT를 수행하는 사람(auth.uid())과 다르다
-- (좋아요를 누른 사람이 레시피 소유자에게 알림을 만들어주는 식). 그래서 일반적인
-- "user_id = auth.uid()" RLS insert 정책으로는 표현이 안 되고, 아무 조건 없이 임의 유저에게
-- 알림을 꽂아넣을 수 있게 열어두면 스팸 벡터가 된다. 대신 SECURITY DEFINER RPC 3개만 통해서
-- 생성/삭제하게 하고(0002/0014 마이그레이션의 create_household/save_user_api_key와 같은 패턴),
-- 각 RPC가 그 알림이 실제로 유효한 행동에서 나온 것인지(레시피를 정말 그 사람이 소유하는지,
-- 정말 같은 household인지, 본인 알림이 아닌지) 서버에서 검증한다. 테이블 자체에는 INSERT/DELETE
-- RLS 정책을 두지 않아 클라이언트의 직접 쓰기를 막는다 — RPC만이 elevated 권한으로 우회한다.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('recipe_liked', 'household_recipe_added')),
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_id_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications_select_own" on public.notifications
  for select using (user_id = auth.uid());

create policy "notifications_update_own" on public.notifications
  for update using (user_id = auth.uid());

-- ---- create_recipe_liked_notification -----------------------------------------------------
create or replace function public.create_recipe_liked_notification(p_recipe_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_liker_name text;
begin
  select user_id into v_owner_id from public.recipes where id = p_recipe_id;
  if v_owner_id is null or v_owner_id = auth.uid() then
    return; -- 레시피가 없거나 본인 레시피에 본인이 좋아요 누른 경우 알림 생성 안 함
  end if;

  select display_name into v_liker_name from public.profiles where id = auth.uid();

  insert into public.notifications (user_id, type, payload)
  values (
    v_owner_id,
    'recipe_liked',
    jsonb_build_object(
      'recipe_id', p_recipe_id,
      'liker_user_id', auth.uid(),
      'liker_name', coalesce(v_liker_name, '이름 없는 사용자')
    )
  );
end;
$$;

revoke all on function public.create_recipe_liked_notification(uuid) from public;
grant execute on function public.create_recipe_liked_notification(uuid) to authenticated;

-- ---- delete_recipe_liked_notification -----------------------------------------------------
-- 좋아요 취소 시 호출 — 본인(좋아요를 눌렀던 사람)이 남긴 그 알림만 지운다. 안 그러면 취소된
-- 좋아요에 대한 알림이 계속 남아있게 된다.
create or replace function public.delete_recipe_liked_notification(p_recipe_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications
  where type = 'recipe_liked'
    and payload->>'recipe_id' = p_recipe_id::text
    and payload->>'liker_user_id' = auth.uid()::text;
end;
$$;

revoke all on function public.delete_recipe_liked_notification(uuid) from public;
grant execute on function public.delete_recipe_liked_notification(uuid) to authenticated;

-- ---- create_household_recipe_added_notifications ------------------------------------------
-- 새 레시피 저장 직후(수정이 아니라 신규 생성일 때만) 호출 — 같은 household의 다른 구성원
-- 전원에게 알림을 생성한다. p_recipe_id는 반드시 auth.uid() 본인 소유여야 한다.
create or replace function public.create_household_recipe_added_notifications(p_recipe_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owns boolean;
  v_author_name text;
  v_member record;
begin
  select exists(select 1 from public.recipes where id = p_recipe_id and user_id = auth.uid()) into v_owns;
  if not v_owns then
    return;
  end if;

  select display_name into v_author_name from public.profiles where id = auth.uid();

  for v_member in
    select hm2.user_id
    from public.household_members hm1
    join public.household_members hm2 on hm2.household_id = hm1.household_id
    where hm1.user_id = auth.uid() and hm2.user_id <> auth.uid()
  loop
    insert into public.notifications (user_id, type, payload)
    values (
      v_member.user_id,
      'household_recipe_added',
      jsonb_build_object(
        'recipe_id', p_recipe_id,
        'author_user_id', auth.uid(),
        'author_name', coalesce(v_author_name, '이름 없는 사용자')
      )
    );
  end loop;
end;
$$;

revoke all on function public.create_household_recipe_added_notifications(uuid) from public;
grant execute on function public.create_household_recipe_added_notifications(uuid) to authenticated;
