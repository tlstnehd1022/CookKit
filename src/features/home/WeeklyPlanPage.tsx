import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  useRecipes,
  useIngredientsById,
  usePantryStatus,
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
import { scaleAmount } from '../../data/computed';
import { pickNextMealPlan } from '../../lib/mealTime';
import {
  getCurrentWeekDates,
  formatWeekdayShort,
  formatDayOfMonth,
  todayDateString,
} from '../../lib/weekDates';
import { getExpirationInfo, formatExpirationBadge } from '../../lib/expiration';
import { getErrorMessage } from '../../lib/errorMessage';
import { RecipeDetailPage } from '../recipes/RecipeDetailPage';
import { RecipeEditor } from '../recipes/RecipeEditor';
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
  // 끼니 섹션 펼침 상태는 저장하지 않고(2번 요구사항), 이 화면에 머무는 동안만 사용자가 직접
  // 펼친 끼니를 기억한다 — 날짜를 바꾸면 초기화된다(아래 useEffect).
  const [manuallyExpanded, setManuallyExpanded] = useState<Set<MealType>>(new Set());

  const householdId = getCurrentHouseholdId();
  const { household } = useHousehold();
  const { recipes } = useRecipes();
  const ingredientsById = useIngredientsById();
  const { pantryStatus, setOwned } = usePantryStatus();

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

    // 겹치는 재료 중 유통기한이 임박/경과한 게 있으면 그걸 우선 안내
    for (const id of sharedIds) {
      const info = getExpirationInfo(ingredientsById.get(id)?.expirationDate);
      if (info) {
        const name = ingredientsById.get(id)?.name;
        return `${name}을(를) 앞뒤 요일과 같이 써요. ${formatExpirationBadge(info)}예요.`;
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

  const neededIngredients = useMemo(() => {
    return Array.from(neededIngredientDetails.keys())
      .map((id) => ingredientsById.get(id))
      .filter((ing): ing is Ingredient => ing !== undefined && !ing.owned);
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
        <div className="weekly-continuation-kicker">이어 쓰기</div>
        <p style={{ margin: 0 }}>{continuationMessage ?? '이 날짜에 레시피를 배치하면 이어 쓰기 안내가 나와요.'}</p>
      </div>

      <div className="section-title">이 날 살 것</div>
      {selectedDayPlans.length === 0 && <p className="empty-hint">레시피를 먼저 배치해주세요.</p>}
      {selectedDayPlans.length > 0 && neededIngredients.length === 0 && (
        <p className="empty-hint">이 날은 냉장고 재료로 다 됩니다.</p>
      )}
      {neededIngredients.map((ingredient) => {
        const item = neededIngredientDetails.get(ingredient.id);
        const owned = pantryStatus[ingredient.id] ?? false;
        return (
          <label className="weekly-buy-row" key={ingredient.id}>
            <button
              type="button"
              className={`weekly-buy-check ${owned ? 'checked' : ''}`}
              onClick={() => setOwned(ingredient.id, !owned)}
              aria-label={`${ingredient.name} 구매 체크`}
            >
              {owned && '✓'}
            </button>
            <span className="weekly-buy-name">{ingredient.name}</span>
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
          error={assignError}
          onPick={handlePickRecipe}
          onClose={() => setPickerContext(null)}
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

function MealPlanRecipePicker({
  title,
  recipes,
  error,
  onPick,
  onClose,
}: {
  title: string;
  recipes: Recipe[];
  error: string | null;
  onPick: (recipeId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = query.trim()
    ? recipes.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()))
    : recipes;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="레시피 이름 검색"
          style={{ marginBottom: 10 }}
        />
        {error && <p style={{ color: 'var(--danger)', marginBottom: 8 }}>{error}</p>}
        {filtered.length === 0 && <p className="empty-hint">레시피가 없어요.</p>}
        <div className="meal-plan-picker-list">
          {filtered.map((recipe) => (
            <button type="button" key={recipe.id} className="meal-plan-picker-item" onClick={() => onPick(recipe.id)}>
              {recipe.name}
            </button>
          ))}
        </div>
        <button className="btn" style={{ marginTop: 12, width: '100%' }} onClick={onClose}>
          취소
        </button>
      </div>
    </div>
  );
}
