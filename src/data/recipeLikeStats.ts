import { supabase } from '../lib/supabaseClient';
import { chunk, IN_QUERY_CHUNK_SIZE } from '../lib/chunk';
import { fetchPublicRecipes, SYSTEM_USER_ID, type PublicRecipeEntry } from './publicRecipes';
import type { Recipe } from './types';

// 홈 "🔥 요즘 인기 있는 레시피"/"💬 이번 주 반응 요약" 둘 다 recipe_likes를 기간으로 걸러
// 집계하는 방식이 비슷해서 한 파일에 모아둔다.

const RECENT_DAYS = 7;
const FALLBACK_DAYS = 30;
const POPULAR_MIN_COUNT = 3;
const POPULAR_LIMIT = 10;

export interface PopularRecipeEntry {
  entry: PublicRecipeEntry;
  /** 실제로 랭킹에 쓰인 기간(7일 또는 폴백된 30일) 기준 좋아요 개수 */
  likeCount: number;
}

export interface PopularRecipesResult {
  items: PopularRecipeEntry[];
  /** PublicRecipeDetailPage가 재료 이름 표시에 필요로 하는 맵 — fetchPublicRecipes 결과를 그대로 전달 */
  ingredientNameById: Map<string, string>;
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** 다른 household의 공개 레시피 중 최근 좋아요를 많이 받은 순 — 최근 7일 집계가 너무 적으면
 * (3개 미만) 30일로 확대하고, 그래도 부족하면 빈 배열(섹션 자체를 숨기라는 신호)을 반환한다. */
export async function fetchPopularPublicRecipes(
  currentUserId: string,
  currentHouseholdId: string,
  myRecipes: Recipe[],
): Promise<PopularRecipesResult> {
  const { entries, ingredientNameById } = await fetchPublicRecipes(currentUserId, currentHouseholdId, myRecipes);
  // 공공데이터 시드 레시피(SYSTEM_USER_ID)는 "다른 사람이 만든" 레시피가 아니라 둘러보기에서도
  // 별도 섹션으로 분리해두므로 여기서도 제외한다.
  const candidates = entries.filter((e) => e.authorUserId !== SYSTEM_USER_ID);
  if (candidates.length === 0) return { items: [], ingredientNameById };

  const recipeIds = candidates.map((e) => e.recipe.id);
  const fallbackCutoff = daysAgoIso(FALLBACK_DAYS);
  const rows = (
    await Promise.all(
      chunk(recipeIds, IN_QUERY_CHUNK_SIZE).map(async (ids) => {
        const { data, error } = await supabase
          .from('recipe_likes')
          .select('recipe_id, created_at')
          .in('recipe_id', ids)
          .gte('created_at', fallbackCutoff);
        if (error) throw error;
        return data ?? [];
      }),
    )
  ).flat();

  const recentCutoffMs = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;
  const recentCounts = new Map<string, number>();
  const fallbackCounts = new Map<string, number>();
  for (const row of rows) {
    const recipeId = row.recipe_id as string;
    fallbackCounts.set(recipeId, (fallbackCounts.get(recipeId) ?? 0) + 1);
    if (new Date(row.created_at as string).getTime() >= recentCutoffMs) {
      recentCounts.set(recipeId, (recentCounts.get(recipeId) ?? 0) + 1);
    }
  }

  const counts = recentCounts.size >= POPULAR_MIN_COUNT ? recentCounts : fallbackCounts;
  if (counts.size < POPULAR_MIN_COUNT) return { items: [], ingredientNameById };

  const items = candidates
    .map((entry) => ({ entry, likeCount: counts.get(entry.recipe.id) ?? 0 }))
    .filter((item) => item.likeCount > 0)
    .sort((a, b) => b.likeCount - a.likeCount)
    .slice(0, POPULAR_LIMIT);
  return { items, ingredientNameById };
}

/** 최근 7일 이내 내 소유 레시피들에 새로 달린 좋아요 총 개수(레시피별이 아니라 전체 합산) —
 * 홈의 "이번 주 내 레시피가 좋아요 N개를 받았어요" 요약 카드용. */
export async function fetchMyRecentLikeCount(myOwnRecipeIds: string[]): Promise<number> {
  if (myOwnRecipeIds.length === 0) return 0;
  const cutoff = daysAgoIso(RECENT_DAYS);
  const rows = (
    await Promise.all(
      chunk(myOwnRecipeIds, IN_QUERY_CHUNK_SIZE).map(async (ids) => {
        const { data, error } = await supabase
          .from('recipe_likes')
          .select('recipe_id')
          .in('recipe_id', ids)
          .gte('created_at', cutoff);
        if (error) throw error;
        return data ?? [];
      }),
    )
  ).flat();
  return rows.length;
}
