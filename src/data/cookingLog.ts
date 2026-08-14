import { supabase } from '../lib/supabaseClient';
import { chunk, IN_QUERY_CHUNK_SIZE } from '../lib/chunk';
import type { CookingLogStepTiming } from './types';

export interface CookingStats {
  count: number;
  /** ISO 타임스탬프, 기록이 없으면 null */
  lastCookedAt: string | null;
}

/**
 * 요리 기록(cooking_log)은 household 공유 store(store.ts)처럼 계속 구독하는 캐시가 아니라
 * 필요한 화면(레시피 상세, 레시피 목록의 "자주 해먹은 순" 정렬)에서 그때그때 집계해 조회한다 —
 * recipeLikes.ts의 fetchLikeInfo와 같은 패턴(개인 앱 규모에서 group by RPC 없이도 충분히 가벼움).
 */
export async function fetchCookingStats(recipeIds: string[]): Promise<Map<string, CookingStats>> {
  const result = new Map<string, CookingStats>(recipeIds.map((id) => [id, { count: 0, lastCookedAt: null }]));
  if (recipeIds.length === 0) return result;

  const rows = (
    await Promise.all(
      chunk(recipeIds, IN_QUERY_CHUNK_SIZE).map(async (ids) => {
        const { data, error } = await supabase.from('cooking_log').select('recipe_id, cooked_at').in('recipe_id', ids);
        if (error) throw error;
        return data ?? [];
      }),
    )
  ).flat();

  for (const row of rows) {
    const entry = result.get(row.recipe_id as string);
    if (!entry) continue;
    entry.count += 1;
    const cookedAt = row.cooked_at as string;
    if (!entry.lastCookedAt || cookedAt > entry.lastCookedAt) entry.lastCookedAt = cookedAt;
  }
  return result;
}

/** "오늘 만들었어요" 확정 시 기록을 남긴다 — 재료 차감(owned=false)은 호출부(RecipeDetailPage)가
 * 사용자가 체크한 재료에 대해 별도로 처리한다(이 함수는 기록만 담당). stepTimings는 요리 모드를
 * 거쳐 실제 소요시간을 측정한 경우에만 전달된다(직접 "오늘 만들었어요"를 누른 경우는 없음).
 * 생성된 기록의 id를 반환한다 — 냉장고 정리 연결(D. pantry_cleaned_at)에서 이 id로 나중에
 * 정리 완료를 표시하기 위함. */
export async function logCooking(params: {
  recipeId: string;
  householdId: string;
  userId: string;
  /** 실제로 만든 인분(B-6) — 재료 차감(owned=false)이 이 인분 기준이었다는 기록. 호출부가
   * 그 순간 화면에서 보고 있던(또는 요리 모드에 넘겼던) 인분을 그대로 넘긴다. */
  servings: number;
  memo?: string;
  stepTimings?: CookingLogStepTiming[];
  isMultiRecipe?: boolean;
  /** 언제 만들었는지(ISO) — 생략하면 DB 기본값(now())이 적용된다. "요리 기록 직접 추가"에서
   * 과거 날짜를 고른 경우에만 넘긴다. */
  cookedAt?: string;
}): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('cooking_log')
    .insert({
      recipe_id: params.recipeId,
      household_id: params.householdId,
      user_id: params.userId,
      servings: params.servings,
      memo: params.memo?.trim() || null,
      step_timings: params.stepTimings && params.stepTimings.length > 0 ? params.stepTimings : null,
      is_multi_recipe: params.isMultiRecipe ?? false,
      ...(params.cookedAt ? { cooked_at: params.cookedAt } : {}),
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id as string };
}

/** 요리 기록에 사진을 연결한다 — 대표 사진 지정 여부와 무관하게 항상 남겨서 레시피 상세의
 * "우리집에서 만든 모습" 갤러리(4-1)에서 근거로 쓴다. */
export async function setCookingLogImage(cookingLogId: string, imageId: string): Promise<void> {
  const { error } = await supabase.from('cooking_log').update({ image_id: imageId }).eq('id', cookingLogId);
  if (error) throw error;
}

/** 냉장고 정리 완료 표시 — 요리한 사람이 아닌 다른 가구원도 정리할 수 있어(household 공유 작업)
 * SECURITY DEFINER RPC(0024)를 거친다. */
