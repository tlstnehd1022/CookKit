import type { Ingredient, Recipe } from '../data/types';
import type { CookingStats } from '../data/cookingLog';
import { getPantryAvailability } from './pantryAvailability';

export interface RecommendationResult {
  recipe: Recipe;
  /** usable(보유 + 유통기한 안 지남) 재료 개수 — A-5: 유통기한 지나 확인이 필요한 재료는 있다고
   * 치지 않는다. */
  ownedCount: number;
  totalCount: number;
  /** 유통기한이 지나 확인이 필요한(expired_unconfirmed) 재료 개수 — "확인 필요 N개"로 별도 표기 */
  unconfirmedCount: number;
}

function scoreRecipe(recipe: Recipe, ingredientsById: Map<string, Ingredient>): RecommendationResult | null {
  const uniqueIds = Array.from(new Set(recipe.ingredients.map((i) => i.ingredientId)));
  if (uniqueIds.length === 0) return null;
  let ownedCount = 0;
  let unconfirmedCount = 0;
  for (const id of uniqueIds) {
    const ingredient = ingredientsById.get(id);
    if (!ingredient) continue;
    const availability = getPantryAvailability(ingredient);
    if (availability === 'usable') ownedCount += 1;
    else if (availability === 'expired_unconfirmed') unconfirmedCount += 1;
  }
  return { recipe, ownedCount, totalCount: uniqueIds.length, unconfirmedCount };
}

/** 보유 재료 매칭률(owned/total)이 가장 높은 레시피 하나를 고른다 — 홈 화면 "오늘의 추천"용.
 * 복잡한 알고리즘 없이 단순 비율 비교(동률이면 먼저 나온 레시피). */
export function pickTodayRecommendation(
  recipes: Recipe[],
  ingredientsById: Map<string, Ingredient>,
): RecommendationResult | null {
  let best: RecommendationResult | null = null;
  for (const recipe of recipes) {
    const scored = scoreRecipe(recipe, ingredientsById);
    if (!scored) continue;
    const bestRatio = best ? best.ownedCount / best.totalCount : -1;
    if (scored.ownedCount / scored.totalCount > bestRatio) best = scored;
  }
  return best;
}

export type RecommendationReason = 'pantry' | 'quick' | 'frequent';

export interface RecommendationCandidate extends RecommendationResult {
  reason: RecommendationReason;
}

const QUICK_MAX_MINUTES = 20;
// mealPlanAutoFill.ts의 "자주 해먹은 정도(가중치 2, 최대 5회 캡) + 오래 안 해먹은 정도(가중치 1,
// 최대 30일 캡)" 점수 로직을 그대로 재사용 — 한 번도 안 해먹은 레시피는 애초에 이 후보에서
// 제외한다(count===0이면 "자주 해먹지만"이라는 전제 자체가 성립하지 않으므로).
function frequentButNotRecentScore(stats: CookingStats): number {
  const freqScore = Math.min(stats.count, 5) / 5;
  const daysSinceCooked = stats.lastCookedAt
    ? (Date.now() - new Date(stats.lastCookedAt).getTime()) / (24 * 60 * 60 * 1000)
    : Infinity;
  const recencyScore = Math.min(daysSinceCooked, 30) / 30;
  return freqScore * 2 + recencyScore;
}

/**
 * 홈 화면 "오늘 뭐 먹지?" 카드 — 서로 다른 이유를 가진 후보를 최대 3개까지 뽑는다: 보유 재료
 * 매칭률 1위(pantry), 20분 이내 중 매칭률 1위(quick), 자주 해먹지만 최근엔 안 먹은 것(frequent).
 * 이미 앞에서 뽑힌 레시피는 뒤 후보에서 제외해 서로 다른 레시피가 되게 하고, 후보가 부족하면
 * 있는 것만 반환한다(무리해서 채우지 않음 — 호출부가 length===0이면 섹션을 숨긴다).
 */
export function pickTodayRecommendations(
  recipes: Recipe[],
  ingredientsById: Map<string, Ingredient>,
  cookingStats: Map<string, CookingStats>,
): RecommendationCandidate[] {
  const picked: RecommendationCandidate[] = [];
  const usedIds = new Set<string>();

  const pantryBest = pickTodayRecommendation(recipes, ingredientsById);
  if (pantryBest) {
    picked.push({ ...pantryBest, reason: 'pantry' });
    usedIds.add(pantryBest.recipe.id);
  }

  const quickCandidates = recipes.filter(
    (r) => !usedIds.has(r.id) && r.estimatedMinutes != null && r.estimatedMinutes <= QUICK_MAX_MINUTES,
  );
  const quickBest = pickTodayRecommendation(quickCandidates, ingredientsById);
  if (quickBest) {
    picked.push({ ...quickBest, reason: 'quick' });
    usedIds.add(quickBest.recipe.id);
  }

  const frequentRanked = recipes
    .filter((r) => !usedIds.has(r.id))
    .map((recipe) => {
      const stats = cookingStats.get(recipe.id);
      if (!stats || stats.count === 0) return null;
      return { recipe, score: frequentButNotRecentScore(stats) };
    })
    .filter((c): c is { recipe: Recipe; score: number } => c !== null)
    .sort((a, b) => b.score - a.score);
  for (const candidate of frequentRanked) {
    const scored = scoreRecipe(candidate.recipe, ingredientsById);
    if (scored) {
      picked.push({ ...scored, reason: 'frequent' });
      break;
    }
  }

  return picked;
}

const OVERLAPPING_RECIPES_LIMIT = 20;

/** "있는 재료로 레시피 추가" 진입 시점의 보유 재료 중 하나 이상을 쓰는 기존 레시피를 뽑는다 —
 * AI 호출 없이 로컬에서 단순 재료 매칭만 하고, 결과는 이름만 프롬프트에 실어 "이미 있는
 * 레시피"로 알려줘 중복 제안을 줄이는 데 쓴다(토큰 절약을 위해 최근 추가순 상한). */
export function pickRecipesUsingAnyIngredient(
  recipes: Recipe[],
  ingredientIds: Set<string>,
  limit = OVERLAPPING_RECIPES_LIMIT,
): Recipe[] {
  if (ingredientIds.size === 0) return [];
  const matched = recipes.filter((recipe) => recipe.ingredients.some((i) => ingredientIds.has(i.ingredientId)));
  const sorted = [...matched].sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });
  return sorted.slice(0, limit);
}

/** 특정 재료를 쓰는 레시피 중 보유 재료 매칭률이 가장 높은 것 — "유통기한이 다가와요" 행의
 * "레시피" 버튼용(이 재료를 마침 쓰는 레시피를 추천). */
export function pickBestRecipeUsingIngredient(
  recipes: Recipe[],
  ingredientsById: Map<string, Ingredient>,
  ingredientId: string,
): RecommendationResult | null {
  const candidates = recipes.filter((r) => r.ingredients.some((i) => i.ingredientId === ingredientId));
  return pickTodayRecommendation(candidates, ingredientsById);
}
