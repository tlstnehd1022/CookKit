-- ============================================================================
-- 0005_seed_default_cuisine_tags.sql — 국가/스타일(cuisine) 기본 태그 자동 생성
-- ============================================================================
-- 배경: Tag.type에 'cuisine'을 추가했는데(한식/양식/중식/일식/퓨전 등), 태그 관리 화면에서
-- 직접 만들기 전에는 레시피 편집 화면의 "국가/스타일" 섹션이 비어 있어 아무것도 고를 수 없음.
-- 매번 수동으로 5개를 만드는 건 불편하니, (1) 지금 있는 household들에 기본 태그를 한 번
-- 채워주고 (2) 앞으로 새로 만들어지는 household도 가입/생성 시 자동으로 받도록 함.
--
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 한 번 실행.
-- 이미 같은 이름의 cuisine 태그가 있는 household는 건드리지 않으므로 여러 번 실행해도 안전함.
-- ============================================================================

-- 1) 기존 household에 기본 cuisine 태그가 없으면 채워넣기(이름 중복 방지)
insert into public.tags (household_id, name, type)
select h.id, v.name, 'cuisine'
from public.households h
cross join (values ('한식'), ('양식'), ('중식'), ('일식'), ('퓨전')) as v(name)
where not exists (
  select 1 from public.tags t
  where t.household_id = h.id and t.type = 'cuisine' and t.name = v.name
);

-- 2) 앞으로 새로 만들어지는 household도 자동으로 기본 cuisine 태그를 받도록 create_household 갱신
create or replace function public.create_household(household_name text)
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

  insert into public.tags (household_id, name, type)
  select new_household_id, v.name, 'cuisine'
  from (values ('한식'), ('양식'), ('중식'), ('일식'), ('퓨전')) as v(name);

  return new_household_id;
end;
$$;
