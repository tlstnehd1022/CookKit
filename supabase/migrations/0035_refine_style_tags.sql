-- ============================================================================
-- 0035_refine_style_tags.sql — 요리 스타일 태그 정리(재료/맛 축 제거 + 빠진 유형 추가)
-- ============================================================================
-- 배경: 기존 12개 스타일 태그 중 "고기요리"(재료 기준)/"매콤한맛"(맛 기준)은 다른 태그들
-- (전부 조리법/형태 기준: 볶음요리/구이요리/찜·조림 등)과 축이 달라 거의 모든 레시피와
-- 중복될 수 있어 제거한다. 대신 지금까지 빠져있던 흔한 유형 4개를 추가한다 — 특히 "음료"는
-- 이미 시딩된 레시피(수박주스 등) 중 어떤 스타일 태그에도 안 걸리는 실제 사례가 있었음.
--
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 한 번 실행.
-- ============================================================================

-- 기존 household들의 "고기요리"/"매콤한맛" 스타일 태그 제거 — recipe_tags는
-- on delete cascade라 그 태그가 붙어있던 레시피는 그 태그만 자연스럽게 빠진다.
delete from public.tags
where type = 'style' and name in ('고기요리', '매콤한맛');

-- 새 스타일 태그 4개를 기존 household에 백필(이미 있으면 건너뜀).
insert into public.tags (household_id, name, type)
select h.id, v.name, 'style'
from public.households h
cross join (values ('부침·전'), ('디저트·베이킹'), ('음료'), ('샌드위치·토스트')) as v(name)
where not exists (
  select 1 from public.tags t where t.household_id = h.id and t.type = 'style' and t.name = v.name
);
