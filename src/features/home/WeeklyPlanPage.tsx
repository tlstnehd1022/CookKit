import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import {
  useRecipes,
  useIngredientsById,
  usePantryStatus,
  getCurrentHouseholdId,
} from '../../data/store';
import { useStoredImage } from '../../data/imageStore';
import { fetchMealPlans, setMealPlan } from '../../data/mealPlans';
import {
  getCurrentWeekDates,
  formatWeekdayShort,
  formatWeekdayLong,
  formatDayOfMonth,
  todayDateString,
} from '../../lib/weekDates';
import { getExpirationInfo, formatExpirationBadge } from '../../lib/expiration';
import { getErrorMessage } from '../../lib/errorMessage';
import { RecipeDetailPage } from '../recipes/RecipeDetailPage';
import { RecipeEditor } from '../recipes/RecipeEditor';
import type { Ingredient, MealPlan, Recipe } from '../../data/types';

type View = { screen: 'week' } | { screen: 'detail'; recipeId: string } | { screen: 'edit'; recipeId: string };

const WEEK_DATES = getCurrentWeekDates();

function findRecipeIngredient(recipe: Recipe | undefined, ingredientId: string) {
  return recipe?.ingredients.find((i) => i.ingredientId === ingredientId);
}

/** 두 레시피가 같이 쓰는 재료 이름 목록(중복 제거) — "이어 쓰기" 안내의 재료 겹침 판단 근거. */
function sharedIngredientNames(a: Recipe | undefined, b: Recipe | undefined, ingredientsById: Map<string, Ingredient>) {
  if (!a || !b) return [];
  const bIds = new Set(b.ingredients.map((i) => i.ingredientId));
  const names = new Set<string>();
  for (const item of a.ingredients) {
    if (bIds.has(item.ingredientId)) {
      const name = ingredientsById.get(item.ingredientId)?.name;
      if (name) names.add(name);
    }
  }
  return Array.from(names);
}

