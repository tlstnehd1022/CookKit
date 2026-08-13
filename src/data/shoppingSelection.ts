import { useMemo, useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useIngredientsById, useRecipes } from './store';
import { isPantryUsable } from '../lib/pantryAvailability';

/** "장보기에 담은 레시피" 목록 — household 공유 테이블(shopping_selection)이라 가족 중 누가
 * 담아도 서로에게 바로 보인다. App.tsx가 로그인+household 확정 후 initializeShoppingSelection()
 * 을 한 번 호출해서 연결한다.
 *
 * 각 항목은 자기 인분(servings)을 따로 갖는다(B-3) — 레시피 상세에서 "몇 인분으로 보고
 * 있었는지"가 담길 때 같이 저장되고, 장보기 화면 재료 집계는 recipe.servingsBase가 아니라
 * 이 값 기준으로 계산한다(예전엔 항상 servingsBase 기준이라, 4인분으로 보고 담아도 실제로는
 * 2인분만 담기는 버그가 있었음). */
export interface ShoppingSelectionEntry {
  recipeId: string;
  servings: number;
}

let currentHouseholdId: string | null = null;
let cache: ShoppingSelectionEntry[] = [];
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

async function refresh() {
  if (!currentHouseholdId) return;
  const { data, error } = await supabase
    .from('shopping_selection')
    .select('recipe_id, servings')
    .eq('household_id', currentHouseholdId);
  if (error) throw error;
  cache = (data ?? []).map((row) => ({ recipeId: row.recipe_id as string, servings: row.servings as number }));
  notify();
}

export async function initializeShoppingSelection(householdId: string): Promise<void> {
  if (currentHouseholdId === householdId) return;
  currentHouseholdId = householdId;
  await refresh();
}

export function resetShoppingSelection(): void {
  currentHouseholdId = null;
  cache = [];
  notify();
}

export function useShoppingSelection() {
  const selection = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => cache,
  );
  const selectedRecipeIds = useMemo(() => selection.map((entry) => entry.recipeId), [selection]);

  /** 담기/빼기 토글 — 새로 담을 때만 servings를 저장한다(이미 담겨 있으면 그냥 빼기만 하고
   * servings 인자는 무시됨). 호출부는 "지금 화면에서 보고 있던 인분"(레시피 상세) 또는 가구
   * 기본 인원(장보기 화면에서 새로 고를 때)을 넘긴다. */
  async function toggle(recipeId: string, servings: number) {
    if (!currentHouseholdId) return;
    if (cache.some((entry) => entry.recipeId === recipeId)) {
      const { error } = await supabase
        .from('shopping_selection')
        .delete()
        .eq('household_id', currentHouseholdId)
        .eq('recipe_id', recipeId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('shopping_selection')
        .insert({ household_id: currentHouseholdId, recipe_id: recipeId, servings });
      if (error) throw error;
    }
    await refresh();
  }

  /** 장보기 화면에서 이미 담긴 레시피의 인분을 개별로 바꾼다(B-3) — 다른 레시피 항목에는
   * 영향 없음. */
  async function updateServings(recipeId: string, servings: number) {
    if (!currentHouseholdId) return;
    const { error } = await supabase
      .from('shopping_selection')
      .update({ servings })
      .eq('household_id', currentHouseholdId)
      .eq('recipe_id', recipeId);
    if (error) throw error;
    await refresh();
  }

  function isSelected(recipeId: string) {
    return selectedRecipeIds.includes(recipeId);
  }

  function getServings(recipeId: string): number | undefined {
    return selection.find((entry) => entry.recipeId === recipeId)?.servings;
  }

  return { selection, selectedRecipeIds, toggle, updateServings, isSelected, getServings };
}

/** 탭바의 장보기 배지용 — 담긴 레시피들의 재료를 집계해서(ShoppingListPage.tsx와 같은 방식)
 * 아직 usable하지 않은(없음 + 유통기한 지나 확인 필요) 항목 개수를 센다(수량이 아니라 존재
 * 여부만 보므로 인분과는 무관). */
export function useShoppingNeededCount(): number {
  const { selection } = useShoppingSelection();
  const { recipes } = useRecipes();
  const ingredientsById = useIngredientsById();

  return useMemo(() => {
    const needed = new Set<string>();
    for (const entry of selection) {
      const recipe = recipes.find((r) => r.id === entry.recipeId);
      if (!recipe) continue;
      for (const item of recipe.ingredients) {
        if (!isPantryUsable(ingredientsById.get(item.ingredientId))) {
          needed.add(`${item.ingredientId}__${item.unit}`);
        }
      }
    }
    return needed.size;
  }, [recipes, selection, ingredientsById]);
}
