export interface Category {
  id: string;
  name: string;
}

export interface Ingredient {
  id: string;
  name: string;
  categoryId: string;
  defaultBuyUnit: string;
  allergens: string[];
}

export interface RecipeIngredient {
  ingredientId: string;
  amount: number;
  unit: string;
}

export interface RecipeStep {
  title: string;
  content: string;
  timerSeconds?: number;
}

export interface Recipe {
  id: string;
  name: string;
  servingsBase: number;
  tagIds: string[];
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
}

export type TagType = 'style' | 'category';

export interface Tag {
  id: string;
  name: string;
  type: TagType;
}

export type PantryStatus = Record<string, boolean>;

// 향후 확장 대비 스텁 — Phase 1에서는 UI/저장 로직 미구현
export interface CookingLog {
  id: string;
  recipeId: string;
  cookedDate: string;
  memo?: string;
}

export interface MenuSet {
  id: string;
  name: string;
  recipeIds: string[];
  guestCount?: number;
  plannedDate?: string;
}

export interface BackupSnapshot {
  version: 1;
  exportedAt: string;
  recipes: Recipe[];
  ingredients: Ingredient[];
  tags: Tag[];
  categories: Category[];
  pantryStatus: PantryStatus;
}
