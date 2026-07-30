import { supabase } from '../lib/supabaseClient';
import { fetchHouseholdMemberIds } from './household';
import type { CrudRepository } from './repository';
import type { Category, Ingredient, Recipe, RecipeVisibility, Tag } from './types';

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
      expiration_date: ingredient.expirationDate ?? null,
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
      expirationDate: (row.expiration_date as string | null) ?? undefined,
    }),
  );
}

interface RecipeContent {
  servingsBase: number;
  ingredients: Recipe['ingredients'];
  steps: Recipe['steps'];
  difficulty?: Recipe['difficulty'];
  difficultyReason?: string;
  estimatedMinutes?: number;
  finalImageId?: string;
  sourceType?: Recipe['sourceType'];
  sourceNote?: string;
  seedBatchId?: string;
}

export function rowToRecipe(row: Record<string, unknown>): Recipe {
  const content = (row.content as RecipeContent | null) ?? { servingsBase: 1, ingredients: [], steps: [] };
  const recipeTags = (row.recipe_tags as { tag_id: string }[] | null) ?? [];
  // profiles!user_id(display_name, avatar_url) 임베드 조인이 select에 포함된 경우에만 존재
  // (선택적) — "OO님의 레시피" 작성자 표시용, DB에 저장되는 값이 아니라 조회 시에만 채워지는 필드.
  const profile = row.profiles as { display_name: string | null; avatar_url: string | null } | null;
  return {
    id: row.id as string,
    name: row.title as string,
    servingsBase: content.servingsBase ?? 1,
    tagIds: recipeTags.map((rt) => rt.tag_id),
    ingredients: content.ingredients ?? [],
    steps: content.steps ?? [],
    createdAt: row.created_at as string | undefined,
    difficulty: content.difficulty,
    difficultyReason: content.difficultyReason,
    estimatedMinutes: content.estimatedMinutes,
    finalImageId: content.finalImageId,
    sourceRecipeId: (row.source_recipe_id as string | null) ?? undefined,
    visibility: (row.visibility as RecipeVisibility | null) ?? 'household',
    sourceType: content.sourceType,
    sourceNote: content.sourceNote,
    seedBatchId: content.seedBatchId,
    authorName: profile?.display_name ?? undefined,
    authorAvatarUrl: profile?.avatar_url ?? undefined,
  };
}

/**
 * recipes는 user 소유(공유 household 아님) + recipe_tags 조인이 필요해서 공용 팩토리를 안 쓴다.
 * RLS가 "본인 것 + visibility='household'인 가구원 것 + visibility='public'"을 다 통과시켜주지만,
 * "우리집 레시피" 목록은 그중 딱 "내 것 + 우리 가구원 것"만 보여줘야 해서(다른 가구의 public
 * 레시피까지 섞이면 안 됨 — 그건 둘러보기 화면 몫) getAll()에서 household 멤버 id로 한 번 더 좁힌다.
 */
export function createRecipesRepository(userId: string, householdId: string): CrudRepository<Recipe> {
  async function saveOne(recipe: Recipe): Promise<void> {
    const { error: upsertError } = await supabase.from('recipes').upsert({
      id: recipe.id,
      user_id: userId,
      title: recipe.name,
      content: {
        servingsBase: recipe.servingsBase,
        ingredients: recipe.ingredients,
        steps: recipe.steps,
        difficulty: recipe.difficulty,
        difficultyReason: recipe.difficultyReason,
        estimatedMinutes: recipe.estimatedMinutes,
        finalImageId: recipe.finalImageId,
        sourceType: recipe.sourceType,
        sourceNote: recipe.sourceNote,
        seedBatchId: recipe.seedBatchId,
      } satisfies RecipeContent,
      // visibility/source_recipe_id는 실제 컬럼이라 명시적으로 보냄 — RecipeEditor가
      // rowToRecipe로 읽어온 기존 값을 폼 상태에 들고 있다가 그대로 다시 보내므로
      // (existing?.visibility ?? 'household' 식으로 초기화) 의도치 않게 되돌아가지 않음.
      visibility: recipe.visibility ?? 'household',
      source_recipe_id: recipe.sourceRecipeId ?? null,
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
      // "내 것" + "우리 가구원이 만든 household/public 등급 레시피"만 — 소유권과 무관하게
      // RLS를 통과하는 다른 가구의 public 레시피까지 섞여 나오면 안 되므로(둘러보기 전용),
      // 먼저 가구원 id 목록으로 좁힌 뒤 visibility로 한 번 더 거른다.
      const memberIds = await fetchHouseholdMemberIds(householdId);
      const { data, error } = await supabase
        .from('recipes')
        // profiles!user_id — "OO님의 레시피" 작성자 표시용(우리 가구원끼리라 항상 볼 수 있음,
        // profiles_select_own_or_household RLS로 이미 허용됨). FK 경로가 여러 개(recipe_likes
        // 경유 등)로 해석될 수 있어 명시적으로 지정.
        .select('*, recipe_tags(tag_id), profiles!user_id(display_name, avatar_url)')
        .in('user_id', memberIds.length > 0 ? memberIds : [userId])
        .or(`visibility.neq.private,user_id.eq.${userId}`);
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
