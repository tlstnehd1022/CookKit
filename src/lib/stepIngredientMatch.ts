import type { Ingredient, RecipeIngredient, RecipeStep } from '../data/types';

/**
 * 조리 단계가 실제로 어떤 재료를 쓰는지 알려주는 명시적 매핑 필드가 없어서(RecipeStep에
 * ingredientIds 같은 필드가 없음), 그 단계의 제목+본문 텍스트 안에 재료 이름이 등장하는지로
 * 판단한다 — 완벽하진 않지만("다진 마늘"을 "마늘"이 매칭하는 정도는 되고, 반대로 이름이 아예
 * 다르게 적힌 경우는 놓칠 수 있음) 별도 데이터 입력 없이 바로 쓸 수 있어 요리 모드(D-2)의
 * "이 단계에서 쓰는 재료" 칩에 채택했다.
 */
export function findStepIngredients(
  step: RecipeStep,
  recipeIngredients: RecipeIngredient[],
  ingredientsById: Map<string, Ingredient>,
): RecipeIngredient[] {
  const text = `${step.title} ${step.content}`;
  return recipeIngredients.filter((item) => {
    const name = ingredientsById.get(item.ingredientId)?.name.trim();
    return name && name.length > 0 && text.includes(name);
  });
}
