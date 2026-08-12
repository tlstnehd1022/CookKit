import type { Ingredient, Recipe } from '../data/types';
import type { CookingStats } from '../data/cookingLog';
import { getExpirationInfo } from './expiration';

function pantryRatio(recipe: Recipe, ingredientsById: Map<string, Ingredient>): number {
  const uniqueIds = Array.from(new Set(recipe.ingredients.map((i) => i.ingredientId)));
  if (uniqueIds.length === 0) return 0;
  const ownedCount = uniqueIds.filter((id) => ingredientsById.get(id)?.owned).length;
  return ownedCount / uniqueIds.length;
}

/** "유통기한 임박"만 대상으로 한다(soon 4~7일은 제외) — 홈 인사말(homeGreeting.ts)의 기준과
 * 같은 판단 기준을 재사용. */
function hasExpiringIngredient(recipe: Recipe, ingredientsById: Map<string, Ingredient>): boolean {
  return recipe.ingredients.some((item) => {
    const info = getExpirationInfo(ingredientsById.get(item.ingredientId)?.expirationDate);
    return info?.level === 'expired' || info?.level === 'urgent';
  });
}

export interface AutoFillAssignment {
  date: string;
  recipe: Recipe;
}

/**
 * 빈 요일에 채울 레시피를 규칙 기반(AI 호출 없이)으로 정한다 — 이미 메뉴가 있는 날짜는 애초에
 * emptyDates에 안 들어있어야 한다(호출부 책임).
 *
 * 우선순위: 보유 재료 매칭률(가중치 3) + 자주 해먹은 정도(가중치 2, 최대 5회로 캡) + 오래
 * 안 해먹은 정도(가중치 1, 최대 30일로 캡 — 한 번도 안 해먹었으면 최댓값 취급)를 합산해 점수를
 * 매기고, 유통기한 임박 재료를 쓰는 레시피는 이 점수와 무관하게 항상 앞쪽으로 정렬해 emptyDates의
 * 앞쪽(이른 요일)부터 배정되게 한다. 같은 레시피가 연달아(바로 다음 빈 날) 나오지 않도록
 * 커서를 돌려가며 다음 후보를 찾는다.
 */
export function buildAutoFillPlan(
  emptyDates: string[],
  recipes: Recipe[],
  ingredientsById: Map<string, Ingredient>,
  cookingStats: Map<string, CookingStats>,
  // "다시 짜기"가 매번 같은 결과를 내지 않도록 시작 커서를 바꿀 수 있게 열어둔다(호출부가 랜덤
  // 값을 넘김) — 그래도 정렬 규칙 자체는 그대로라 "임박 재료 레시피가 앞쪽"이라는 원칙은 유지된다.
  startCursor = 0,
): AutoFillAssignment[] {
  if (recipes.length === 0 || emptyDates.length === 0) return [];

  const scored = recipes
    .map((recipe) => {
      const ratio = pantryRatio(recipe, ingredientsById);
      const stats = cookingStats.get(recipe.id);
      const freqScore = Math.min(stats?.count ?? 0, 5) / 5;
      const daysSinceCooked = stats?.lastCookedAt
        ? (Date.now() - new Date(stats.lastCookedAt).getTime()) / (24 * 60 * 60 * 1000)
        : Infinity;
      const recencyScore = Math.min(daysSinceCooked, 30) / 30;
      const score = ratio * 3 + freqScore * 2 + recencyScore;
      return { recipe, score, urgent: hasExpiringIngredient(recipe, ingredientsById) };
    })
    .sort((a, b) => {
      if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
      return b.score - a.score;
    });

  const assignments: AutoFillAssignment[] = [];
  let prevRecipeId: string | null = null;
  let cursor = startCursor % scored.length;
  for (const date of emptyDates) {
    let picked: Recipe = scored[0].recipe;
    for (let i = 0; i < scored.length; i++) {
      const idx = (cursor + i) % scored.length;
      if (scored[idx].recipe.id !== prevRecipeId) {
        picked = scored[idx].recipe;
        cursor = idx + 1;
        break;
      }
    }
    assignments.push({ date, recipe: picked });
    prevRecipeId = picked.id;
  }
  return assignments;
}
