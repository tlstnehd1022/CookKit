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
  /** 예: '작은술' — 이 재료를 넣을 때 선호하는 계량 단위. AI 레시피 생성/수정 시 참고 정보로 전달됨 */
  preferredUnit?: string;
  /** 예: '그라인더로 갈아서', '다진 것 대신 편 썰기로' — 자유 서술형 선호 방식 */
  preferredMethod?: string;
  /** 보유 여부(household 공유) — 예전엔 별도 PantryStatus 맵이었으나 DB 전환 후 재료 행에 통합 */
  owned: boolean;
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
  /** IndexedDB(src/data/imageStore.ts)에 저장된 AI 생성 이미지 참조 — 실제 이미지 데이터는 localStorage에 두지 않음 */
  imageId?: string;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Recipe {
  id: string;
  name: string;
  servingsBase: number;
  tagIds: string[];
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  /** DB의 recipes.created_at — 정렬(최근 추가순)용. 로컬에서 새로 만든 뒤 아직 저장 전이면 없을 수 있음 */
  createdAt?: string;
  /** 규칙 기반 자동 판단(src/lib/recipeDifficulty.ts) 또는 사용자가 수동 설정 */
  difficulty?: Difficulty;
  /** 판단 근거. 사용자가 수동으로 바꾸면 '사용자가 직접 설정함'으로 갱신됨 */
  difficultyReason?: string;
  /** 규칙 기반 자동 계산(src/lib/recipeTime.ts) 또는 사용자가 수동 입력한 예상 조리시간(분) */
  estimatedMinutes?: number;
}

export type TagType = 'style' | 'category' | 'cuisine';

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
