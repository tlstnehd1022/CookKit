// 레시피 신규 추가 화면의 "대화로 만들기"/"유튜브로 만들기" 탭 중 마지막으로 쓴 탭을 기억한다
// (기기별 UI 취향이라 viewMode.ts와 같은 방식으로 localStorage에만 저장, household 공유 아님).
export type RecipeAddTab = 'chat' | 'youtube';

const STORAGE_KEY = 'cookkit:recipeAddTab';

export function getRecipeAddTab(): RecipeAddTab {
  return localStorage.getItem(STORAGE_KEY) === 'youtube' ? 'youtube' : 'chat';
}

export function setRecipeAddTab(tab: RecipeAddTab) {
  localStorage.setItem(STORAGE_KEY, tab);
}
