-- 둘러보기(다른 household 공개 레시피) 상세의 "이 레시피를 요리해본 사람들" 갤러리(4-2)를
-- 위한 RLS 예외 — tags/ingredients/profiles/households에 이미 있던 "공개 레시피가 참조하는
-- 경우에 한해 SELECT 허용" 패턴과 동일하게 cooking_log에도 적용한다.

-- 공개 레시피에 달린 요리 기록은 household가 달라도 조회 가능해야 함(둘러보기 화면용).
-- household 등급은 어차피 같은 household 멤버끼리라 기존 cooking_log_select_household가 이미
-- 커버함.
create policy "cooking_log_select_via_public_recipe" on public.cooking_log
  for select using (
    recipe_id in (select id from public.recipes where visibility = 'public')
  );

-- 위 예외로 다른 household의 cooking_log 행이 보이면, 그 행이 참조하는 household의 이름도
-- 읽을 수 있어야 갤러리에 "OO에서 만든 모습"을 표시할 수 있다 — 기존
-- households_select_via_public_recipe(0012)는 "레시피 작성자의 household"만 커버해서
-- "그 레시피를 요리해본 다른 household"까지는 포함하지 않으므로 별도로 추가한다.
create policy "households_select_via_public_cooking_log" on public.households
  for select using (
    id in (
      select household_id from public.cooking_log
      where recipe_id in (select id from public.recipes where visibility = 'public')
    )
  );
