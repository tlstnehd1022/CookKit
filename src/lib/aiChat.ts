import type { ExtractedRecipe } from './claudeClient';
import type { RecipeSnapshot } from './recipeDiff';

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface ChatResult {
  reply: string;
  updatedRecipe: ExtractedRecipe | null;
}

export interface ExistingContext {
  tags: string[];
  categories: string[];
  ingredients: string[];
}

export const RECIPE_CHAT_SYSTEM_PROMPT =
  '당신은 사용자가 요리 레시피를 만들고 다듬도록 돕는 어시스턴트입니다. 사용자가 레시피를 처음 설명하는 ' +
  '경우든, 이미 만들어진 초안을 수정해달라는 경우든 같은 방식으로 대화하세요. ' +
  '아래에 "[현재 레시피]" 정보가 주어지면, 그것이 지금 화면에 이미 저장/작성돼 있는 내용입니다. 사용자가 ' +
  '"이 레시피를 더 맵게/간단하게 해줘"처럼 말하면 이 현재 레시피 전체를 기준으로 요청한 부분만 바꾸고 ' +
  '나머지는 그대로 유지해서 propose_recipe를 호출하세요(현재 레시피를 다시 설명해달라고 요청할 필요 없음). ' +
  '사용자의 설명에 여러 방식이 있을 수 있는 애매한 부분이 있으면(예: 재료를 사서 쓰는지 직접 만드는지, ' +
  '수량이 불명확한지) propose_recipe를 호출하기 전에 먼저 한국어로 짧게 되물어보세요. ' +
  '충분한 정보가 모이면 propose_recipe 도구를 호출해 현재까지 파악한 레시피 전체를 구조화된 형태로 제시하세요. ' +
  '이후 사용자가 수정을 요청하면(예: "고추기름은 직접 만드는 걸로 바꿔줘") 다시 propose_recipe를 호출해 ' +
  '전체 레시피를 갱신해서 제시하세요. 답변은 한국어로 간결하게 하세요.';

/** 지금 폼에 이미 채워진 레시피 내용을 프롬프트에 넣어서, 대화가 처음이어도 AI가 "현재 레시피"를 알게 한다. */
export function buildCurrentRecipeNote(recipe: RecipeSnapshot): string | null {
  const hasContent = recipe.name.trim() || recipe.ingredients.length > 0 || recipe.steps.length > 0;
  if (!hasContent) return null;

  const ingredientsText =
    recipe.ingredients.length > 0
      ? recipe.ingredients.map((i) => `${i.name} ${i.amount}${i.unit}`).join(', ')
      : '(없음)';
  const stepsText =
    recipe.steps.length > 0
      ? recipe.steps.map((s, i) => `${i + 1}. ${s.title}: ${s.content}`).join('\n')
      : '(없음)';
  const tagsText = recipe.tagNames.length > 0 ? recipe.tagNames.join(', ') : '(없음)';

  return (
    `[현재 레시피]\n` +
    `이름: ${recipe.name || '(아직 이름 없음)'}\n` +
    `기준 인분: ${recipe.servingsBase}인분\n` +
    `재료: ${ingredientsText}\n` +
    `조리순서:\n${stepsText}\n` +
    `태그: ${tagsText}`
  );
}

/** 기존 태그/카테고리/재료 이름을 프롬프트에 알려줘서, AI가 새로 만들기보다 기존 것을 재사용하도록 유도한다. */
export function buildExistingContextNote(context: ExistingContext): string {
  const tagsText = context.tags.length > 0 ? context.tags.join(', ') : '(아직 없음)';
  const categoriesText = context.categories.length > 0 ? context.categories.join(', ') : '(아직 없음)';
  const ingredientsText = context.ingredients.length > 0 ? context.ingredients.join(', ') : '(아직 없음)';

  return (
    `[참고 정보]\n` +
    `이미 등록된 레시피 태그: ${tagsText}\n` +
    `이미 등록된 재료 카테고리: ${categoriesText}\n` +
    `이미 등록된 재료 이름: ${ingredientsText}\n\n` +
    `레시피의 tagNames와 각 재료의 categoryName은 위 목록에 있는 이름을 최대한 그대로 재사용하세요. ` +
    `마땅히 어울리는 게 없을 때만 새 이름을 제안하고, 그럴 땐 답변에서 "~라는 새 태그/카테고리를 제안했어요" ` +
    `처럼 짧게 언급하세요. 재료도 이미 있는 것과 같은 재료면 목록의 이름을 그대로 사용하세요.`
  );
}
