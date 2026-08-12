import type { Difficulty, Ingredient, Recipe, Tag } from '../data/types';

const DIFFICULTY_KEYWORDS: { keyword: string; difficulty: Difficulty }[] = [
  { keyword: '쉬운', difficulty: 'easy' },
  { keyword: '쉬움', difficulty: 'easy' },
  { keyword: '초보', difficulty: 'easy' },
  { keyword: '어려운', difficulty: 'hard' },
  { keyword: '어려움', difficulty: 'hard' },
];

const QUICK_KEYWORDS = ['빠른', '간단한', '간단', '빨리'];
const QUICK_MAX_MINUTES = 20;

/**
 * 레시피 검색 매칭(C-1) — 이름/재료명(기존)에 태그 이름/조리 단계 본문을 추가하고, 검색어 안의
 * 난이도·조리시간 키워드("쉬운", "빠른"/"간단" 등)를 인식해 그 자체로 필터 조건을 걸고 나머지
 * 텍스트만 일반 매칭에 쓴다. 예: "쉬운 파스타" → difficulty=easy이면서 어딘가에 "파스타"가
 * 있는 레시피만 통과.
 */
export function matchesRecipeSearch(
  recipe: Recipe,
  query: string,
  ingredientsById: Map<string, Ingredient>,
  tags: Tag[],
): boolean {
  if (!query.trim()) return true;
  let remaining = query;

  for (const { keyword, difficulty } of DIFFICULTY_KEYWORDS) {
    if (remaining.includes(keyword)) {
      if (recipe.difficulty !== difficulty) return false;
      remaining = remaining.replace(keyword, '').trim();
      break;
    }
  }
  for (const keyword of QUICK_KEYWORDS) {
    if (remaining.includes(keyword)) {
      if (recipe.estimatedMinutes == null || recipe.estimatedMinutes > QUICK_MAX_MINUTES) return false;
      remaining = remaining.replace(keyword, '').trim();
      break;
    }
  }
  // 키워드만 있고 남은 텍스트가 없으면(예: 검색어가 "쉬운"뿐) 키워드 조건 통과만으로 충분.
  if (!remaining) return true;

  if (recipe.name.toLowerCase().includes(remaining)) return true;
  if (
    recipe.ingredients.some((item) => ingredientsById.get(item.ingredientId)?.name.toLowerCase().includes(remaining))
  ) {
    return true;
  }
  const recipeTagNames = tags.filter((tag) => recipe.tagIds.includes(tag.id)).map((tag) => tag.name.toLowerCase());
  if (recipeTagNames.some((name) => name.includes(remaining))) return true;
  return recipe.steps.some(
    (step) => step.title.toLowerCase().includes(remaining) || step.content.toLowerCase().includes(remaining),
  );
}
