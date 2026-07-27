import { useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabaseClient';

// "장보기에 담은 레시피" 목록. household 공유 테이블(shopping_selection)이라 가족 중
// 누가 담아도 서로에게 바로 보인다. App.tsx가 로그인+household 확정 후
// initializeShoppingSelection()을 한 번 호출해서 연결한다.
let currentHouseholdId: string | null = null;
let cache: string[] = [];
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

async function refresh() {
  if (!currentHouseholdId) return;
  const { data, error } = await supabase
    .from('shopping_selection')
    .select('recipe_id')
    .eq('household_id', currentHouseholdId);
  if (error) throw error;
  cache = (data ?? []).map((row) => row.recipe_id as string);
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
  const selectedRecipeIds = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => cache,
  );

  async function toggle(recipeId: string) {
    if (!currentHouseholdId) return;
    if (cache.includes(recipeId)) {
      const { error } = await supabase
        .from('shopping_selection')
        .delete()
        .eq('household_id', currentHouseholdId)
        .eq('recipe_id', recipeId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('shopping_selection')
        .insert({ household_id: currentHouseholdId, recipe_id: recipeId });
      if (error) throw error;
    }
    await refresh();
  }

  function isSelected(recipeId: string) {
    return selectedRecipeIds.includes(recipeId);
  }

  return { selectedRecipeIds, toggle, isSelected };
}
