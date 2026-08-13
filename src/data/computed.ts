import type { Ingredient, Recipe } from './types';
import { isPantryUsable } from '../lib/pantryAvailability';

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

/** 레시피가 쓰는 재료 전부가 usable(보유 + 유통기한 안 지남)인지 — "🧺 보유 재료로 가능"
 * 필터/배너(RecipesPage, IngredientsPage)가 공유하는 판단 기준. 유통기한이 지나 확인이 필요한
 * 재료(expired_unconfirmed)는 있다고 치지 않는다. 재료가 하나도 없는 레시피는 대상에서 제외한다. */
export function isRecipeMakeableWithPantry(recipe: Recipe, ingredientsById: Map<string, Ingredient>): boolean {
  if (recipe.ingredients.length === 0) return false;
  return recipe.ingredients.every((item) => isPantryUsable(ingredientsById.get(item.ingredientId)));
}
