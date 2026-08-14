import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import {
  useRecipes,
  useIngredients,
  useIngredientsById,
  usePantryStatus,
  useTags,
  getCurrentHouseholdId,
} from '../../data/store';
import { useStoredImage } from '../../data/imageStore';
import {
  fetchMealPlans,
  addMealPlan,
  updateMealPlanRecipe,
  updateMealPlanServings,
  removeMealPlan,
  MEAL_TYPES,
  MEAL_TYPE_LABEL,
} from '../../data/mealPlans';
import { useHousehold } from '../../data/household';
import { isRecipeMakeableWithPantry, scaleAmount } from '../../data/computed';
import { fetchCookingStats } from '../../data/cookingLog';
import { pickNextMealPlan } from '../../lib/mealTime';
import { buildAutoFillPlan, type AutoFillAssignment } from '../../lib/mealPlanAutoFill';
import {
  getCurrentWeekDates,
  formatWeekdayShort,
  formatDayOfMonth,
  todayDateString,
} from '../../lib/weekDates';
import { getExpirationInfo, formatExpirationBadge } from '../../lib/expiration';
import { getPantryAvailability } from '../../lib/pantryAvailability';
import { getErrorMessage } from '../../lib/errorMessage';
import { RecipeDetailPage } from '../recipes/RecipeDetailPage';
import { RecipeEditor } from '../recipes/RecipeEditor';
import { RecipeCard, RecipeListItem, resolveRecipeTagNames } from '../recipes/RecipesPage';
import { ExpiredConfirmModal } from '../ingredients/IngredientsPage';
import type { Ingredient, MealPlan, MealType, Recipe } from '../../data/types';

type View =
  | { screen: 'week' }
  | { screen: 'detail'; recipeId: string; autoCook?: boolean; initialServings?: number }
  | { screen: 'edit'; recipeId: string };

/** "+ 메뉴 정하기"(신규)와 "바꾸기"(기존 메뉴 레시피 교체)가 같은 선택 모달을 공유한다 —
 * replaceId가 있으면 교체, 없으면 새 메뉴 추가. */
type PickerContext = { mealType: MealType; replaceId?: string };

const WEEK_DATES = getCurrentWeekDates();

function collectIngredientIds(recipeList: Recipe[]): Set<string> {
  const ids = new Set<string>();
  for (const recipe of recipeList) {
    for (const item of recipe.ingredients) ids.add(item.ingredientId);
  }
  return ids;
}

/** 두 날의 레시피 목록이 같이 쓰는 재료 id(중복 제거) — "이어 쓰기" 안내의 재료 겹침 판단 근거.
 * 끼니 구분 없이 그 날 전체 메뉴의 재료를 합쳐서 비교한다. */
function sharedIngredientIds(aList: Recipe[], bList: Recipe[]): Set<string> {
  const aIds = collectIngredientIds(aList);
  const bIds = collectIngredientIds(bList);
  const shared = new Set<string>();
  for (const id of aIds) {
    if (bIds.has(id)) shared.add(id);
  }
  return shared;
}

