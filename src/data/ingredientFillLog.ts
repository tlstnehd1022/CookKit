import { supabase } from '../lib/supabaseClient';

const FREQUENCY_WINDOW_DAYS = 90;

export interface FillFrequencyInfo {
  /** 최근 90일 안에 채워진 횟수 */
  count: number;
  /** 채움 사이 평균 간격(일) — 채움이 2회 미만이면 계산 불가라 null */
  avgIntervalDays: number | null;
}

/** 재료가 owned:true로 채워질 때마다 한 줄 남긴다 — store.ts의 markIngredientFilled가 호출한다. */
export async function logIngredientFillEvent(ingredientId: string, householdId: string): Promise<void> {
  const { error } = await supabase
    .from('ingredient_fill_log')
    .insert({ ingredient_id: ingredientId, household_id: householdId });
  if (error) throw error;
}

/**
 * household의 재료별 최근 90일 채움 빈도를 계산한다. 장보기 화면(선제 제안)이 진입 시 1회만
 * 호출하고 그 결과를 재사용한다 — 계속 구독하는 캐시가 아니라 recipeLikes.ts/cookingLog.ts와
 * 같은 "필요할 때 한 번 조회" 패턴.
 */
export async function fetchFillFrequencies(householdId: string): Promise<Map<string, FillFrequencyInfo>> {
  const since = new Date(Date.now() - FREQUENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('ingredient_fill_log')
    .select('ingredient_id, filled_at')
    .eq('household_id', householdId)
    .gte('filled_at', since)
    .order('filled_at', { ascending: true });
  if (error) throw error;

  const timestampsByIngredient = new Map<string, string[]>();
  for (const row of data ?? []) {
    const ingredientId = row.ingredient_id as string;
    const list = timestampsByIngredient.get(ingredientId) ?? [];
    list.push(row.filled_at as string);
    timestampsByIngredient.set(ingredientId, list);
  }

  const result = new Map<string, FillFrequencyInfo>();
  for (const [ingredientId, timestamps] of timestampsByIngredient) {
    let avgIntervalDays: number | null = null;
    if (timestamps.length >= 2) {
      const gapsDays: number[] = [];
      for (let i = 1; i < timestamps.length; i++) {
        const gapMs = new Date(timestamps[i]).getTime() - new Date(timestamps[i - 1]).getTime();
        gapsDays.push(gapMs / (24 * 60 * 60 * 1000));
      }
      avgIntervalDays = gapsDays.reduce((a, b) => a + b, 0) / gapsDays.length;
    }
    result.set(ingredientId, { count: timestamps.length, avgIntervalDays });
  }
  return result;
}
