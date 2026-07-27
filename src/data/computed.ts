import type { Ingredient, Recipe } from './types';

/** 레시피가 사용하는 재료들의 allergens를 모아 중복 제거한 값을 계산한다. */
export function computeRecipeAllergens(
  recipe: Recipe,
  ingredientsById: Map<string, Ingredient>,
): string[] {
  const allergens = new Set<string>();
  for (const item of recipe.ingredients) {
    const ingredient = ingredientsById.get(item.ingredientId);
    ingredient?.allergens.forEach((allergen) => allergens.add(allergen));
  }
  return Array.from(allergens);
}

/** 모든 재료 데이터에 등장하는 알러지 성분 전체 목록(필터용). */
export function collectAllAllergens(ingredients: Ingredient[]): string[] {
  const allergens = new Set<string>();
  ingredients.forEach((ingredient) => ingredient.allergens.forEach((a) => allergens.add(a)));
  return Array.from(allergens);
}

/** 인분 수에 비례해 재료 수량을 재계산한다. */
export function scaleAmount(amount: number, servingsBase: number, servings: number): number {
  if (servingsBase <= 0) return amount;
  const scaled = (amount / servingsBase) * servings;
  return Math.round(scaled * 100) / 100;
}

/** 조리 단계 타이머가 있는 단계들의 시간을 모두 더한 대략적인 총 조리시간(분) — 타이머 없는 단계는 집계 안 됨. */
export function computeTotalCookMinutes(recipe: Recipe): number {
  const totalSeconds = recipe.steps.reduce((sum, step) => sum + (step.timerSeconds ?? 0), 0);
  return Math.round(totalSeconds / 60);
}
