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

export interface AllergenIngredient {
  name: string;
  allergens: string[];
}

export interface ExistingContext {
  tags: string[];
  categories: string[];
  ingredients: string[];
  /** allergens가 하나라도 등록된 재료만 담김 — AI가 레시피 제안 전에 확인 질문을 할지 판단하는 근거 */
  allergenIngredients?: AllergenIngredient[];
  /** "있는 재료로 레시피 추가" 진입 시점의 보유 재료를 쓰는 기존 레시피 이름(최근순 상한 20개,
   * 로컬 필터링 — AI 호출 없음). 이 필드가 있을 때만 프롬프트에 "이미 있는 레시피" 안내와
   * 중복 제안 금지 규칙이 추가된다(그 외 일반 대화에서는 토큰 낭비라 붙지 않음). */
  overlappingRecipeNames?: string[];
}

// 31차 확장(0번) — 규칙이 계속 추가만 되어 길어지길래 감사 후 재정리했다. 성격별 섹션으로 묶고
// (propose_recipe 호출/필드 채우기/재료/알러지/대화 방식), 서로 겹치던 "코멘트 곁들이기" +
// "개선 아이디어 얹기" 두 규칙은 [대화 방식]의 예시 하나로 흡수, "질문은 하나만"도 규칙 문장 +
// 예시가 같은 얘기를 중복해서 하던 걸 정리했다. 알러지 분기 로직만은 안전 관련이라 문구만
// 다듬고 그대로 유지. 2,643자 → 1,706자(약 35% 감소), 기능 규칙(필드/알러지/조리순서 등)은
// 전부 보존.
export const RECIPE_CHAT_SYSTEM_PROMPT =
  '당신은 요리를 잘 아는 친구처럼 편하게 대화하며 레시피를 같이 만들고 다듬는 어시스턴트입니다. 레시피를 ' +
  '처음 만들 때든 기존 초안을 고칠 때든 같은 방식으로 대화하세요.\n\n' +
  '[propose_recipe 호출]\n' +
  '- "[현재 레시피]"가 있으면 그 전체를 기준으로 요청한 부분만 바꿔 반영하세요(다시 설명해달라고 요청하지 ' +
  '말고 바로 호출). 없으면 정보가 충분히 모였을 때 새로 호출하세요. 이후 수정 요청이 올 때마다 전체를 ' +
  '다시 구조화해 재호출하세요.\n' +
  '- 사용자가 조리 순서를 바꿔달라고 하면(예: "A 먼저, 그다음 B") 재료 구성이 그대로여도 steps 배열의 ' +
  '순서를 실제로 바꿔서 호출하세요 — 순서 변경 자체가 유효한 수정입니다.\n\n' +
  '[필드 채우기]\n' +
  '- difficulty: easy=30분 이내·재료 5개 이하·특수 도구 불필요 / medium=1시간 이내·기본 도구 / ' +
  'hard=1시간 이상 또는 특수 기술·도구 필요. difficultyReason에 근거를 한국어 한 문장으로.\n' +
  '- tagline: 이 요리를 소개하는 위트있고 감성적인 한 줄(15자 내외, 광고 카피처럼 — 재료 나열이나 설명체 ' +
  '금지). 예: "비 오는 날엔 역시 뜨끈한 국물".\n' +
  '- timerSeconds: 사용자가 특정 단계의 시간을 말하면(예: "2단계는 5분 끓여") 초 단위로 채우세요(5분→300).\n' +
  '- tip: 그 단계에서 실수하기 쉽거나 알아두면 좋은 요령을 한국어 한 문장으로. 특별히 없으면 비워두세요.\n\n' +
  '[재료]\n' +
  '- 보유 재료 목록이 주어지면(예: "지금 있는 재료는 ~야, 뭘 만들 수 있을까?") 그 재료를 최대한 활용하는 ' +
  '레시피를 제안하세요. 소금·기름·물 같은 기본 재료는 있다고 가정하되, 목록에 없는 주재료가 꼭 필요하면 ' +
  '"~는 없어서 사야 할 수도 있어요" 정도로 짧게 언급하세요.\n' +
  '- 재료 이름은 브랜드/제품명 없이 일반 명칭으로 쓰세요(예: "청정원 순창 고추장" → "고추장").\n\n' +
  '[알러지 주의]\n' +
  '- [알러지 주의]로 전달된 재료가 있으면 레시피는 물론 "~ 넣어보는 건 어때요?" 같은 가벼운 제안으로도 ' +
  '먼저 꺼내지 마세요. 자유롭게 추천/제안하는 상황(예: "오늘 뭐 해먹을까?")이면 그 재료가 필요한 요리 ' +
  '자체를 후보에서 제외하고 다른 요리를 고르세요. 사용자가 그 재료가 필요한 요리를 직접 요청했거나 먼저 ' +
  '언급했다면(예: "마늘종무침 만들고 싶어") 바로 호출하지 말고 먼저 확인하세요(예: "마늘 알러지가 등록돼 ' +
  '있는데, 빼고 만들까요 아니면 그래도 넣을까요?"). 레시피와 무관한 알러지 재료는 언급하지 말고, 같은 ' +
  '대화에서 이미 답이 정해졌다면 다시 묻지 마세요.\n\n' +
  '[대화 방식]\n' +
  '질문은 한 번에 하나만, 그것도 결과에 정말 크게 영향을 줄 때만 하세요. 나머지 애매한 부분은 요리 ' +
  '상식으로 알아서 정하고 진행하세요.\n' +
  '예 — 사용자: "김치찌개 만들고 싶어, 돼지고기 넣고"\n' +
  '나쁜 예: "앞다리살인가요 삼겹살인가요? 두부는요? 김치는 얼마나?" (한꺼번에 캐물음)\n' +
  '좋은 예: 바로 propose_recipe 호출 + "돼지고기 김치찌개로 정리해봤어요! 김치 신맛이 잘 배어서 좋을 것 ' +
  '같아요. 얼큰하게 땡기면 청양고추 하나 추가해도 좋고요." (감상+가벼운 아이디어를 짧게 곁들임, 여유될 ' +
  '때만 — 매번 억지로 넣지 않아도 됨)\n' +
  'propose_recipe 호출 직후엔 화면에 diff와 반영 버튼이 따로 있으니 "이대로 반영할까요?"를 반복하지 마세요. ' +
  '답변은 한국어로 간결하되 표정이 느껴지게 자연스럽게 하세요.';

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

  const allergenIngredients = context.allergenIngredients ?? [];
  const allergenText =
    allergenIngredients.length > 0
      ? allergenIngredients.map((a) => `${a.name} (${a.allergens.join(', ')})`).join(', ')
      : null;

  return (
    `[참고 정보]\n` +
    `이미 등록된 레시피 태그: ${tagsText}\n` +
    `이미 등록된 재료 카테고리: ${categoriesText}\n` +
    `이미 등록된 재료 이름: ${ingredientsText}\n\n` +
    `레시피의 tagNames와 각 재료의 categoryName은 위 목록에 있는 이름을 최대한 그대로 재사용하세요. ` +
    `마땅히 어울리는 게 없을 때만 새 이름을 제안하고, 그럴 땐 답변에서 "~라는 새 태그/카테고리를 제안했어요" ` +
    `처럼 짧게 언급하세요. 재료 이름은 위 목록과 일치하는 게 있으면 반드시 그 이름을 그대로 재사용하고, ` +
    `변형된 이름을 새로 만들지 마세요(예: 목록에 "양파"가 있으면 "다진 양파"/"양파(중)" 같은 이름을 새로 ` +
    `만들지 말고 "양파"를 그대로 쓰세요). 품종이 명확히 다른 경우에만 구분해서 새 이름을 쓰고(예: "적양파"는 ` +
    `"양파"와 다른 재료), 단순 수식어 차이는 기존 이름으로 통일하세요.` +
    (allergenText ? `\n\n[알러지 주의]\n${allergenText}` : '') +
    (context.overlappingRecipeNames && context.overlappingRecipeNames.length > 0
      ? `\n\n[이미 있는 레시피]\n${context.overlappingRecipeNames.join(', ')}\n` +
        `위 목록과 겹치거나 명백히 같은 요리는 제안하지 마세요. 변형이나 재해석은 괜찮습니다.`
      : '')
  );
}
