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
  /** 유통기한(YYYY-MM-DD, 선택) — 없으면 배지/알림 대상에서 제외 */
  expirationDate?: string;
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
  /** Supabase Storage(src/data/imageStore.ts)에 저장된 이미지 경로 참조 — 실제 이미지 데이터는 별도 저장 */
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
  /** 완성된 요리 사진(AI 생성 또는 업로드) — Supabase Storage 경로(src/data/imageStore.ts) */
  finalImageId?: string;
  /** 공개 레시피를 "내 레시피로 복사하기"로 가져온 경우, 그 원본 레시피 id(DB 컬럼) */
  sourceRecipeId?: string;
  /** 공개 범위(기본 household) — DB의 recipes.visibility 컬럼 */
  visibility?: RecipeVisibility;
  /** 'public_data' = 공공데이터(식약처 레시피 DB) 기반 시드 레시피. 없으면 일반 사용자 작성 레시피 */
  sourceType?: 'public_data';
  /** 출처 표기 문구(예: "식품의약품안전처 조리식품의 레시피 DB (RCP_SEQ: 123)") */
  sourceNote?: string;
  /** 이 레시피를 만든 시드 배치 식별자(예: 'public-data-2026-07-batch1') — 배치 단위 식별/삭제용 */
  seedBatchId?: string;
  /** 작성자 닉네임(profiles.display_name) — DB에 저장되는 값이 아니라 조회 시 join으로 채워지는
   * 표시 전용 필드. "OO님의 레시피" 표시용(저장 시에는 무시됨). */
  authorName?: string;
  /** 작성자 프로필 사진 URL(profiles.avatar_url) — authorName과 같은 조회 전용 필드 */
  authorAvatarUrl?: string;
}

/** private=본인만, household=같은 가구원까지(기본값), public=전체 공개 */
export type RecipeVisibility = 'private' | 'household' | 'public';

export type TagType = 'style' | 'category' | 'cuisine';

export interface Tag {
  id: string;
  name: string;
  type: TagType;
}

export type PantryStatus = Record<string, boolean>;

/** 요리 완료 기록 — household 공유(supabase/migrations/0018_cooking_log.sql, cooking_log 테이블).
 * src/data/cookingLog.ts에서 조회/생성한다. */
export interface CookingLog {
  id: string;
  recipeId: string;
  householdId: string;
  userId: string;
  /** ISO 타임스탬프 */
  cookedAt: string;
  memo?: string;
}

// 향후 확장 대비 스텁 — 아직 UI/저장 로직 미구현
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