export async function markPantryCleaned(cookingLogId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_pantry_cleaned', { p_cooking_log_id: cookingLogId });
  if (error) throw error;
}

export interface UncleanedCookingLog {
  id: string;
  recipeId: string;
  recipeName: string | null;
  cookedAt: string;
}

/** 최근 3일 이내 요리 기록 중 아직 냉장고 정리를 안 한(pantry_cleaned_at이 null) 가장 최근
 * 것을 찾는다 — 홈 화면 "냉장고 정리 안 함" 안내(A-4)의 근거 데이터. */
export async function fetchUncleanedRecentCookingLog(householdId: string): Promise<UncleanedCookingLog | null> {
  const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('cooking_log')
    .select('id, recipe_id, cooked_at, recipes(title)')
    .eq('household_id', householdId)
    .is('pantry_cleaned_at', null)
    .gte('cooked_at', since)
    .order('cooked_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  return {
    id: row.id as string,
    recipeId: row.recipe_id as string,
    recipeName: (row.recipes as unknown as { title: string } | null)?.title ?? null,
    cookedAt: row.cooked_at as string,
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export interface StepAdjustmentSuggestion {
  stepIndex: number;
  plannedSeconds: number;
  suggestedSeconds: number;
  sampleCount: number;
}

// 대표값(2회면 평균, 3회 이상이면 중앙값)이 설정값과 이만큼 이상 차이 나야 조정을 제안한다.
const ADJUSTMENT_DIFF_THRESHOLD = 0.3;
// 기록이 2회뿐일 때는 그 둘이 이 정도 이내로 일관돼야 신뢰할 수 있다고 보고 제안한다
// (편차가 크면 아직 데이터가 부족한 것으로 보고 더 모은다).
const TWO_SAMPLE_CONSISTENCY_THRESHOLD = 0.3;

/**
 * 레시피의 각 단계에 대해, 실제 측정된 조리 시간(cookSeconds)이 지금 설정된 타이머 값과 꾸준히
 * 다르면 조정을 제안한다. 비교 기준은 각 기록에 박제된 plannedSeconds가 아니라 항상 "지금 이
 * 레시피의 현재 timerSeconds"다 — 안 그러면 한 번 조정을 반영한 뒤에도 예전 기록의 plannedSeconds가
 * 여전히 옛날 값이라 똑같은 제안이 계속 다시 뜨는 문제가 생긴다. 복합 요리 기록(isMultiRecipe)과
 * 타이머를 실제로 쓰지 않은 단계(hadTimer=false)는 계산에서 제외 — CLAUDE.md "요리 모드 실제
 * 소요시간 기록" 항목의 기준을 그대로 구현한다.
 */
export async function fetchStepTimingAdjustments(recipe: {
  id: string;
  steps: { timerSeconds?: number }[];
}): Promise<StepAdjustmentSuggestion[]> {
  const { data, error } = await supabase
    .from('cooking_log')
    .select('step_timings')
    .eq('recipe_id', recipe.id)
    .eq('is_multi_recipe', false);
  if (error) throw error;

  const cookValuesByStep = new Map<number, number[]>();
  for (const row of data ?? []) {
    const timings = (row.step_timings as CookingLogStepTiming[] | null) ?? [];
    for (const timing of timings) {
      if (timing.recipeId !== recipe.id || !timing.hadTimer) continue;
      const values = cookValuesByStep.get(timing.stepIndex) ?? [];
      values.push(timing.cookSeconds);
      cookValuesByStep.set(timing.stepIndex, values);
    }
  }

  const suggestions: StepAdjustmentSuggestion[] = [];
  for (const [stepIndex, cookValues] of cookValuesByStep) {
    const planned = recipe.steps[stepIndex]?.timerSeconds;
    if (!planned || planned <= 0 || cookValues.length < 2) continue;

    let representative: number;
    if (cookValues.length === 2) {
      const [a, b] = cookValues;
      const avg = (a + b) / 2;
      if (avg === 0 || Math.abs(a - b) / avg > TWO_SAMPLE_CONSISTENCY_THRESHOLD) continue;
      representative = avg;
    } else {
      representative = median(cookValues);
    }

    if (Math.abs(representative - planned) / planned < ADJUSTMENT_DIFF_THRESHOLD) continue;
    suggestions.push({
      stepIndex,
      plannedSeconds: planned,
      suggestedSeconds: Math.round(representative),
      sampleCount: cookValues.length,
    });
  }
  return suggestions.sort((a, b) => a.stepIndex - b.stepIndex);
}

/** 오늘 household에서 이미 요리한 기록이 있으면 가장 최근 것의 레시피 이름을 반환한다(홈 화면
 * 인사말 우선순위 1번 — 누가 만들었든 household 공유 기록이라 인정한다). */
export async function fetchTodayCookingLog(householdId: string, dateStr: string): Promise<{ recipeName: string } | null> {
  const { data, error } = await supabase
    .from('cooking_log')
    .select('recipes(title)')
    .eq('household_id', householdId)
    .gte('cooked_at', `${dateStr}T00:00:00`)
    .lt('cooked_at', `${dateStr}T23:59:59.999`)
    .order('cooked_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  // recipes(title)는 to-one 임베드지만 supabase-js 타입 추론이 배열로 잡아서 캐스팅 필요
  // (fetchCookingHistory와 같은 패턴).
  const recipeName = (row.recipes as unknown as { title: string } | null)?.title;
  return recipeName ? { recipeName } : null;
}

/** 이번 달(1일 0시 ~ 지금) household 요리 횟수 — 홈 화면 "이번 달 n번 요리했어요" 진입점(A-2)용. */
export async function fetchMonthlyCookingCount(householdId: string): Promise<number> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const { count, error } = await supabase
    .from('cooking_log')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', householdId)
    .gte('cooked_at', monthStart);
  if (error) throw error;
  return count ?? 0;
}

/** 오늘(0시~지금) household 요리 횟수 — 요리 모드 완료 화면(D-4)의 "오늘 요리 n번째" 통계용.
 * 이 기록 자체가 방금 막 생성된 뒤 호출되므로 그 기록도 포함해서 센다. */
export async function fetchTodayCookingCount(householdId: string): Promise<number> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const { count, error } = await supabase
    .from('cooking_log')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', householdId)
    .gte('cooked_at', todayStart);
  if (error) throw error;
  return count ?? 0;
}

const HISTORY_LIMIT = 50;

export interface CookingLogEntry {
  id: string;
  recipeId: string;
  /** 삭제됐거나(레시피 삭제) 지금 이 계정에 조회 권한이 없으면(예: 다른 가구원의 비공개
   * 레시피) null — 화면에서 "(알 수 없는 레시피)"로 대체 표시 */
  recipeName: string | null;
  authorName: string | null;
  cookedAt: string;
  memo: string | null;
}

/**
 * "요리 기록" 화면(CookingHistoryPage) 전용 — 우리 household의 최근 기록을 최신순으로 가져온다.
 * RLS(cooking_log_select_household)가 이미 household 멤버로 조회 범위를 제한하지만, 여러 조건이
 * OR로 걸린 테이블이 아니라 household_id 하나뿐이라 명시적 필터도 같은 결과 — 다만 다른 화면에서
 * 재사용될 가능성을 감안해 안전하게 household_id로 한 번 더 좁혀서 조회한다.
 */
export async function fetchCookingHistory(householdId: string): Promise<CookingLogEntry[]> {
  // recipes 테이블의 레시피 이름 컬럼은 title이다(Recipe.name은 supabaseAdapter.ts에서 title로
  // 매핑되는 앱 레벨 이름 — DB 컬럼 자체는 title).
  const { data, error } = await supabase
    .from('cooking_log')
    .select('id, recipe_id, cooked_at, memo, recipes(title), profiles(display_name)')
    .eq('household_id', householdId)
    .order('cooked_at', { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) throw error;

  // supabase-js가 select 문자열을 타입 레벨로 파싱할 때 recipes(title)/profiles(display_name)
  // 같은 to-one 임베드도 실제 FK 카디널리티를 몰라 배열 타입으로 추론해서(런타임 값은 항상
  // 단일 객체) 직접 캐스팅이 막힌다 — unknown을 거쳐 실제 런타임 형태로 캐스팅.
  return (data ?? []).map((row) => ({
    id: row.id as string,
    recipeId: row.recipe_id as string,
    recipeName: (row.recipes as unknown as { title: string } | null)?.title ?? null,
    authorName: (row.profiles as unknown as { display_name: string | null } | null)?.display_name ?? null,
    cookedAt: row.cooked_at as string,
    memo: row.memo as string | null,
  }));
}
