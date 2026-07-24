-- ============================================================================
-- CookKit — household 온보딩용 RPC 함수 (schema.sql 실행 이후 추가)
-- ============================================================================
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 내용만 새로 실행하면 됩니다.
-- (schema.sql을 다시 실행하면 "already exists" 에러가 나니 이 파일만 추가로 실행할 것)
--
-- 왜 필요한가: household_members 테이블 RLS는 "본인 user_id로만 insert 가능"까지만
-- 체크해서, 클라이언트가 직접 insert하면 초대코드 검증 없이도(household_id만 알면) 가입이
-- 가능한 상태였습니다(schema.sql의 TODO 주석 참고). 또한 households SELECT 정책은 "이미
-- 멤버인 household만" 조회 가능해서, 가입 전에는 초대코드로 household를 찾을 방법 자체가
-- 없었습니다. 이 두 문제를 SECURITY DEFINER 함수로 한 번에 해결합니다(함수 내부에서는
-- RLS를 우회해 조회/검증하고, 결과만 클라이언트에 돌려줌).

-- 가구 생성 + 본인을 멤버로 추가를 원자적으로 처리
create function public.create_household(household_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household_id uuid;
begin
  if exists (select 1 from public.household_members where user_id = auth.uid()) then
    raise exception '이미 가구에 속해 있어요. 한 계정은 하나의 가구에만 속할 수 있어요.';
  end if;

  insert into public.households (name, created_by)
  values (household_name, auth.uid())
  returning id into new_household_id;

  insert into public.household_members (household_id, user_id)
  values (new_household_id, auth.uid());

  return new_household_id;
end;
$$;

-- 초대 코드로 가구 참여: 코드가 실제로 일치하는 household를 찾아 검증한 뒤에만 멤버 추가
create function public.join_household_by_invite_code(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_household_id uuid;
begin
  if exists (select 1 from public.household_members where user_id = auth.uid()) then
    raise exception '이미 가구에 속해 있어요. 한 계정은 하나의 가구에만 속할 수 있어요.';
  end if;

  select id into target_household_id
  from public.households
  where invite_code = code;

  if target_household_id is null then
    raise exception '초대 코드가 올바르지 않아요.';
  end if;

  insert into public.household_members (household_id, user_id)
  values (target_household_id, auth.uid());

  return target_household_id;
end;
$$;

grant execute on function public.create_household(text) to authenticated;
grant execute on function public.join_household_by_invite_code(text) to authenticated;
