import { useMemo, useSyncExternalStore } from 'react';
import {
  createCategoriesRepository,
  createIngredientsRepository,
  createRecipesRepository,
  createTagsRepository,
} from './supabaseAdapter';
import type { CrudRepository } from './repository';
import type { Category, Ingredient, PantryStatus, Recipe, Tag } from './types';

// Supabase는 네트워크 호출이라 앱 시작 시점에 바로 데이터를 채울 수 없다(household가 정해지기
// 전에는 어떤 데이터를 가져와야 할지도 모른다). 그래서 로그인 → household 확정 후
// initializeDataLayer()를 한 번 호출해서 그때 실제 repo를 연결하고 최초 로딩을 수행한다.
function createEntityStore<T extends { id: string }>() {
  let repo: CrudRepository<T> | null = null;
  let cache: T[] = [];
  let loading = true;
  const listeners = new Set<() => void>();

  function notify() {
    listeners.forEach((listener) => listener());
  }

  async function setRepo(newRepo: CrudRepository<T>) {
    repo = newRepo;
    loading = true;
    notify();
    cache = await newRepo.getAll();
    loading = false;
    notify();
  }

  async function refresh() {
    if (!repo) return;
    cache = await repo.getAll();
    notify();
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => cache,
    getLoading: () => loading,
    setRepo,
    async save(item: T) {
      if (!repo) throw new Error('아직 데이터 저장소가 준비되지 않았습니다.');
      await repo.save(item);
      await refresh();
    },
    async remove(id: string) {
      if (!repo) throw new Error('아직 데이터 저장소가 준비되지 않았습니다.');
      await repo.delete(id);
      await refresh();
    },
    async replaceAll(items: T[]) {
      if (!repo) throw new Error('아직 데이터 저장소가 준비되지 않았습니다.');
      await repo.replaceAll(items);
      await refresh();
    },
  };
}

const ingredientsStore = createEntityStore<Ingredient>();
const recipesStore = createEntityStore<Recipe>();
const tagsStore = createEntityStore<Tag>();
const categoriesStore = createEntityStore<Category>();

let initializedForHouseholdId: string | null = null;

/** 로그인 + household 확정 후 App.tsx에서 한 번 호출한다. 같은 household면 다시 로드하지 않는다. */
export async function initializeDataLayer(householdId: string, userId: string): Promise<void> {
  if (initializedForHouseholdId === householdId) return;
  initializedForHouseholdId = householdId;
  await Promise.all([
    ingredientsStore.setRepo(createIngredientsRepository(householdId)),
    categoriesStore.setRepo(createCategoriesRepository(householdId)),
    tagsStore.setRepo(createTagsRepository(householdId)),
    recipesStore.setRepo(createRecipesRepository(userId)),
  ]);
}

/** 로그아웃 시 호출 — 다음 로그인(다른 계정일 수도 있음)에서 다시 초기화되게 한다. */
export function resetDataLayer(): void {
  initializedForHouseholdId = null;
}

/** 네 스토어 모두 initializeDataLayer의 같은 Promise.all에서 동시에 로딩 상태에 들어가므로 하나만 봐도 된다. */
export function useDataLayerLoading(): boolean {
  return useSyncExternalStore(ingredientsStore.subscribe, ingredientsStore.getLoading);
}

// 훅이 아닌 일반 함수로 현재 캐시를 읽는 용도(백업 내보내기 등 React 렌더 바깥에서 필요할 때).
export const getIngredientsSnapshot = ingredientsStore.getSnapshot;
export const getRecipesSnapshot = recipesStore.getSnapshot;
export const getTagsSnapshot = tagsStore.getSnapshot;
export const getCategoriesSnapshot = categoriesStore.getSnapshot;

export const replaceAllIngredients = ingredientsStore.replaceAll;
export const replaceAllRecipes = recipesStore.replaceAll;
export const replaceAllTags = tagsStore.replaceAll;
export const replaceAllCategories = categoriesStore.replaceAll;

export function useIngredients() {
  const ingredients = useSyncExternalStore(ingredientsStore.subscribe, ingredientsStore.getSnapshot);
  return {
    ingredients,
    saveIngredient: ingredientsStore.save,
    deleteIngredient: ingredientsStore.remove,
  };
}

export function useIngredientsById(): Map<string, Ingredient> {
  const { ingredients } = useIngredients();
  return useMemo(() => new Map(ingredients.map((ingredient) => [ingredient.id, ingredient])), [ingredients]);
}

export function useRecipes() {
  const recipes = useSyncExternalStore(recipesStore.subscribe, recipesStore.getSnapshot);
  return {
    recipes,
    saveRecipe: recipesStore.save,
    deleteRecipe: recipesStore.remove,
  };
}

export function useTags() {
  const tags = useSyncExternalStore(tagsStore.subscribe, tagsStore.getSnapshot);
  return {
    tags,
    saveTag: tagsStore.save,
    deleteTag: tagsStore.remove,
  };
}

export function useCategories() {
  const categories = useSyncExternalStore(categoriesStore.subscribe, categoriesStore.getSnapshot);
  return {
    categories,
    saveCategory: categoriesStore.save,
    deleteCategory: categoriesStore.remove,
  };
}

export function useCategoriesById(): Map<string, Category> {
  const { categories } = useCategories();
  return useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
}

// 보유 여부(pantry status)는 이제 별도 저장소가 아니라 Ingredient.owned 필드에서 파생된다
// (household 공유 테이블이라 재료 자체에 두는 게 더 단순함 — supabase/schema.sql 참고).
export function usePantryStatus() {
  const { ingredients, saveIngredient } = useIngredients();
  const pantryStatus: PantryStatus = useMemo(
    () => Object.fromEntries(ingredients.map((ingredient) => [ingredient.id, ingredient.owned])),
    [ingredients],
  );

  async function setOwned(ingredientId: string, owned: boolean) {
    const ingredient = ingredients.find((i) => i.id === ingredientId);
    if (!ingredient) return;
    await saveIngredient({ ...ingredient, owned });
  }

  return { pantryStatus, setOwned };
}

export function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
