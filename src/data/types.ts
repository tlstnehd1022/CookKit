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
  /** 보유 여부(household 공유) — 예전엔 별도 PantryStatus 맵이었으나 DB 전환 후 재료 행에 통합 */
  owned: boolean;
  /** 유통기한(YYYY-MM-DD, 선택) — 없으면 배지/알림 대상에서 제외 */
  expirationDate?: string;
  /** 마지막으로 owned가 false→true로 바뀐 시각(ISO) — 냉장고 화면의 "n일 전 채움" 표시와
   * 장보기의 "자주 채우는 재료" 선제 제안 판단 근거로 쓰인다. false→false/true→true 전환에는
   * 안 바뀜(supabaseAdapter.ts의 ingredients repository save()가 자동으로 갱신). */
  lastFilledAt?: string;
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
  /** 그 단계에서 유용한 짧은 팁(선택, D-3) — 요리 모드에서 팁 박스로 표시됨 */
  tip?: string;
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
  /** servingsBase(기준 인분) 1인분 기준 영양 정보 — 인분 조절 시 화면에서 비례 재계산한다 */
  nutrition?: RecipeNutrition;
  /** nutrition 값의 출처 — 화면에 항상 같이 표기해서 정확도를 오인하지 않게 한다 */
  nutritionSource?: NutritionSource;
}

/** private=본인만, household=같은 가구원까지(기본값), public=전체 공개 */
export type RecipeVisibility = 'private' | 'household' | 'public';

export interface RecipeNutrition {
  /** kcal */
  calories: number;
  /** g */
  carbs: number;
  /** g */
  protein: number;
  /** g */
  fat: number;
  /** mg */
  sodium: number;
}

/** 'public_data' = 식약처 공공데이터(가장 정확) · 'api' = 재료 매칭 기반 계산(현재 미사용 —
 * CLAUDE.md "영양/칼로리 정보" 항목 참고, 식약처 영양성분 API가 조리식품 위주라 재료명 매칭률이
 * 낮아 보류) · 'ai_estimate' = AI 추정(온디맨드) · 'manual' = 사용자 직접 입력 */
export type NutritionSource = 'public_data' | 'api' | 'ai_estimate' | 'manual';

export type TagType = 'style' | 'category' | 'cuisine';

export interface Tag {
  id: string;
  name: string;
  type: TagType;
}

export type PantryStatus = Record<string, boolean>;

/** 요리 모드(CookingModePage)에서 측정한 한 단계의 준비/조리 시간 — 레시피 타이머 조정 제안의
 * 원본 데이터(src/data/cookingLog.ts의 fetchStepTimingAdjustments). recipeId는 복합 요리(여러
 * 레시피 동시 진행) 세션에서 이 타이밍이 어느 레시피 단계인지 구분하기 위함. */
export interface CookingLogStepTiming {
  recipeId: string;
  stepIndex: number;
  /** 레시피에 설정된 타이머 값(초) — 타이머가 없는 단계는 0 */
  plannedSeconds: number;
  /** 단계 진입 → 타이머 시작(초). hadTimer=false면 의미 없음(0) */
  prepSeconds: number;
  /** 타이머가 실제로 돌아간(일시정지 제외) 시간(초), 또는 타이머가 없는 단계의 전체 체류 시간 */
  cookSeconds: number;
  /** 이 단계에서 타이머를 실제로 시작했는지 — false면 준비/조리 구분이 불가능해 조정 제안 대상에서 제외 */
  hadTimer: boolean;
}

/** 끼니 구분 — 기본값은 'dinner'(주간 일정 도입 초기엔 저녁만 관리했음). */
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/** 주간 일정(끼니별 메뉴 계획) — household 공유(supabase/migrations/0022, 0026, 0029).
 * 같은 (householdId, date, mealType)에도 여러 행이 들어갈 수 있다(한 끼에 여러 메뉴).
 * sortOrder는 같은 끼니 안에서의 표시 순서. src/data/mealPlans.ts에서 조회/저장한다. */
export interface MealPlan {
  id: string;
  householdId: string;
  /** YYYY-MM-DD */
  date: string;
  recipeId: string;
  mealType: MealType;
  sortOrder: number;
  /** 이 항목의 인분 — recipe.servingsBase(레시피 원본 기준)와 달리 "실제로 몇 인분 만들
   * 계획인지". 배치 시 가구 기본 인원이 초기값이고 항목별로 개별 조절 가능(B-4). */
  servings: number;
}

// 향후 확장 대비 스텁 — 아직 UI/저장 로직 미구현
export interface MenuSet {
  id: string;
  name: string;
  recipeIds: string[];
  guestCount?: number;
  plannedDate?: string;
}