export function WeeklyPlanPage({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<View>({ screen: 'week' });
  const [selectedDate, setSelectedDate] = useState(todayDateString());
  const [plans, setPlans] = useState<Map<string, MealPlan>>(new Map());
  const [showPicker, setShowPicker] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

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

  function recipeForDate(date: string): Recipe | undefined {
    const plan = plans.get(date);
    return plan ? recipes.find((r) => r.id === plan.recipeId) : undefined;
  }

  async function handlePickRecipe(recipeId: string) {
    if (!householdId) return;
    setAssignError(null);
    try {
      await setMealPlan(householdId, selectedDate, recipeId);
      setShowPicker(false);
      await refresh();
    } catch (err) {
      console.error('일정 배치 실패:', err);
      setAssignError(getErrorMessage(err, '레시피를 배치하지 못했어요.'));
    }
  }

  const today = todayDateString();
  const selectedIndex = WEEK_DATES.indexOf(selectedDate);
  const selectedRecipe = recipeForDate(selectedDate);
  const plannedCount = plans.size;

  // 아래 조건부 return(view.screen !== 'week')보다 반드시 위에 있어야 한다 — 훅은 매 렌더
  // 동일한 순서로 호출돼야 하는데, 조건부 return 뒤에 두면 view가 바뀔 때 호출 순서가 달라져
  // "Rules of Hooks" 위반이 된다.
  const coverImageId = selectedRecipe?.finalImageId ?? selectedRecipe?.steps.find((s) => s.imageId)?.imageId;
  const coverImageUrl = useStoredImage(coverImageId);

  const continuationMessage = useMemo(() => {
    if (!selectedRecipe) return null;
    const prevDate = selectedIndex > 0 ? WEEK_DATES[selectedIndex - 1] : null;
    const nextDate = selectedIndex < WEEK_DATES.length - 1 ? WEEK_DATES[selectedIndex + 1] : null;
    const prevRecipe = prevDate ? recipeForDate(prevDate) : undefined;
    const nextRecipe = nextDate ? recipeForDate(nextDate) : undefined;
    const shared = Array.from(
      new Set([
        ...sharedIngredientNames(selectedRecipe, prevRecipe, ingredientsById),
        ...sharedIngredientNames(selectedRecipe, nextRecipe, ingredientsById),
      ]),
    );
    if (shared.length === 0) return '이 날 재료는 앞뒤 요일과 겹치지 않아요.';

    // 겹치는 재료 중 유통기한이 임박/경과한 게 있으면 그걸 우선 안내
    for (const name of shared) {
      const ingredientId = selectedRecipe.ingredients.find((i) => ingredientsById.get(i.ingredientId)?.name === name)
        ?.ingredientId;
      const info = ingredientId ? getExpirationInfo(ingredientsById.get(ingredientId)?.expirationDate) : null;
      if (info) {
        return `${name}을(를) 앞뒤 요일과 같이 써요. ${formatExpirationBadge(info)}예요.`;
      }
    }
    return `${shared.join(', ')}을(를) 앞뒤 요일과 같이 써요.`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRecipe, selectedIndex, plans, ingredientsById]);

  const neededIngredients = selectedRecipe
    ? Array.from(new Set(selectedRecipe.ingredients.map((i) => i.ingredientId)))
        .map((id) => ingredientsById.get(id))
        .filter((ing): ing is Ingredient => ing !== undefined && !ing.owned)
    : [];

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
        {formatDayOfMonth(WEEK_DATES[0])}일 – {formatDayOfMonth(WEEK_DATES[6])}일 · {plannedCount}끼 계획됨
      </p>

      <div className="week-day-strip">
        {WEEK_DATES.map((date) => {
          const hasPlan = plans.has(date);
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

      <div className="weekly-day-card">
        <div className="weekly-day-image">
          {selectedRecipe ? (
            coverImageUrl ? (
              <img src={coverImageUrl} alt="" />
            ) : (
              <span className="weekly-day-image-placeholder">🍽️</span>
            )
          ) : null}
        </div>
        <div className="weekly-day-body">
          <div className="weekly-day-kicker">{formatWeekdayLong(selectedDate)} 저녁</div>
          <div className="weekly-day-title">{selectedRecipe ? selectedRecipe.name : '아직 정하지 않았어요'}</div>
          <div className="weekly-day-meta">
            {selectedRecipe ? (
              <>
                {selectedRecipe.estimatedMinutes != null && `${selectedRecipe.estimatedMinutes}분 · `}
                {selectedRecipe.servingsBase}인분{selectedDate === today ? ' · 오늘' : ''}
              </>
            ) : (
              '냉장고 재료로 만들 레시피를 골라보세요'
            )}
          </div>
          <div className="row" style={{ justifyContent: 'flex-start', gap: 8, marginTop: 12 }}>
            {selectedRecipe ? (
              <>
                <button className="btn primary" onClick={() => setView({ screen: 'detail', recipeId: selectedRecipe.id })}>
                  레시피 보기
                </button>
                <button className="btn" onClick={() => setShowPicker(true)}>
                  바꾸기
                </button>
              </>
            ) : (
              <button className="btn primary" onClick={() => setShowPicker(true)}>
                메뉴 정하기
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="weekly-continuation-box">
        <div className="weekly-continuation-kicker">이어 쓰기</div>
        <p style={{ margin: 0 }}>{continuationMessage ?? '이 날짜에 레시피를 배치하면 이어 쓰기 안내가 나와요.'}</p>
      </div>

      <div className="section-title">이 날 살 것</div>
      {!selectedRecipe && <p className="empty-hint">레시피를 먼저 배치해주세요.</p>}
      {selectedRecipe && neededIngredients.length === 0 && (
        <p className="empty-hint">이 날은 냉장고 재료로 다 됩니다.</p>
      )}
      {neededIngredients.map((ingredient) => {
        const item = findRecipeIngredient(selectedRecipe, ingredient.id);
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

      {showPicker && (
        <MealPlanRecipePicker
          recipes={recipes}
          error={assignError}
          onPick={handlePickRecipe}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

function MealPlanRecipePicker({
  recipes,
  error,
  onPick,
  onClose,
}: {
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
        <h2>메뉴 정하기</h2>
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
