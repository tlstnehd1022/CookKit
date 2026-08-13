import type { Ingredient, Recipe } from '../data/types';
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
