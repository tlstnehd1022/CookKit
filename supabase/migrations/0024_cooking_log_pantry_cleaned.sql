-- 요리 완료 후 냉장고 정리를 했는지 추적한다 — null이면 아직 정리 안 함(홈 화면 "냉장고 정리
-- 안 함" 안내 대상). 정리는 요리한 사람이 아닌 다른 가구원이 할 수도 있어서(household 공유 작업)
-- cooking_log_update_own(본인 것만) RLS로는 부족하다 — SECURITY DEFINER 함수로 "같은 household
-- 멤버면" 갱신을 허용한다(create_recipe_liked_notification 등 기존 패턴과 동일).
alter table public.cooking_log add column if not exists pantry_cleaned_at timestamptz;

create or replace function public.mark_pantry_cleaned(p_cooking_log_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
begin
  select household_id into v_household_id from public.cooking_log where id = p_cooking_log_id;
  if v_household_id is null then
    return;
  end if;
  if not public.is_household_member(v_household_id) then
    raise exception '이 요리 기록에 접근할 권한이 없어요.';
  end if;
  update public.cooking_log set pantry_cleaned_at = now() where id = p_cooking_log_id;
end;
$$;

revoke all on function public.mark_pantry_cleaned(uuid) from public;
grant execute on function public.mark_pantry_cleaned(uuid) to authenticated;
