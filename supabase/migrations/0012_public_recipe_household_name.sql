-- ============================================================================
-- 0012_public_recipe_household_name.sql — 다른 가구 공개 레시피에 "가구 이름" 표시 지원
-- ============================================================================
-- 배경: "OO님의 레시피 (영희네)"처럼, 다른 가구의 전체공개(visibility='public') 레시피에
-- 작성자의 가구 이름도 괄호로 표기하려면, 그 작성자가 어느 household 소속인지(household_members)
-- 와 그 household의 이름(households)을 조회할 수 있어야 한다. 지금까지는 둘 다 "내 household면"
-- 만 볼 수 있게 막혀있어서(household_members_select_own_household / households_select_member),
-- 공개 레시피 작성자라 해도 다른 household 소속이면 이름을 읽어올 수 없었다(0007이 이미 tags/
-- ingredients/profiles에 해준 것과 같은 종류의 보완을 households/household_members에도 추가).
--
-- 두 정책 모두 "공개 레시피 작성자와 관련된 행만" 조회를 허용하는 SELECT 전용 예외이고,
-- household_members에 노출되는 컬럼도 user_id/household_id뿐이라(email 등 민감정보 없음)
-- 추가 노출 범위는 최소화되어 있다.
-- ============================================================================

create policy "household_members_select_via_public_recipe" on public.household_members
  for select using (
    user_id in (select user_id from public.recipes where visibility = 'public')
  );

create policy "households_select_via_public_recipe" on public.households
  for select using (
    id in (
      select hm.household_id
      from public.household_members hm
      join public.recipes r on r.user_id = hm.user_id
      where r.visibility = 'public'
    )
  );
