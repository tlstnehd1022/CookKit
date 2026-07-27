import { supabase } from '../lib/supabaseClient';
import type { CrudRepository } from './repository';
import type { Category, Ingredient, Recipe, Tag } from './types';

// household 단위로 공유되는 단순 테이블(categories/tags) 공용 팩토리.
// ingredients/recipes는 컬럼 매핑이 더 복잡해서(예: recipes는 태그 조인) 별도로 구현한다.
function createHouseholdRepository<T extends { id: string }>(
  table: string,
  householdId: string,
  toRow: (item: T) => Record<string, unknown>,
  fromRow: (row: Record<string, unknown>) => T,
): CrudRepository<T> {
  return {
    async getAll() {
      const { data, error } = await supabase.from(table).select('*').eq('household_id', householdId);
      if (error) throw error;
      return (data ?? []).map(fromRow);
    },
    async get(id) {
      const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? fromRow(data) : undefined;
    },
    async save(item) {
      const { error } = await supabase
        .from(table)
        .upsert({ ...toRow(item), household_id: householdId });
      if (error) throw error;
    },
    async delete(id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
    },
    async replaceAll(items) {
      // 백업 가져오기(전체 교체)용 — 지금 household의 기존 행을 지우고 새로 채운다.
      const { error: deleteError } = await supabase.from(table).delete().eq('household_id', householdId);
      if (deleteError) throw deleteError;
      if (items.length === 0) return;
      const rows = items.map((item) => ({ ...toRow(item), household_id: householdId }));
      const { error: insertError } = await supabase.from(table).insert(rows);
      if (insertError) throw insertError;
    },
  };
}

export function createCategoriesRepository(householdId: string): CrudRepository<Category> {
  return createHouseholdRepository<Category>(
    'categories',
    householdId,
    (category) => ({ id: category.id, name: category.name }),
    (row) => ({ id: row.id as string, name: row.name as string }),
  );
}

export function createTagsRepository(householdId: string): CrudRepository<Tag> {
  return createHouseholdRepository<Tag>(
    'tags',
    householdId,
    (tag) => ({ id: tag.id, name: tag.name, type: tag.type }),
    (row) => ({ id: row.id as string, name: row.name as string, type: row.type as Tag['type'] }),
  );
}

export function createIngredientsRepository(householdId: string): CrudRepository<Ingredient> {
  return createHouseholdRepository<Ingredient>(
    'ingredients',
    householdId,
    (ingredient) => ({
      id: ingredient.id,
      category_id: ingredient.categoryId || null,
      name: ingredient.name,
      unit: ingredient.defaultBuyUnit,
      allergens: ingredient.allergens,
      preferred_unit: ingredient.preferredUnit ?? null,
      preferred_method: ingredient.preferredMethod ?? null,
      owned: ingredient.owned,
    }),
    (row) => ({
      id: row.id as string,
      name: row.name as string,
      categoryId: (row.category_id as string | null) ?? '',
      defaultBuyUnit: (row.unit as string | null) ?? '',
      allergens: (row.allergens as string[] | null) ?? [],
      preferredUnit: (row.preferred_unit as string | null) ?? undefined,
      preferredMethod: (row.preferred_method as string | null) ?? undefined,
      owned: Boolean(row.owned),
    }),
  );
}

interface RecipeContent {
  servingsBase: number;
  ingredients: Recipe['ingredients'];
  steps: Recipe['steps'];
}

function rowToRecipe(row: Record<string, unknown>): Recipe {
  const content = (row.content as RecipeContent | null) ?? { servingsBase: 1, ingredients: [], steps: [] };
  const recipeTags = (row.recipe_tags as { tag_id: string }[] | null) ?? [];
  return {
    id: row.id as string,
    name: row.title as string,
    servingsBase: content.servingsBase ?? 1,
    tagIds: recipeTags.map((rt) => rt.tag_id),
    ingredients: content.ingredients ?? [],
    steps: content.steps ?? [],
  };
}

/**
 * recipes는 user 소유(공유 household 아님) + recipe_tags 조인이 필요해서 공용 팩토리를 안 쓴다.
 * RLS가 이미 "본인 것 + is_public=true"만 내려주므로 select에는 별도 필터가 필요 없다.
 */
export function createRecipesRepository(userId: string): CrudRepository<Recipe> {
  async function saveOne(recipe: Recipe): Promise<void> {
    const { error: upsertError } = await supabase.from('recipes').upsert({
      id: recipe.id,
      user_id: userId,
      title: recipe.name,
      content: {
        servingsBase: recipe.servingsBase,
        ingredients: recipe.ingredients,
        steps: recipe.steps,
      } satisfies RecipeContent,
      // is_public은 일부러 안 보냄 — upsert 시 지정 안 한 컬럼은 UPDATE 대상에서 빠져서
      // 기존 공개 설정이 그대로 유지된다(새 레시피는 컬럼 기본값 false로 시작).
    });
    if (upsertError) throw upsertError;

    // recipe_tags 동기화(삭제 후 재삽입 — 이 규모에서는 diff 계산보다 단순하고 충분히 빠름)
    const { error: deleteTagsError } = await supabase.from('recipe_tags').delete().eq('recipe_id', recipe.id);
    if (deleteTagsError) throw deleteTagsError;
    if (recipe.tagIds.length > 0) {
      const { error: insertTagsError } = await supabase
        .from('recipe_tags')
        .insert(recipe.tagIds.map((tagId) => ({ recipe_id: recipe.id, tag_id: tagId })));
      if (insertTagsError) throw insertTagsError;
    }
  }

  return {
    async getAll() {
      const { data, error } = await supabase.from('recipes').select('*, recipe_tags(tag_id)');
      if (error) throw error;
      return (data ?? []).map(rowToRecipe);
    },
    async get(id) {
      const { data, error } = await supabase
        .from('recipes')
        .select('*, recipe_tags(tag_id)')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data ? rowToRecipe(data) : undefined;
    },
    save: saveOne,
    async delete(id) {
      const { error } = await supabase.from('recipes').delete().eq('id', id);
      if (error) throw error;
    },
    async replaceAll(recipes) {
      const { error: deleteError } = await supabase.from('recipes').delete().eq('user_id', userId);
      if (deleteError) throw deleteError;
      for (const recipe of recipes) {
        await saveOne(recipe);
      }
    },
  };
}