export function WeeklyPlanPage({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<View>({ screen: 'week' });
  const [selectedDate, setSelectedDate] = useState(todayDateString());
  const [plans, setPlans] = useState<Map<string, MealPlan[]>>(new Map());
  const [pickerContext, setPickerContext] = useState<PickerContext | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [expiredConfirmId, setExpiredConfirmId] = useState<string | null>(null);
  // 끼니 섹션 펼침 상태는 저장하지 않고(2번 요구사항), 이 화면에 머무는 동안만 사용자가 직접
  // 펼친 끼니를 기억한다 — 날짜를 바꾸면 초기화된다(아래 useEffect).
  const [manuallyExpanded, setManuallyExpanded] = useState<Set<MealType>>(new Set());

  const householdId = getCurrentHouseholdId();
  const { household } = useHousehold();
  const { recipes } = useRecipes();
  const ingredientsById = useIngredientsById();
  const { pantryStatus, setOwned } = usePantryStatus();
  const { saveIngredient } = useIngredients();

  async function refresh() {
    if (!householdId) return;
    try {
      const result = await fetchMealPlans(householdId, WEEK_DATES[0], WEEK_DATES[6]);
      setPlans(result);
    } catch (err) {
      console.error('주간 일정 조회 실패:', err);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId]);

  useEffect(() => {
    setManuallyExpanded(new Set());
  }, [selectedDate]);

  function recipeById(id: string): Recipe | undefined {
    return recipes.find((r) => r.id === id);
  }

  function dayRecipes(date: string): Recipe[] {
    const dayPlans = plans.get(date) ?? [];
    return dayPlans.map((p) => recipeById(p.recipeId)).filter((r): r is Recipe => r !== undefined);
  }

  /** 그 날 계획(MealPlan)과 실제 레시피를 짝지은 목록 — 인분(plan.servings) 기준 재료량/영양
   * 계산에 쓴다(B-4, recipe.servingsBase가 아니라 실제 배치된 인분 기준). */
  function dayPlanRecipePairs(date: string): { plan: MealPlan; recipe: Recipe }[] {
    const dayPlans = plans.get(date) ?? [];
    return dayPlans
      .map((plan) => {
        const recipe = recipeById(plan.recipeId);
        return recipe ? { plan, recipe } : null;
      })
      .filter((pair): pair is { plan: MealPlan; recipe: Recipe } => pair !== null);
  }

  async function handlePickRecipe(recipeId: string) {
    if (!householdId || !pickerContext) return;
    setAssignError(null);
    try {
      if (pickerContext.replaceId) {
        await updateMealPlanRecipe(pickerContext.replaceId, recipeId);
      } else {
        const existingCount = (plans.get(selectedDate) ?? []).filter(
          (p) => p.mealType === pickerContext.mealType,
        ).length;
        // 새로 배치할 때는 가구 기본 인원을 초기값으로 쓴다(B-4) — 배치 후 카드에서 개별 조절 가능.
        await addMealPlan(
          householdId,
          selectedDate,
          pickerContext.mealType,
          recipeId,
          existingCount,
          household?.defaultServings ?? 2,
        );
      }
      setPickerContext(null);
      await refresh();
    } catch (err) {
      console.error('일정 배치 실패:', err);
      setAssignError(getErrorMessage(err, '레시피를 배치하지 못했어요.'));
    }
  }

  async function handleRemovePlan(id: string) {
    if (!confirm('이 메뉴를 뺄까요?')) return;
    try {
      await removeMealPlan(id);
      await refresh();
    } catch (err) {
      console.error('메뉴 삭제 실패:', err);
      alert(getErrorMessage(err, '메뉴를 빼지 못했어요.'));
    }
  }

  async function handleUpdateServings(id: string, servings: number) {
    if (servings < 1) return;
    try {
      await updateMealPlanServings(id, servings);
      await refresh();
    } catch (err) {
      console.error('인분 수정 실패:', err);
      alert(getErrorMessage(err, '인분을 수정하지 못했어요.'));
    }
  }

  // A-3: "✨ 이번 주 자동으로 채우기" — 저녁 메뉴가 없는 날만 규칙 기반으로 골라 미리보기로
  // 보여주고, 사용자가 "이대로 채우기"를 눌러야만 실제로 저장된다(자동 반영 금지). 이미 메뉴가
  // 있는 날은 애초에 대상에서 빠지므로 건드리지 않는다.
  const [autoFillPreview, setAutoFillPreview] = useState<AutoFillAssignment[] | null>(null);
  const [autoFillLoading, setAutoFillLoading] = useState(false);
  const [autoFillApplying, setAutoFillApplying] = useState(false);
  const [autoFillError, setAutoFillError] = useState<string | null>(null);

  async function runAutoFill() {
    setAutoFillLoading(true);
    setAutoFillError(null);
    try {
      const emptyDates = WEEK_DATES.filter(
        (date) => (plans.get(date) ?? []).filter((p) => p.mealType === 'dinner').length === 0,
      );
      if (emptyDates.length === 0) {
        setAutoFillError('이번 주는 저녁 메뉴가 이미 다 채워져 있어요.');
        setAutoFillPreview(null);
        return;
      }
      const stats = await fetchCookingStats(recipes.map((r) => r.id));
      const plan = buildAutoFillPlan(
        emptyDates,
        recipes,
        ingredientsById,
        stats,
        Math.floor(Math.random() * Math.max(recipes.length, 1)),
      );
      if (plan.length === 0) {
        setAutoFillError('채울 수 있는 레시피가 없어요. 레시피를 먼저 추가해주세요.');
        setAutoFillPreview(null);
        return;
      }
      setAutoFillPreview(plan);
    } catch (err) {
      console.error('자동 채우기 계산 실패:', err);
      setAutoFillError(getErrorMessage(err, '자동 채우기에 실패했어요.'));
    } finally {
      setAutoFillLoading(false);
    }
  }

  async function applyAutoFill() {
    if (!autoFillPreview || !householdId) return;
    setAutoFillApplying(true);
    setAutoFillError(null);
    try {
      for (const { date, recipe } of autoFillPreview) {
        await addMealPlan(householdId, date, 'dinner', recipe.id, 0, household?.defaultServings ?? 2);
      }
      setAutoFillPreview(null);
      await refresh();
    } catch (err) {
      console.error('자동 채우기 반영 실패:', err);
      setAutoFillError(getErrorMessage(err, '자동 채우기를 반영하지 못했어요.'));
    } finally {
      setAutoFillApplying(false);
    }
  }

  const today = todayDateString();
  const selectedIndex = WEEK_DATES.indexOf(selectedDate);
  const selectedDayPlans = plans.get(selectedDate) ?? [];
  const totalPlannedCount = Array.from(plans.values()).reduce((sum, list) => sum + list.length, 0);
  // "다음 끼니"(오늘이면 아직 안 지난 끼니, 아니면 그 날 첫 메뉴)를 큰 카드로 보여준다 — 어떤
  // 끼니 조합이든(저녁을 안 쓰는 가구 포함) 항상 이미지가 하나는 나오도록.
  const bigCardPlanId = pickNextMealPlan(selectedDayPlans, selectedDate === today)?.id;

  const dailyNutritionTotal = useMemo(() => {
    return dayPlanRecipePairs(selectedDate).reduce(
      (sum, { plan, recipe }) => sum + (recipe.nutrition ? recipe.nutrition.calories * plan.servings : 0),
      0,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, plans, recipes]);

  // 아래 조건부 return(view.screen !== 'week')보다 반드시 위에 있어야 한다 — 훅은 매 렌더
  // 동일한 순서로 호출돼야 하는데, 조건부 return 뒤에 두면 view가 바뀔 때 호출 순서가 달라져
  // "Rules of Hooks" 위반이 된다.
  const continuationMessage = useMemo(() => {
    const todaysRecipes = dayRecipes(selectedDate);
    if (todaysRecipes.length === 0) return null;
    const prevRecipes = selectedIndex > 0 ? dayRecipes(WEEK_DATES[selectedIndex - 1]) : [];
    const nextRecipes = selectedIndex < WEEK_DATES.length - 1 ? dayRecipes(WEEK_DATES[selectedIndex + 1]) : [];
    const sharedIds = new Set([
      ...sharedIngredientIds(todaysRecipes, prevRecipes),
      ...sharedIngredientIds(todaysRecipes, nextRecipes),
    ]);
    if (sharedIds.size === 0) return '이 날 재료는 앞뒤 요일과 겹치지 않아요.';

    // A-6: 유통기한이 지나 확인이 필요한 재료는 "이어 쓰기" 대상에서 제외한다 — 이미 상한 걸
    // 이어서 쓸 수는 없으므로, 대신 확인이 필요하다는 사실을 최우선으로 안내한다.
    for (const id of sharedIds) {
      const ingredient = ingredientsById.get(id);
      if (ingredient && getPantryAvailability(ingredient) === 'expired_unconfirmed') {
        return `${ingredient.name}은(는) 유통기한이 지났어요. 상태를 확인해주세요.`;
      }
    }

    // 겹치는 재료 중 (아직 안 지났지만) 유통기한이 임박한 게 있으면 그걸 우선 안내 — "빨리 써야
    // 하니 이어서 쓰자"는 이어 쓰기 취지에 부합. owned가 아닌 재료는 실제 유통기한 개념이 없다.
    for (const id of sharedIds) {
      const ingredient = ingredientsById.get(id);
      if (!ingredient?.owned) continue;
      const info = getExpirationInfo(ingredient.expirationDate);
      if (info) {
        return `${ingredient.name}을(를) 앞뒤 요일과 같이 써요. ${formatExpirationBadge(info)}예요.`;
      }
    }
    const names = Array.from(sharedIds)
      .map((id) => ingredientsById.get(id)?.name)
      .filter((name): name is string => Boolean(name));
    return `${names.join(', ')}을(를) 앞뒤 요일과 같이 써요.`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, selectedIndex, plans, recipes, ingredientsById]);

  // 재료 하나당 "처음 등장한 레시피" 기준으로 수량 하나만 보여준다(여러 레시피가 같은 재료를
  // 쓰면 합산하지 않음 — 서로 다른 단위를 그냥 더할 수 없어서, 예전부터 있던 단순화). 다만 그
  // 수량은 이제 recipe.servingsBase가 아니라 그 메뉴의 실제 인분(plan.servings)으로
  // scaleAmount 재계산한다(B-4).
  const neededIngredientDetails = useMemo(() => {
    const map = new Map<string, { amount: number; unit: string }>();
    for (const { plan, recipe } of dayPlanRecipePairs(selectedDate)) {
      for (const item of recipe.ingredients) {
        if (map.has(item.ingredientId)) continue;
        map.set(item.ingredientId, {
          amount: scaleAmount(item.amount, recipe.servingsBase, plan.servings),
          unit: item.unit,
        });
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, plans, recipes]);

  // A-5: usable이 아닌 것(없음 + 유통기한 지나 확인 필요)을 전부 포함하되, 완전히 없는 것과
  // 지나서 확인이 필요한 것을 행 렌더링에서 구분 표시한다(getPantryAvailability로 판단).
  const neededIngredients = useMemo(() => {
    return Array.from(neededIngredientDetails.keys())
      .map((id) => ingredientsById.get(id))
      .filter((ing): ing is Ingredient => ing !== undefined && getPantryAvailability(ing) !== 'usable');
  }, [neededIngredientDetails, ingredientsById]);

  if (view.screen === 'detail') {
    return (
      <RecipeDetailPage
        recipeId={view.recipeId}
        onBack={() => setView({ screen: 'week' })}
        onEdit={() => setView({ screen: 'edit', recipeId: view.recipeId })}
        autoStartCookingMode={view.autoCook}
        initialServings={view.initialServings}
      />
    );
  }
  if (view.screen === 'edit') {
    return <RecipeEditor recipeId={view.recipeId} onDone={() => setView({ screen: 'detail', recipeId: view.recipeId })} />;
  }

  return (
    <div className="weekly-plan-page">
      <button type="button" className="weekly-plan-back" onClick={onBack}>
        <ChevronLeft size={20} strokeWidth={2.75} />
      </button>
      <h1 style={{ marginBottom: 2 }}>주간 일정</h1>
      <p className="text-muted" style={{ marginBottom: 20 }}>
        {formatDayOfMonth(WEEK_DATES[0])}일 – {formatDayOfMonth(WEEK_DATES[6])}일 · 메뉴 {totalPlannedCount}개 계획됨
      </p>

      <div className="week-day-strip">
        {WEEK_DATES.map((date) => {
          const hasPlan = (plans.get(date)?.length ?? 0) > 0;
          const isSelected = date === selectedDate;
          return (
            <button
              type="button"
              key={date}
              className={`week-day-cell ${isSelected ? 'selected' : ''}`}
              onClick={() => setSelectedDate(date)}
            >
              <span className="week-day-label">{formatWeekdayShort(date)}</span>
              <span className="week-day-number">{formatDayOfMonth(date)}</span>
              <span className={`week-day-dot ${hasPlan ? 'has-plan' : ''}`} />
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="btn"
        style={{ width: '100%', marginBottom: 12 }}
        onClick={runAutoFill}
        disabled={autoFillLoading}
      >
        {autoFillLoading ? '채울 메뉴를 고르는 중...' : '✨ 이번 주 자동으로 채우기'}
      </button>
      {autoFillError && !autoFillPreview && (
        <p style={{ color: 'var(--danger)', marginTop: -8, marginBottom: 12 }}>{autoFillError}</p>
      )}

      {dailyNutritionTotal > 0 && (
        <p className="text-muted" style={{ marginTop: -12, marginBottom: 16 }}>
          이 날 합계 약 {Math.round(dailyNutritionTotal)}kcal
        </p>
      )}

      {MEAL_TYPES.map((mealType) => {
        const items = selectedDayPlans.filter((p) => p.mealType === mealType);
        const isAlwaysExpanded = mealType === 'dinner';
        const isExpanded = isAlwaysExpanded || items.length > 0 || manuallyExpanded.has(mealType);
        return (
          <MealTypeSection
            key={mealType}
            mealType={mealType}
            items={items}
            recipeById={recipeById}
            expanded={isExpanded}
            collapsible={!isAlwaysExpanded}
            isToday={selectedDate === today}
            bigCardPlanId={bigCardPlanId}
            onExpand={() =>
              setManuallyExpanded((prev) => {
                const next = new Set(prev);
                next.add(mealType);
                return next;
              })
            }
            onCollapse={() =>
              setManuallyExpanded((prev) => {
                const next = new Set(prev);
                next.delete(mealType);
                return next;
              })
            }
            onAdd={() => setPickerContext({ mealType })}
            onReplace={(planId) => setPickerContext({ mealType, replaceId: planId })}
            onRemove={handleRemovePlan}
            onChangeServings={handleUpdateServings}
            onViewRecipe={(recipeId) => setView({ screen: 'detail', recipeId })}
            onCookNow={(recipeId, servings) =>
              setView({ screen: 'detail', recipeId, autoCook: true, initialServings: servings })
            }
          />
        );
      })}

      <div className="weekly-continuation-box">
        <div className="weekly-continuation-kicker">🔗 재료 이어쓰기</div>
        <p style={{ margin: 0 }}>{continuationMessage ?? '이 날짜에 레시피를 배치하면 재료 이어쓰기 안내가 나와요.'}</p>
      </div>

      <div className="section-title">이 날 살 것</div>
      {selectedDayPlans.length === 0 && <p className="empty-hint">레시피를 먼저 배치해주세요.</p>}
      {selectedDayPlans.length > 0 && neededIngredients.length === 0 && (
        <p className="empty-hint">이 날은 냉장고 재료로 다 됩니다.</p>
      )}
      {neededIngredients.map((ingredient) => {
        const item = neededIngredientDetails.get(ingredient.id);
        const owned = pantryStatus[ingredient.id] ?? false;
        const isExpired = getPantryAvailability(ingredient) === 'expired_unconfirmed';
        return (
          <label className="weekly-buy-row" key={ingredient.id}>
            <button
              type="button"
              className={`weekly-buy-check ${owned ? 'checked' : ''} ${isExpired ? 'expired' : ''}`}
              onClick={() => (isExpired ? setExpiredConfirmId(ingredient.id) : setOwned(ingredient.id, !owned))}
              aria-label={isExpired ? `${ingredient.name} 유통기한 확인` : `${ingredient.name} 구매 체크`}
            >
              {isExpired ? '!' : owned && '✓'}
            </button>
            <span className="weekly-buy-body">
              <span className="weekly-buy-name">{ingredient.name}</span>
              {isExpired && <span className="weekly-buy-note">유통기한 지남 — 확인 필요</span>}
            </span>
            {item && (
              <span className="text-muted">
                {item.amount}
                {item.unit}
              </span>
            )}
          </label>
        );
      })}

      {pickerContext && (
        <MealPlanRecipePicker
          title={pickerContext.replaceId ? `${MEAL_TYPE_LABEL[pickerContext.mealType]} 메뉴 바꾸기` : `${MEAL_TYPE_LABEL[pickerContext.mealType]} 메뉴 정하기`}
          recipes={recipes}
          ingredientsById={ingredientsById}
          error={assignError}
          onPick={handlePickRecipe}
          onClose={() => setPickerContext(null)}
        />
      )}

      {autoFillPreview && (
        <AutoFillPreviewModal
          assignments={autoFillPreview}
          applying={autoFillApplying}
          error={autoFillError}
          onApply={applyAutoFill}
          onRetry={runAutoFill}
          onCancel={() => {
            setAutoFillPreview(null);
            setAutoFillError(null);
          }}
        />
      )}

      {expiredConfirmId && (
        <ExpiredConfirmModal
          ingredient={ingredientsById.get(expiredConfirmId)!}
          onClose={() => setExpiredConfirmId(null)}
          onResolve={async (stillGood) => {
            const target = ingredientsById.get(expiredConfirmId);
            if (!target) return;
            if (stillGood) {
              await saveIngredient({ ...target, expirationDate: undefined });
            } else {
              await saveIngredient({ ...target, owned: false });
            }
          }}
        />
      )}
    </div>
  );
}

function MealTypeSection({
  mealType,
  items,
  recipeById,
  expanded,
  collapsible,
  isToday,
  bigCardPlanId,
  onExpand,
  onCollapse,
  onAdd,
  onReplace,
  onRemove,
  onChangeServings,
  onViewRecipe,
  onCookNow,
}: {
  mealType: MealType;
  items: MealPlan[];
  recipeById: (id: string) => Recipe | undefined;
  expanded: boolean;
  collapsible: boolean;
  isToday: boolean;
  /** "다음 끼니"로 판정된 메뉴의 id — 이 항목만 큰 카드로 렌더링한다(1번 요구사항, mealTime.ts
   * pickNextMealPlan 기준). undefined면(그 날 메뉴가 아예 없음) 아무 항목도 큰 카드가 안 됨. */
  bigCardPlanId: string | undefined;
  onExpand: () => void;
  onCollapse: () => void;
  onAdd: () => void;
  onReplace: (planId: string) => void;
  onRemove: (planId: string) => void;
  onChangeServings: (planId: string, servings: number) => void;
  onViewRecipe: (recipeId: string) => void;
  /** B-5: 큰 카드(다음 끼니)에서만 제공하는 지름길 — 상세 화면을 거치지 않고 그 메뉴의 인분
   * 그대로 요리 모드로 바로 들어간다. */
  onCookNow: (recipeId: string, servings: number) => void;
}) {
  // 메뉴가 없는 끼니는 접힘이 기본값(2번 요구사항) — 제목+화살표만 있는 조용한 한 줄로, 탭하면
  // 펼쳐진다. 저녁은 항상 펼쳐져 있어 이 분기를 타지 않는다.
  if (collapsible && !expanded) {
    return (
      <button type="button" className="meal-section-collapsed" onClick={onExpand}>
        <span>{MEAL_TYPE_LABEL[mealType]}</span>
        <ChevronRight size={14} strokeWidth={2.75} />
      </button>
    );
  }

  return (
    <div className="meal-section">
      <div className="meal-section-head">
        <span className="meal-section-title">{MEAL_TYPE_LABEL[mealType]}</span>
        {collapsible && items.length === 0 && (
          <button type="button" className="home-link" onClick={onCollapse}>
            접기
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <button type="button" className="meal-add-box" onClick={onAdd}>
          + 메뉴 정하기
        </button>
      ) : (
        <>
          {items.map((item) => {
            const recipe = recipeById(item.recipeId);
            const isBigCard = item.id === bigCardPlanId;
            return isBigCard ? (
              <BigMealCard
                key={item.id}
                item={item}
                recipe={recipe}
                isToday={isToday}
                onView={() => onViewRecipe(item.recipeId)}
                onReplace={() => onReplace(item.id)}
                onRemove={() => onRemove(item.id)}
                onChangeServings={(next) => onChangeServings(item.id, next)}
                onCookNow={() => onCookNow(item.recipeId, item.servings)}
              />
            ) : (
              <SmallMealRow
                key={item.id}
                item={item}
                recipe={recipe}
                onView={() => onViewRecipe(item.recipeId)}
                onReplace={() => onReplace(item.id)}
                onRemove={() => onRemove(item.id)}
                onChangeServings={(next) => onChangeServings(item.id, next)}
              />
            );
          })}
          <button type="button" className="btn small" onClick={onAdd}>
            + 메뉴 추가
          </button>
        </>
      )}
    </div>
  );
}

function BigMealCard({
  item,
  recipe,
  isToday,
  onView,
  onReplace,
  onRemove,
  onChangeServings,
  onCookNow,
}: {
  item: MealPlan;
  recipe: Recipe | undefined;
  isToday: boolean;
  onView: () => void;
  onReplace: () => void;
  onRemove: () => void;
  onChangeServings: (next: number) => void;
  onCookNow: () => void;
}) {
  const coverImageId = recipe?.finalImageId ?? recipe?.steps.find((s) => s.imageId)?.imageId;
  const coverImageUrl = useStoredImage(coverImageId);

  return (
    <div className="weekly-day-card">
      <div className="weekly-day-image">
        {coverImageUrl ? (
          <img src={coverImageUrl} alt="" />
        ) : (
          <span className="weekly-day-image-placeholder">🍽️</span>
        )}
      </div>
      <div className="weekly-day-body">
        <div className="weekly-day-title">{recipe?.name ?? '(삭제된 레시피)'}</div>
        <div className="weekly-day-meta">
          {recipe?.estimatedMinutes != null && `${recipe.estimatedMinutes}분 · `}
          {isToday ? '오늘 · ' : ''}
          {recipe && item.servings !== recipe.servingsBase
            ? `${recipe.servingsBase}인분 레시피를 ${item.servings}인분으로`
            : `${item.servings}인분`}
        </div>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <div className="row" style={{ justifyContent: 'flex-start', gap: 8 }}>
            <button className="btn primary" onClick={onView}>
              레시피 보기
            </button>
            <button className="btn" onClick={onReplace}>
              바꾸기
            </button>
            <button className="btn danger" onClick={onRemove}>
              빼기
            </button>
          </div>
          <div className="stepper">
            <button onClick={() => onChangeServings(Math.max(1, item.servings - 1))}>−</button>
            <button onClick={() => onChangeServings(item.servings + 1)}>+</button>
          </div>
        </div>
        <button className="btn primary" style={{ width: '100%', marginTop: 8 }} onClick={onCookNow}>
          🍳 바로 요리하기
        </button>
      </div>
    </div>
  );
}

function SmallMealRow({
  item,
  recipe,
  onView,
  onReplace,
  onRemove,
  onChangeServings,
}: {
  item: MealPlan;
  recipe: Recipe | undefined;
  onView: () => void;
  onReplace: () => void;
  onRemove: () => void;
  onChangeServings: (next: number) => void;
}) {
  return (
    <div className="meal-item-row">
      <button type="button" className="meal-item-info" onClick={onView}>
        <strong>{recipe?.name ?? '(삭제된 레시피)'}</strong>
        <span className="text-muted" style={{ fontSize: 12 }}>
          {recipe?.estimatedMinutes != null && `${recipe.estimatedMinutes}분 · `}
          {item.servings}인분
        </span>
      </button>
      <div className="row" style={{ gap: 4, flexShrink: 0 }}>
        <div className="stepper" style={{ gap: 4 }}>
          <button onClick={() => onChangeServings(Math.max(1, item.servings - 1))}>−</button>
          <button onClick={() => onChangeServings(item.servings + 1)}>+</button>
        </div>
        <button className="btn small" onClick={onReplace}>
          바꾸기
        </button>
        <button className="btn small danger" onClick={onRemove}>
          빼기
        </button>
      </div>
    </div>
  );
}

function AutoFillPreviewModal({
  assignments,
  applying,
  error,
  onApply,
  onRetry,
  onCancel,
}: {
  assignments: AutoFillAssignment[];
  applying: boolean;
  error: string | null;
  onApply: () => void;
  onRetry: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>✨ 이번 주 자동으로 채우기</h2>
        <p className="text-muted" style={{ marginTop: -4 }}>
          보유 재료·자주 해먹은 메뉴·유통기한을 참고해서 저녁 메뉴를 골라봤어요. 이대로 채운 뒤에도
          마음에 안 드는 날만 "바꾸기"로 따로 바꿀 수 있어요.
        </p>
        <div className="meal-plan-picker-list" style={{ marginTop: 8, marginBottom: 12 }}>
          {assignments.map(({ date, recipe }) => (
            <div key={date} className="row" style={{ padding: '8px 4px', borderBottom: '1px solid var(--border)' }}>
              <span className="text-muted" style={{ fontSize: 13, flexShrink: 0 }}>
                {formatWeekdayShort(date)} {formatDayOfMonth(date)}일
              </span>
              <strong style={{ textAlign: 'right' }}>{recipe.name}</strong>
            </div>
          ))}
        </div>
        {error && <p style={{ color: 'var(--danger)', marginBottom: 8 }}>{error}</p>}
        <div className="row" style={{ gap: 6 }}>
          <button className="btn" onClick={onCancel} disabled={applying}>
            취소
          </button>
          <button className="btn" onClick={onRetry} disabled={applying}>
            다시 짜기
          </button>
          <button className="btn primary" onClick={onApply} disabled={applying}>
            {applying ? '반영 중...' : '이대로 채우기'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MealPlanRecipePicker({
  title,
  recipes,
  ingredientsById,
  error,
  onPick,
  onClose,
}: {
  title: string;
  recipes: Recipe[];
  ingredientsById: Map<string, Ingredient>;
  error: string | null;
  onPick: (recipeId: string) => void;
  onClose: () => void;
}) {
  const { tags } = useTags();
  const [query, setQuery] = useState('');
  // 추천 섹션(자주 해먹는 메뉴)용 — 모달이 열릴 때 한 번만 조회한다(recipeLikes.ts/cookingLog.ts의
  // "1회 조회" 패턴, 계속 구독하는 캐시가 아님).
  const [cookingCounts, setCookingCounts] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (recipes.length === 0) return;
    fetchCookingStats(recipes.map((r) => r.id))
      .then((stats) => {
        setCookingCounts(new Map(Array.from(stats.entries()).map(([id, s]) => [id, s.count])));
      })
      .catch((err) => console.error('자주 해먹은 메뉴 집계 실패:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "자주 해먹는 메뉴" — CookingLog 횟수 상위 3~4개, 기록이 없으면 섹션 자체가 숨는다.
  const frequentRecipes = useMemo(() => {
    return recipes
      .filter((r) => (cookingCounts.get(r.id) ?? 0) > 0)
      .sort((a, b) => (cookingCounts.get(b.id) ?? 0) - (cookingCounts.get(a.id) ?? 0))
      .slice(0, 4);
  }, [recipes, cookingCounts]);

  // "지금 재료로 가능" — 레시피가 쓰는 재료 전부가 보유 상태인 것만(RecipesPage의 "🧺 보유
  // 재료로 가능" 필터와 같은 기준, isRecipeMakeableWithPantry 공유).
  const pantryMatchRecipes = useMemo(() => {
    return recipes.filter((r) => isRecipeMakeableWithPantry(r, ingredientsById)).slice(0, 4);
  }, [recipes, ingredientsById]);

  const hasQuery = query.trim().length > 0;
  const filtered = hasQuery ? recipes.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase())) : recipes;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>

        {!hasQuery && frequentRecipes.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div className="section-title" style={{ marginBottom: 6, fontSize: 13 }}>
              🔁 자주 해먹는 메뉴
            </div>
            <div className="recipe-row-scroll" style={{ paddingBottom: 4 }}>
              {frequentRecipes.map((recipe) => (
                <RecipeCard
                  key={recipe.id}
                  recipe={recipe}
                  tagNames={resolveRecipeTagNames(recipe, tags)}
                  onClick={() => onPick(recipe.id)}
                  size="row"
                />
              ))}
            </div>
          </div>
        )}

        {!hasQuery && pantryMatchRecipes.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div className="section-title" style={{ marginBottom: 6, fontSize: 13 }}>
              🧺 지금 재료로 가능
            </div>
            <div className="recipe-row-scroll" style={{ paddingBottom: 4 }}>
              {pantryMatchRecipes.map((recipe) => (
                <RecipeCard
                  key={recipe.id}
                  recipe={recipe}
                  tagNames={resolveRecipeTagNames(recipe, tags)}
                  onClick={() => onPick(recipe.id)}
                  size="row"
                />
              ))}
            </div>
          </div>
        )}

        <div className="row pill-input-row">
          <Search size={16} strokeWidth={2.75} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="레시피 이름 검색" />
        </div>
        {error && <p style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</p>}
        {filtered.length === 0 && <p className="empty-hint">레시피가 없어요.</p>}
        <div className="meal-plan-picker-list" style={{ marginTop: 8 }}>
          {filtered.map((recipe) => (
            <RecipeListItem
              key={recipe.id}
              recipe={recipe}
              tagNames={resolveRecipeTagNames(recipe, tags)}
              onClick={() => onPick(recipe.id)}
            />
          ))}
        </div>
        <button className="btn" style={{ marginTop: 12, width: '100%' }} onClick={onClose}>
          취소
        </button>
      </div>
    </div>
  );
}
