-- ============================================================================
-- 0031_expand_default_tags.sql — 요리 스타일/국가·장르 기본 태그를 더 대중적으로 확장
-- ============================================================================
-- 배경: 국가/장르(cuisine)는 0005에서 5개(한식/양식/중식/일식/퓨전)만 시딩해뒀고, 요리
-- 스타일(style)은 아예 기본 태그가 하나도 없어서 household를 새로 만들면 태그 관리에서
-- 하나하나 직접 만들어야 했음 — 태그를 안 만들면 레시피 편집 화면의 해당 섹션이 비어
-- 아무것도 고를 수 없어서 실사용에 번거로움. 흔히 쓰이는 이름들을 기본으로 미리 채워두고,
-- 필요 없으면 태그 관리에서 지우면 됨.
--
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 한 번 실행.
-- 이미 같은 이름의 태그가 있는 household는 건드리지 않으므로(이름별 not exists 체크)
-- 여러 번 실행해도 안전함.
-- ============================================================================

-- 1) 기존 household에 확장된 cuisine 태그 채워넣기(0005의 5개에 4개 추가)
insert into public.tags (household_id, name, type)
select h.id, v.name, 'cuisine'
from public.households h
cross join (values ('한식'), ('양식'), ('중식'), ('일식'), ('퓨전'), ('동남아식'), ('인도식'), ('멕시칸'), ('분식')) as v(name)
where not exists (
  select 1 from public.tags t
  where t.household_id = h.id and t.type = 'cuisine' and t.name = v.name
);

-- 2) 기존 household에 style 기본 태그 채워넣기(신규)
insert into public.tags (household_id, name, type)
select h.id, v.name, 'style'
from public.households h
cross join (
  values ('크림류'), ('토마토류'), ('고기요리'), ('국물요리'), ('볶음요리'),
         ('구이요리'), ('튀김요리'), ('찜·조림'), ('면요리'), ('밥·죽류'),
         ('무침·샐러드'), ('매콤한맛')
) as v(name)
where not exists (
  select 1 from public.tags t
  where t.household_id = h.id and t.type = 'style' and t.name = v.name
);

-- 3) 앞으로 새로 만들어지는 household도 확장된 두 목록을 자동으로 받도록 create_household 갱신
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
    values ('크림류'), ('토마토류'), ('고기요리'), ('국물요리'), ('볶음요리'),
           ('구이요리'), ('튀김요리'), ('찜·조림'), ('면요리'), ('밥·죽류'),
           ('무침·샐러드'), ('매콤한맛')
  ) as v(name);

  return new_household_id;
end;
$$;
