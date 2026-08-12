import { useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabaseClient';

/** 레시피를 거치지 않고 장보기 화면에서 "직접 추가"한 항목(E-2/E-3) — household 공유 테이블
 * (shopping_extra_items), shoppingSelection.ts와 같은 store 패턴. App.tsx가 로그인+household
 * 확정 후 initializeShoppingExtraItems()를 한 번 호출해서 연결한다. */
export interface ShoppingExtraItem {
  id: string;
  ingredientId: string;
  amount: number | null;
  unit: string | null;
}

let currentHouseholdId: string | null = null;
let cache: ShoppingExtraItem[] = [];
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

async function refresh() {
  if (!currentHouseholdId) return;
  const { data, error } = await supabase
    .from('shopping_extra_items')
    .select('id, ingredient_id, amount, unit')
    .eq('household_id', currentHouseholdId);
  if (error) throw error;
  cache = (data ?? []).map((row) => ({
    id: row.id as string,
    ingredientId: row.ingredient_id as string,
    amount: row.amount as number | null,
    unit: row.unit as string | null,
  }));
  notify();
}

export async function initializeShoppingExtraItems(householdId: string): Promise<void> {
  if (currentHouseholdId === householdId) return;
  currentHouseholdId = householdId;
  await refresh();
}

export function resetShoppingExtraItems(): void {
  currentHouseholdId = null;
  cache = [];
  notify();
}

export function useShoppingExtraItems() {
  const items = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => cache,
  );

  async function add(ingredientId: string, amount?: number, unit?: string) {
    if (!currentHouseholdId) return;
    const { error } = await supabase.from('shopping_extra_items').upsert(
      { household_id: currentHouseholdId, ingredient_id: ingredientId, amount: amount ?? null, unit: unit ?? null },
      { onConflict: 'household_id,ingredient_id' },
    );
    if (error) throw error;
    await refresh();
  }

  async function remove(id: string) {
    const { error } = await supabase.from('shopping_extra_items').delete().eq('id', id);
    if (error) throw error;
    await refresh();
  }

  return { items, add, remove };
}
