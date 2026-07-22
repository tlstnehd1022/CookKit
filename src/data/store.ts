import { useMemo, useSyncExternalStore } from 'react';
import { categoriesRepo, ingredientsRepo, pantryRepo, recipesRepo, tagsRepo } from './repos';
import { seedCategories, seedIngredients, seedRecipes, seedTags } from './seed';
import type { CrudRepository } from './repository';
import type { Category, Ingredient, PantryStatus } from './types';

function createEntityStore<T extends { id: string }>(repo: CrudRepository<T>, seed: T[]) {
  if (repo.getAll().length === 0 && seed.length > 0) {
    repo.replaceAll(seed);
  }
  let cache: T[] = repo.getAll();
  const listeners = new Set<() => void>();

  function notify() {
    cache = repo.getAll();
    listeners.forEach((listener) => listener());
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return cache;
    },
    save(item: T) {
      repo.save(item);
      notify();
    },
    remove(id: string) {
      repo.delete(id);
      notify();
    },
    replaceAll(items: T[]) {
      repo.replaceAll(items);
      notify();
    },
  };
}

const ingredientsStore = createEntityStore(ingredientsRepo, seedIngredients);
const recipesStore = createEntityStore(recipesRepo, seedRecipes);
const tagsStore = createEntityStore(tagsRepo, seedTags);
const categoriesStore = createEntityStore(categoriesRepo, seedCategories);

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

const pantryListeners = new Set<() => void>();
let pantryCache: PantryStatus = pantryRepo.get();

function notifyPantry() {
  pantryCache = pantryRepo.get();
  pantryListeners.forEach((listener) => listener());
}

export function replacePantryStatus(next: PantryStatus) {
  pantryRepo.set(next);
  notifyPantry();
}

export function usePantryStatus() {
  const pantryStatus = useSyncExternalStore(
    (listener) => {
      pantryListeners.add(listener);
      return () => pantryListeners.delete(listener);
    },
    () => pantryCache,
  );

  function setOwned(ingredientId: string, owned: boolean) {
    replacePantryStatus({ ...pantryRepo.get(), [ingredientId]: owned });
  }

  return { pantryStatus, setOwned };
}

export function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
