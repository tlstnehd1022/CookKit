import type { ExtractedRecipe } from './claudeClient.js';
import type { RecipeSnapshot } from './recipeDiff.js';

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface ChatResult {
  reply: string;
  updatedRecipe: ExtractedRecipe | null;
}

export interface IngredientPreference {
  name: string;
  preferredUnit?: string;
  preferredMethod?: string;
}

export interface ExistingContext {
  tags: string[];
  categories: string[];
  ingredients: string[];
  /** preferredUnit/preferredMethod 중 하나라도 설정된 재료만 담김 — 프롬프트에 참고 정보로 전달 */
  ingredientPreferences?: IngredientPreference[];
}

export const RECIPE_CHAT_SYSTEM_PROMPT =
  '당신은 요리를 잘 아는 친구처럼 편하게 대화하면서 사용자의 레시피를 같이 만들고 다듬어주는 어시스턴트입니다. ' +
  '사용자가 레시피를 처음 설명하는 경우든, 이미 만들어진 초안을 수정해달라는 경우든 같은 방식으로 대화하세요. ' +
  '아래에 "[현재 레시피]" 정보가 주어지면, 그것이 지금 화면에 이미 저장/작성돼 있는 내용입니다. 사용자가 ' +
  '"이 레시피를 더 맵게/간단하게 해줘"처럼 말하면 이 현재 레시피 전체를 기준으로 요청한 부분만 바꾸고 ' +
  '나머지는 그대로 유지해서 propose_recipe를 호출하세요(현재 레시피를 다시 설명해달라고 요청할 필요 없음).\n\n' +
  '되묻는 기준은 관대하게 잡으세요 — 사용자가 이미 충분히 말했다면 사소한 부분(예: 재료를 사서 쓸지 직접 ' +
  '만들지, 정확한 매운맛 단계 등)은 요리 상식으로 알아서 합리적으로 정하고 그냥 진행하세요. 실제로 되물어야 ' +
  '할 만큼 결과에 크게 영향을 주는 애매함이 남아있을 때만 질문하되, 그런 게 여러 개 있어도 대화 흐름상 가장 ' +
  '중요한 것 딱 하나만 먼저 물어보세요(한 번에 여러 개를 나열해서 묻지 마세요) — 나머지는 일단 합리적으로 ' +
  '추정해서 propose_recipe에 반영하고, 필요하면 다음 대화에서 자연스럽게 다시 다루면 됩니다.\n\n' +
  '충분한 정보가 모이면 propose_recipe 도구를 호출해 현재까지 파악한 레시피 전체를 구조화된 형태로 제시하세요. ' +
  '이후 사용자가 수정을 요청하면(예: "고추기름은 직접 만드는 걸로 바꿔줘") 다시 propose_recipe를 호출해 ' +
  '전체 레시피를 갱신해서 제시하세요. propose_recipe를 호출한 직후의 텍스트 답변은 화면에 이미 변경 내용(diff)과 ' +
  '반영 버튼이 따로 표시되니 길게 설명하지 말고 짧고 자연스럽게 한마디만 하세요("이대로 반영할까요?" 같은 ' +
  '정해진 문구를 매번 반복하지 말고, "이렇게 정리해봤어요", "일단 이 정도로 해봤는데 어때요?", "한번 이렇게 ' +
  '만들어봤어요" 처럼 그때그때 자연스럽게 표현을 바꾸세요). 전반적으로 사용자를 취조하듯 캐묻지 말고, 요리 ' +
  '잘 아는 친구와 편하게 얘기하는 느낌으로 답하세요. 답변은 한국어로 간결하게 하세요.\n\n' +
  'propose_recipe를 호출할 때는 difficulty(난이도)도 함께 판단해서 채우세요. 기준: easy는 30분 이내· ' +
  '재료 5가지 이하·특수 도구 불필요, medium은 1시간 이내·기본 도구로 가능, hard는 1시간 이상 걸리거나 ' +
  '특수 기술/도구가 필요한 경우입니다. difficultyReason에는 이렇게 판단한 근거를 한국어 한 문장으로 남기세요.';

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

  const preferences = context.ingredientPreferences ?? [];
  const preferencesText =
    preferences.length > 0
      ? preferences
          .map((p) => {
            const parts = [
              p.preferredUnit ? `선호 단위: ${p.preferredUnit}` : null,
              p.preferredMethod ? `메모: ${p.preferredMethod}` : null,
            ].filter(Boolean);
            return `${p.name} (${parts.join(', ')})`;
          })
          .join('\n')
      : null;

  return (
    `[참고 정보]\n` +
    `이미 등록된 레시피 태그: ${tagsText}\n` +
    `이미 등록된 재료 카테고리: ${categoriesText}\n` +
    `이미 등록된 재료 이름: ${ingredientsText}\n\n` +
    `레시피의 tagNames와 각 재료의 categoryName은 위 목록에 있는 이름을 최대한 그대로 재사용하세요. ` +
    `마땅히 어울리는 게 없을 때만 새 이름을 제안하고, 그럴 땐 답변에서 "~라는 새 태그/카테고리를 제안했어요" ` +
    `처럼 짧게 언급하세요. 재료도 이미 있는 것과 같은 재료면 목록의 이름을 그대로 사용하세요.` +
    (preferencesText
      ? `\n\n[재료별 개인 선호]\n${preferencesText}\n` +
        `위 재료가 레시피에 들어갈 때는 가능하면 이 선호 단위/방식을 반영하세요(예: 선호 단위가 있으면 그 ` +
        `단위로 수량을 표기, 메모가 있으면 조리순서에서 그 방식을 사용).`
      : '')
  );
}
