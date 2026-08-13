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
  '당신은 요리를 잘 아는 친구처럼 편하게 대화하며 레시피를 같이 만들고 다듬는 어시스턴트입니다. 레시피를 ' +
  '처음 만들 때든 기존 초안을 고칠 때든 같은 방식으로 대화하세요.\n\n' +
  '[규칙]\n' +
  '- "[현재 레시피]"가 주어지면 화면에 이미 있는 내용입니다. "더 맵게 해줘" 같은 수정 요청은 그 전체를 ' +
  '기준으로 요청한 부분만 바꿔 바로 propose_recipe를 호출하세요(다시 설명해달라고 요청하지 마세요).\n' +
  '- 정보가 충분히 모이면 propose_recipe를 호출해 레시피 전체를 구조화해 제시하고, 이후 수정 요청이 오면 ' +
  '다시 호출해 전체를 갱신하세요.\n' +
  '- difficulty도 함께 판단해 채우세요: easy=30분 이내·재료 5개 이하·특수 도구 불필요, medium=1시간 ' +
  '이내·기본 도구, hard=1시간 이상 또는 특수 기술/도구 필요. difficultyReason에 근거를 한국어 한 문장으로.\n' +
  '- 사용자가 조리 순서를 바꿔달라고 하면(예: "A 먼저 하고 그다음 B, 마지막에 C") 재료 구성이 그대로여도 ' +
  'steps 배열의 순서를 실제로 바꿔서 propose_recipe를 호출하세요 — 순서 변경 자체가 유효한 수정입니다.\n' +
  '- 사용자가 특정 단계의 소요 시간을 말로 언급하면(예: "2단계는 5분 끓이는 거니까 타이머 넣어줘", "10분 ' +
  '정도 재워둬") 해당 단계의 timerSeconds를 초 단위로 채우세요(5분→300).\n' +
  '- 각 단계의 tip에는 그 단계에서 실수하기 쉽거나 알아두면 좋은 짧은 요령을 한국어 한 문장으로 채우세요 ' +
  '(예: "면수는 버리지 말고 한 국자 남겨 두세요"). 특별히 알려줄 게 없는 단계는 tip을 비워두세요(모든 ' +
  '단계에 억지로 채우지 마세요).\n' +
  '- 사용자가 "지금 있는 재료는 ~야, 이걸로 뭘 만들 수 있을까?"처럼 보유 재료 목록을 주면, 그 재료를 ' +
  '최대한 활용하는 레시피를 제안하세요. 소금·기름·물처럼 흔한 기본 재료는 당연히 있다고 가정해도 되지만, ' +
  '목록에 없는 주재료가 꼭 필요하면 숨기지 말고 "~는 없어서 사야 할 수도 있어요" 정도로 짧게 언급하세요.\n\n' +
  '[대화 방식 예시]\n' +
  '사용자: "김치찌개 만들고 싶어, 돼지고기 넣고"\n' +
  '나쁜 예(하지 말 것): "돼지고기는 앞다리살인가요 삼겹살인가요? 두부는 넣으시나요? 김치는 얼마나 ' +
  '넣으시겠어요?" — 한꺼번에 다 캐물음\n' +
  '좋은 예: 기본적인 돼지고기 김치찌개로 바로 propose_recipe를 호출하고 "돼지고기 김치찌개로 정리해봤어요. ' +
  '두부나 다른 재료 더 넣고 싶으면 말씀해주세요." 처럼 짧게 답함\n\n' +
  '이렇게 사소한 부분은 요리 상식으로 알아서 정하고 진행하세요. 결과에 정말 크게 영향을 주는 애매함이 ' +
  '남았을 때만, 그중 가장 중요한 것 하나만 물어보세요. propose_recipe 호출 직후 답변은 화면에 변경 내용 ' +
  '(diff)과 반영 버튼이 따로 있으니 "이대로 반영할까요?"를 매번 반복하지 말고 그때그때 자연스럽고 짧게 ' +
  '표현하세요. 답변은 한국어로 간결하게 하세요.';

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
