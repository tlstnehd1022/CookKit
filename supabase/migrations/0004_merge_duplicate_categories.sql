-- ============================================================================
-- 0004_merge_duplicate_categories.sql — 중복 생성된 카테고리 정리(1회성 데이터 정리)
-- ============================================================================
-- 배경: RecipeEditor.tsx의 AI 반영 로직(applyExtractedResult)이 새 재료들을
-- Promise.all로 동시에 처리하던 시절, 아직 없는 카테고리를 두 재료가 동시에 필요로 하면
-- 서로의 생성 결과를 보지 못해(둘 다 리액트 state 스냅샷 기준) 같은 이름의 카테고리가
-- 여러 개(다른 id로) 생기는 레이스 컨디션 버그가 있었음. 재료 목록 화면에서 "같은
-- 카테고리인데 그루핑이 안 되는" 것처럼 보이는 원인이 이것 — 실제로는 이름만 같고
-- categoryId가 다른 카테고리 행이 여러 개 존재했던 것.
-- 코드는 순차 처리 + 배치 내 캐시로 이미 수정됨(RecipeEditor.tsx applyExtractedResult /
-- createIngredientFromAi / resolveOrCreateTag) — 이 스크립트는 그 버그로 "이미" 생성된
-- 중복 카테고리를 병합하는 정리용.
--
-- 동작: household 단위로 이름(대소문자 무시 + 앞뒤 공백 정리)이 같은 카테고리를 찾아
-- 가장 먼저 만들어진 것을 대표로 남기고, 나머지를 쓰던 재료들의 category_id를 대표로
-- 옮긴 뒤 나머지 카테고리 행을 삭제함.
--
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 한 번 실행.
-- 중복이 없으면 아무 일도 하지 않으므로 여러 번 실행해도 안전함(idempotent).
-- ============================================================================

do $$
declare
  dup record;
  canonical_id uuid;
begin
  for dup in
    select household_id, lower(trim(name)) as norm_name
    from public.categories
    group by household_id, lower(trim(name))
    having count(*) > 1
  loop
    -- 이 household + 이름 그룹의 대표(가장 먼저 만들어진 것)를 고른다
    select id into canonical_id
    from public.categories
    where household_id = dup.household_id and lower(trim(name)) = dup.norm_name
    order by created_at asc, id asc
    limit 1;

    -- 중복 카테고리를 참조하던 재료들을 대표 카테고리로 옮긴다
    update public.ingredients
    set category_id = canonical_id
    where category_id in (
      select id from public.categories
      where household_id = dup.household_id
        and lower(trim(name)) = dup.norm_name
        and id <> canonical_id
    );

    -- 대표를 제외한 나머지 중복 카테고리 삭제
    delete from public.categories
    where household_id = dup.household_id
      and lower(trim(name)) = dup.norm_name
      and id <> canonical_id;
  end loop;
end $$;
