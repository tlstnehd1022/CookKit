import { supabase } from '../lib/supabaseClient';
import { rowToRecipe } from './supabaseAdapter';
import type { Recipe } from './types';

// "둘러보기" 화면 전용 — 다른 household의 공개(is_public=true) 레시피를 조회한다.
// household 공유 store(store.ts)와 달리 계속 구독하는 캐시가 아니라 화면 진입 시 1회 조회하는
// 방식으로 충분하다(다른 사람 레시피는 실시간으로 계속 바뀔 일이 적고, 매번 새로 불러와도 됨).
export interface PublicRecipeEntry {
  recipe: Recipe;
  tagNames: string[];
  authorName: string;
  /** 이미 이 레시피를 복사해서 내 레시피로 갖고 있는지(source_recipe_id로 추적) */
  alreadyCopied: boolean;
}

export interface PublicRecipesResult {
  entries: PublicRecipeEntry[];
  /** 재료 이름 검색/표시용 — recipes.content(jsonb)는 조인이 안 돼서 별도로 모아 조회함 */
  ingredientNameById: Map<string, string>;
}

export async function fetchPublicRecipes(
  currentUserId: string,
  myRecipes: Recipe[],
): Promise<PublicRecipesResult> {
  const { data, error } = await supabase
    .from('recipes')
    .select('*, recipe_tags(tag_id, tags(name)), profiles(display_name, email)')
    .eq('is_public', true)
    .neq('user_id', currentUserId);
  if (error) throw error;
  const rows = data ?? [];

  // 재료 이름 해석 — 이 배치가 참조하는 ingredientId를 전부 모아서 한 번에 조회한다.
  const allIngredientIds = new Set<string>();
  for (const row of rows) {
    const content = row.content as { ingredients?: { ingredientId: string }[] } | null;
    for (const item of content?.ingredients ?? []) {
      if (item.ingredientId) allIngredientIds.add(item.ingredientId);
    }
  }
  let ingredientNameById = new Map<string, string>();
  if (allIngredientIds.size > 0) {
    const { data: ingRows, error: ingError } = await supabase
      .from('ingredients')
      .select('id, name')
      .in('id', Array.from(allIngredientIds));
    if (ingError) throw ingError;
    ingredientNameById = new Map((ingRows ?? []).map((r) => [r.id as string, r.name as string]));
  }

  const copiedSourceIds = new Set(
    myRecipes.map((r) => r.sourceRecipeId).filter((id): id is string => Boolean(id)),
  );

  const entries: PublicRecipeEntry[] = rows.map((row) => {
    const recipe = rowToRecipe(row);
    const recipeTags = (row.recipe_tags as { tag_id: string; tags: { name: string } | null }[] | null) ?? [];
    const tagNames = recipeTags.map((rt) => rt.tags?.name).filter((n): n is string => Boolean(n));
    const profile = row.profiles as { display_name: string | null; email: string | null } | null;
    const authorName = profile?.display_name || profile?.email || '알 수 없음';
    return { recipe, tagNames, authorName, alreadyCopied: copiedSourceIds.has(recipe.id) };
  });

  return { entries, ingredientNameById };
}
