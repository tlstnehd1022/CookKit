import { supabase } from '../lib/supabaseClient';
import type { MealPlan, MealType } from './types';

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export const MEAL_TYPE_LABEL: Record<MealType, string> = {
  breakfast: '아침',
  lunch: '점심',
  dinner: '저녁',
  snack: '간식',
};

const MEAL_TYPE_ORDER: Record<MealType, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
  snack: 3,
};

function rowToMealPlan(row: Record<string, unknown>): MealPlan {
  return {
    id: row.id as string,
    householdId: row.household_id as string,
    date: row.date as string,
    recipeId: row.recipe_id as string,
    mealType: row.meal_type as MealType,
    sortOrder: row.sort_order as number,
  };
}

function sortDayPlans(plans: MealPlan[]): MealPlan[] {
  return [...plans].sort(
    (a, b) => MEAL_TYPE_ORDER[a.mealType] - MEAL_TYPE_ORDER[b.mealType] || a.sortOrder - b.sortOrder,
  );
}

/** start~end(YYYY-MM-DD, 포함) 범위의 household 주간 일정을 날짜별로 가져온다. 한 끼에 여러
 * 메뉴가 들어갈 수 있어 날짜당 배열이다 — 끼니 순서(아침→점심→저녁→간식) → 같은 끼니 안에서는
 * sortOrder 순으로 정렬해서 반환한다. 계속 구독하는 캐시가 아니라 홈/주간 일정 화면 진입 시
 * 그때그때 조회한다(recipeLikes.ts/cookingLog.ts와 같은 패턴). */
export async function fetchMealPlans(
  householdId: string,
  startDate: string,
  endDate: string,
): Promise<Map<string, MealPlan[]>> {
  const { data, error } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('household_id', householdId)
    .gte('date', startDate)
    .lte('date', endDate);
  if (error) throw error;
  const map = new Map<string, MealPlan[]>();
  for (const row of data ?? []) {
    const plan = rowToMealPlan(row);
    const list = map.get(plan.date) ?? [];
    list.push(plan);
    map.set(plan.date, list);
  }
  for (const [date, list] of map) {
    map.set(date, sortDayPlans(list));
  }
  return map;
}

/** 그 날의 대표 메뉴 하나를 고른다 — 저녁이 있으면 저녁 첫 번째 메뉴, 없으면 가장 이른 끼니의
 * 첫 번째 메뉴(홈 인사말/주간 스트립이 "오늘은 OO예요"/요일 칸 메뉴명 표시에 공유해서 쓴다). */
export function pickRepresentativeMealPlan(dayPlans: MealPlan[]): MealPlan | undefined {
  if (dayPlans.length === 0) return undefined;
  const dinner = dayPlans.find((p) => p.mealType === 'dinner');
  if (dinner) return dinner;
  return sortDayPlans(dayPlans)[0];
}

/** 원탭 배치 — 끼니 섹션의 "+ 메뉴 추가"를 누르고 레시피를 고르면 곧바로 이 함수가 호출된다.
 * sortOrder는 그 끼니의 현재 메뉴 개수를 그대로 써서 맨 뒤에 붙인다. */
export async function addMealPlan(
  householdId: string,
  date: string,
  mealType: MealType,
  recipeId: string,
  sortOrder: number,
): Promise<void> {
  const { error } = await supabase
    .from('meal_plans')
    .insert({ household_id: householdId, date, meal_type: mealType, recipe_id: recipeId, sort_order: sortOrder });
  if (error) throw error;
}

/** "바꾸기" — 그 메뉴 카드(끼니/순서)는 그대로 두고 레시피만 교체한다. */
export async function updateMealPlanRecipe(id: string, recipeId: string): Promise<void> {
  const { error } = await supabase.from('meal_plans').update({ recipe_id: recipeId }).eq('id', id);
  if (error) throw error;
}

/** "빼기" — 그 메뉴 한 개만 삭제(같은 끼니의 다른 메뉴는 영향 없음). */
export async function removeMealPlan(id: string): Promise<void> {
  const { error } = await supabase.from('meal_plans').delete().eq('id', id);
  if (error) throw error;
}
