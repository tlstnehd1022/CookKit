-- ============================================================================
-- 0038_tags_type_tool.sql — 요리도구(tool) 태그 타입 추가
-- ============================================================================
-- Tag.type에 'tool'을 추가한다(에어프라이어/오븐 등) — cuisine/style과 달리 레시피 목록의
-- 가로 스크롤 행에는 노출하지 않고 필터에서만 골라 쓴다(RecipeRowSection.splitTagRows가
-- 'tool' 타입을 건너뛰도록 클라이언트에서 처리). 0005 마이그레이션이 cuisine을 추가할 때와
-- 같은 이유로 tags.type 체크 제약을 먼저 넓혀야 insert가 막히지 않는다.
--
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 한 번 실행.
-- 이미 같은 이름의 tool 태그가 있는 household는 건드리지 않으므로 여러 번 실행해도 안전함.
-- ============================================================================

alter table public.tags drop constraint if exists tags_type_check;
alter table public.tags add constraint tags_type_check check (type in ('style', 'category', 'cuisine', 'tool'));

-- 기존 household에 기본 요리도구 태그가 없으면 채워넣기(이름 중복 방지)
insert into public.tags (household_id, name, type)
select h.id, v.name, 'tool'
from public.households h
cross join (values ('에어프라이어'), ('오븐'), ('전자레인지'), ('찜기'), ('압력솥')) as v(name)
where not exists (
  select 1 from public.tags t
  where t.household_id = h.id and t.type = 'tool' and t.name = v.name
);

-- 앞으로 새로 만들어지는 household도 자동으로 기본 요리도구 태그를 받도록 create_household 갱신
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
  from (values ('한식'), ('양식'), ('중식'), ('일식'), ('퓨전'), ('동남아식'), ('인도식'), ('멕시칸'), ('분식')) as v(name);

  insert into public.tags (household_id, name, type)
  select new_household_id, v.name, 'style'
  from (
    values ('크림류'), ('토마토류'), ('국물요리'), ('볶음요리'), ('구이요리'), ('튀김요리'),
           ('찜·조림'), ('면요리'), ('밥·죽류'), ('무침·샐러드'), ('부침·전'),
           ('디저트·베이킹'), ('음료'), ('샌드위치·토스트')
  ) as v(name);

  insert into public.tags (household_id, name, type)
  select new_household_id, v.name, 'tool'
  from (values ('에어프라이어'), ('오븐'), ('전자레인지'), ('찜기'), ('압력솥')) as v(name);

  insert into public.categories (household_id, name)
  select new_household_id, v.name
  from (
    values ('채소'), ('과일'), ('육류·해산물·두부'), ('계란·유제품'),
           ('곡류·면류'), ('소스·양념'), ('가공·냉동식품'), ('기타')
  ) as v(name);

  return new_household_id;
end;
$$;
