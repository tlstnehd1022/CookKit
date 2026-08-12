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
  removeMealPlan,
  MEAL_TYPES,
  MEAL_TYPE_LABEL,
} from '../../data/mealPlans';
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

type View = { screen: 'week' } | { screen: 'detail'; recipeId: string } | { screen: 'edit'; recipeId: string };

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
        await addMealPlan(householdId, selectedDate, pickerContext.mealType, recipeId, existingCount);
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

  const today = todayDateString();
  const selectedIndex = WEEK_DATES.indexOf(selectedDate);
  const selectedDayPlans = plans.get(selectedDate) ?? [];
  const totalPlannedCount = Array.from(plans.values()).reduce((sum, list) => sum + list.length, 0);
  // "다음 끼니"(오늘이면 아직 안 지난 끼니, 아니면 그 날 첫 메뉴)를 큰 카드로 보여준다 — 어떤
  // 끼니 조합이든(저녁을 안 쓰는 가구 포함) 항상 이미지가 하나는 나오도록.
  const bigCardPlanId = pickNextMealPlan(selectedDayPlans, selectedDate === today)?.id;

  const dailyNutritionTotal = useMemo(() => {
    return dayRecipes(selectedDate).reduce(
      (sum, recipe) => sum + (recipe.nutrition ? recipe.nutrition.calories * recipe.servingsBase : 0),
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

  const neededIngredients = useMemo(() => {
    const ids = collectIngredientIds(dayRecipes(selectedDate));
    return Array.from(ids)
      .map((id) => ingredientsById.get(id))
      .filter((ing): ing is Ingredient => ing !== undefined && !ing.owned);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, plans, recipes, ingredientsById]);

  function findRecipeIngredient(recipeList: Recipe[], ingredientId: string) {
    for (const recipe of recipeList) {
      const item = recipe.ingredients.find((i) => i.ingredientId === ingredientId);
      if (item) return item;
    }
    return undefined;
  }

  if (view.screen === 'detail') {
    return (
      <RecipeDetailPage
        recipeId={view.recipeId}
        onBack={() => setView({ screen: 'week' })}
        onEdit={() => setView({ screen: 'edit', recipeId: view.recipeId })}
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
            onViewRecipe={(recipeId) => setView({ screen: 'detail', recipeId })}
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
        const item = findRecipeIngredient(dayRecipes(selectedDate), ingredient.id);
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
  onViewRecipe,
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
  onViewRecipe: (recipeId: string) => void;
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
                recipe={recipe}
                isToday={isToday}
                onView={() => onViewRecipe(item.recipeId)}
                onReplace={() => onReplace(item.id)}
                onRemove={() => onRemove(item.id)}
              />
            ) : (
              <SmallMealRow
                key={item.id}
                recipe={recipe}
                onView={() => onViewRecipe(item.recipeId)}
                onReplace={() => onReplace(item.id)}
                onRemove={() => onRemove(item.id)}
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
  recipe,
  isToday,
  onView,
  onReplace,
  onRemove,
}: {
  recipe: Recipe | undefined;
  isToday: boolean;
  onView: () => void;
  onReplace: () => void;
  onRemove: () => void;
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
          {recipe?.servingsBase}인분{isToday ? ' · 오늘' : ''}
        </div>
        <div className="row" style={{ justifyContent: 'flex-start', gap: 8, marginTop: 12 }}>
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
      </div>
    </div>
  );
}

function SmallMealRow({
  recipe,
  onView,
  onReplace,
  onRemove,
}: {
  recipe: Recipe | undefined;
  onView: () => void;
  onReplace: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="meal-item-row">
      <button type="button" className="meal-item-info" onClick={onView}>
        <strong>{recipe?.name ?? '(삭제된 레시피)'}</strong>
        <span className="text-muted" style={{ fontSize: 12 }}>
          {recipe?.estimatedMinutes != null && `${recipe.estimatedMinutes}분 · `}
          {recipe?.servingsBase}인분
        </span>
      </button>
      <div className="row" style={{ gap: 4, flexShrink: 0 }}>
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
