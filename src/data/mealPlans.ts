import { supabase } from '../lib/supabaseClient';
import type { MealPlan } from './types';

function rowToMealPlan(row: Record<string, unknown>): MealPlan {
  return {
    id: row.id as string,
    householdId: row.household_id as string,
    date: row.date as string,
    recipeId: row.recipe_id as string,
  };
}

/** start~end(YYYY-MM-DD, 포함) 범위의 household 주간 일정을 날짜별 Map으로 가져온다. 계속
 * 구독하는 캐시가 아니라 홈 화면/주간 일정 화면 진입 시 그때그때 조회한다(recipeLikes.ts/
 * cookingLog.ts와 같은 패턴 — 자주 안 바뀌는 데이터라 실시간 동기화가 중요하지 않음). */
export async function fetchMealPlans(
  householdId: string,
  startDate: string,
  endDate: string,
): Promise<Map<string, MealPlan>> {
  const { data, error } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('household_id', householdId)
    .gte('date', startDate)
    .lte('date', endDate);
  if (error) throw error;
  const map = new Map<string, MealPlan>();
  for (const row of data ?? []) {
    const plan = rowToMealPlan(row);
    map.set(plan.date, plan);
  }
  return map;
}

/** 그 날짜에 레시피를 배치한다 — (household_id, date)가 유니크라 upsert로 기존 계획을 덮어쓴다. */
export async function setMealPlan(householdId: string, date: string, recipeId: string): Promise<void> {
  const { error } = await supabase
    .from('meal_plans')
    .upsert({ household_id: householdId, date, recipe_id: recipeId }, { onConflict: 'household_id,date' });
  if (error) throw error;
}

export async function clearMealPlan(householdId: string, date: string): Promise<void> {
  const { error } = await supabase.from('meal_plans').delete().eq('household_id', householdId).eq('date', date);
  if (error) throw error;
}
