-- MealPlan 확장: 끼니 구분(meal_type) + 한 끼 여러 메뉴(sort_order) 지원.
-- 기존 (household_id, date) 유니크 제약은 "하루 한 행만" 가정이라 더 이상 맞지 않는다 —
-- 이제 같은 (household_id, date, meal_type)에도 여러 행이 들어갈 수 있어(한 끼에 여러 메뉴)
-- 제약 자체를 제거한다.
alter table public.meal_plans
  add column meal_type text not null default 'dinner'
    check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack'));

alter table public.meal_plans
  add column sort_order integer not null default 0;

alter table public.meal_plans drop constraint if exists meal_plans_household_id_date_key;

create index meal_plans_date_mealtype_idx on public.meal_plans (household_id, date, meal_type);
