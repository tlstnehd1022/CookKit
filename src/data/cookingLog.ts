import { supabase } from '../lib/supabaseClient';

// recipeLikes.ts/publicRecipes.ts와 같은 이유로 .in()에 넘기는 recipe id 배열을 청크로 나눈다
// (URL 길이 제한 회피).
const IN_QUERY_CHUNK_SIZE = 150;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

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
 * 사용자가 체크한 재료에 대해 별도로 처리한다(이 함수는 기록만 담당). */
export async function logCooking(params: {
  recipeId: string;
  householdId: string;
  userId: string;
  memo?: string;
}): Promise<void> {
  const { error } = await supabase.from('cooking_log').insert({
    recipe_id: params.recipeId,
    household_id: params.householdId,
    user_id: params.userId,
    memo: params.memo?.trim() || null,
  });
  if (error) throw error;
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
