import { useEffect, useMemo, useState } from 'react';
import { Search, ChevronRight, Clock, Flame, User } from 'lucide-react';
import {
  useRecipes,
  useIngredients,
  useIngredientsById,
  getCurrentHouseholdId,
} from '../../data/store';
import { useProfile } from '../../data/profile';
import { useStoredImage } from '../../data/imageStore';
import { setActiveTab, useActiveTab } from '../../data/activeTab';
import { useShoppingSelection } from '../../data/shoppingSelection';
import { requestRecipeSearchFocus } from '../../data/recipeSearchFocus';
import { useProfileSheetRequested, clearProfileSheetRequest } from '../../data/profileSheet';
import { useNotifications } from '../../data/notifications';
import { getExpirationInfo, formatExpirationBadge } from '../../lib/expiration';
import { pickTodayRecommendation, pickBestRecipeUsingIngredient } from '../../lib/recipeRecommendation';
import { fetchMealPlans } from '../../data/mealPlans';
import { fetchTodayCookingLog } from '../../data/cookingLog';
import { getCurrentWeekDates, formatWeekdayShort, formatDayOfMonth, todayDateString } from '../../lib/weekDates';
import { pickGreeting, TIME_SLOT_LABEL } from '../../lib/homeGreeting';
import { DIFFICULTY_LABEL } from '../../lib/recipeDifficulty';
import { RecipeDetailPage } from '../recipes/RecipeDetailPage';
import { RecipeEditor } from '../recipes/RecipeEditor';
import { ProfileSheet } from '../settings/ProfileSheet';
import { WeeklyPlanPage } from './WeeklyPlanPage';
import type { MealPlan, Recipe } from '../../data/types';

type View =
  | { screen: 'feed' }
  | { screen: 'detail'; recipeId: string }
  | { screen: 'edit'; recipeId: string }
  | { screen: 'weekly-plan' };

const OWNED_CHIP_LIMIT = 6;
const EXPIRING_LIMIT = 4;
const WEEK_DATES = getCurrentWeekDates();

export function HomePage() {
  const [view, setView] = useState<View>({ screen: 'feed' });
  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const [weekPlans, setWeekPlans] = useState<Map<string, MealPlan>>(new Map());
  const [cookedTodayRecipeName, setCookedTodayRecipeName] = useState<string | undefined>(undefined);
  const profileSheetRequested = useProfileSheetRequested();

  const { recipes } = useRecipes();
  const { ingredients } = useIngredients();
  const ingredientsById = useIngredientsById();
  const { profile } = useProfile();
  const { selectedRecipeIds } = useShoppingSelection();
  const { unreadCount } = useNotifications();
  const activeTab = useActiveTab();
  const householdId = getCurrentHouseholdId();

  useEffect(() => {
    if (profileSheetRequested) {
      setShowProfileSheet(true);
      clearProfileSheetRequest();
    }
  }, [profileSheetRequested]);

  useEffect(() => {
    if (!householdId) return;
    let cancelled = false;
    fetchMealPlans(householdId, WEEK_DATES[0], WEEK_DATES[6])
      .then((result) => {
        if (!cancelled) setWeekPlans(result);
      })
      .catch((err) => console.error('주간 일정 조회 실패:', err));
    return () => {
      cancelled = true;
    };
  }, [householdId]);

  // 인사말 우선순위 1번(오늘 이미 요리함)의 근거 데이터 — 홈 탭으로 돌아올 때마다(다른 탭에서
  // 요리를 완료했을 수도 있고, 홈 안에서 push했다 돌아왔을 수도 있어 둘 다 트리거로 잡는다)
  // 다시 조회해서 "의미 있는 행동 직후 즉시 반영" 요구사항을 만족시킨다.
  useEffect(() => {
    if (!householdId || activeTab !== 'home' || view.screen !== 'feed') return;
    let cancelled = false;
    fetchTodayCookingLog(householdId, todayDateString())
      .then((result) => {
        if (!cancelled) setCookedTodayRecipeName(result?.recipeName);
      })
      .catch((err) => console.error('오늘 요리 기록 조회 실패:', err));
    return () => {
      cancelled = true;
    };
  }, [householdId, activeTab, view.screen]);

  const ownedIngredients = useMemo(() => ingredients.filter((i) => i.owned), [ingredients]);

  const expiringSoon = useMemo(() => {
    return ingredients
      .map((ingredient) => ({ ingredient, info: getExpirationInfo(ingredient.expirationDate) }))
      .filter((entry): entry is { ingredient: (typeof ingredients)[number]; info: NonNullable<typeof entry.info> } =>
        Boolean(entry.info),
      )
      .sort((a, b) => a.info.daysLeft - b.info.daysLeft)
      .slice(0, EXPIRING_LIMIT);
  }, [ingredients]);

  const recommendation = useMemo(() => pickTodayRecommendation(recipes, ingredientsById), [recipes, ingredientsById]);
  const recommendationImageId =
    recommendation?.recipe.finalImageId ?? recommendation?.recipe.steps.find((s) => s.imageId)?.imageId;
  const recommendationImageUrl = useStoredImage(recommendationImageId);

  const today = todayDateString();
  const greetingName = profile?.displayName ? `${profile.displayName}님` : '';

  const todayPlanRecipeName = recipes.find((r) => r.id === weekPlans.get(today)?.recipeId)?.name;
  // 우선순위 3번은 "임박(3일 이내)"만 대상 — expiringSoon은 soon(4~7일)까지 포함하므로 따로 좁힌다.
  const urgentIngredientName = expiringSoon.find(({ info }) => info.level === 'urgent')?.ingredient.name;
  const greeting = pickGreeting({
    now: new Date(),
    dateStr: today,
    cookedTodayRecipeName: cookedTodayRecipeName,
    todayMealRecipeName: todayPlanRecipeName,
    expiringIngredientName: urgentIngredientName,
    hasShoppingSelection: selectedRecipeIds.length > 0,
  });
  const todayWeekdayLabel = `${formatWeekdayShort(today)}요일 ${TIME_SLOT_LABEL[greeting.timeSlot]}`;

  function openRecipe(recipeId: string) {
    setView({ screen: 'detail', recipeId });
  }

  function findRecipeUsingIngredient(ingredientId: string) {
    return pickBestRecipeUsingIngredient(recipes, ingredientsById, ingredientId)?.recipe ?? null;
  }

  if (view.screen === 'detail') {
    return (
      <RecipeDetailPage
        recipeId={view.recipeId}
        onBack={() => setView({ screen: 'feed' })}
        onEdit={() => setView({ screen: 'edit', recipeId: view.recipeId })}
      />
    );
  }

  if (view.screen === 'edit') {
    return <RecipeEditor recipeId={view.recipeId} onDone={() => setView({ screen: 'detail', recipeId: view.recipeId })} />;
  }

  if (view.screen === 'weekly-plan') {
    return <WeeklyPlanPage onBack={() => setView({ screen: 'feed' })} />;
  }

  return (
    <div className="home-page">
      <div className="home-greeting">
        <div>
          <div className="home-greeting-sub">
            {todayWeekdayLabel}
            {greetingName ? ` · ${greetingName}` : ''}
          </div>
          <h1 className="home-greeting-title">{greeting.text}</h1>
        </div>
        <button
          type="button"
          className="home-avatar-btn"
          onClick={() => setShowProfileSheet(true)}
          aria-label="프로필 및 설정"
        >
          {unreadCount > 0 && <span className="home-avatar-dot" />}
          {profile?.avatarUrl ? (
            <img src={profile.avatarUrl} alt="" />
          ) : (
            <User size={20} strokeWidth={2.75} />
          )}
        </button>
      </div>

      <button type="button" className="home-search-field" onClick={() => requestRecipeSearchFocus()}>
        <Search size={18} strokeWidth={2.75} />
        <span>레시피나 재료 검색</span>
      </button>

      <div className="home-section">
        <div className="home-section-head">
          <span className="home-section-title">냉장고에 있는 재료</span>
          <button type="button" className="home-link" onClick={() => setActiveTab('ingredients')}>
            모두 보기
          </button>
        </div>
        {ownedIngredients.length === 0 ? (
          <p className="text-muted">아직 보유 중인 재료가 없어요.</p>
        ) : (
          <div className="chip-row">
            {ownedIngredients.slice(0, OWNED_CHIP_LIMIT).map((ingredient) => (
              <span className="chip" key={ingredient.id}>
                {ingredient.name}
              </span>
            ))}
            {ownedIngredients.length > OWNED_CHIP_LIMIT && (
              <span className="chip home-chip-more">+ {ownedIngredients.length - OWNED_CHIP_LIMIT}개 더</span>
            )}
          </div>
        )}
      </div>

      {recommendation && (
        <div className="home-section">
          <button type="button" className="home-recommend-card" onClick={() => openRecipe(recommendation.recipe.id)}>
            <div className="home-recommend-image">
              {recommendationImageUrl ? (
                <img src={recommendationImageUrl} alt="" />
              ) : (
                <span className="home-recommend-placeholder">🍽️</span>
              )}
              <span className="home-recommend-badge">
                재료 {recommendation.totalCount}개 중 {recommendation.ownedCount}개 있어요
              </span>
            </div>
            <div className="home-recommend-body">
              <div className="home-recommend-kicker">오늘의 추천</div>
              <div className="home-recommend-title">{recommendation.recipe.name}</div>
              <div className="home-recommend-meta">
                {recommendation.recipe.estimatedMinutes != null && (
                  <span>
                    <Clock size={13} strokeWidth={2.75} /> {recommendation.recipe.estimatedMinutes}분
                  </span>
                )}
                {recommendation.recipe.difficulty && (
                  <span>
                    <Flame size={13} strokeWidth={2.75} /> {DIFFICULTY_LABEL[recommendation.recipe.difficulty]}
                  </span>
                )}
                <span>{recommendation.recipe.servingsBase}인분</span>
              </div>
            </div>
          </button>
        </div>
      )}

      <div className="home-section">
        <div className="home-section-head">
          <span className="home-section-title">이번 주 일정</span>
          <button type="button" className="home-link" onClick={() => setView({ screen: 'weekly-plan' })}>
            전체 보기
          </button>
        </div>
        <div className="home-week-strip">
          {WEEK_DATES.map((date) => {
            const plan = weekPlans.get(date);
            const planRecipe = plan ? recipes.find((r: Recipe) => r.id === plan.recipeId) : undefined;
            const isToday = date === today;
            return (
              <button
                type="button"
                key={date}
                className={`home-week-cell ${isToday ? 'today' : ''}`}
                onClick={() => setView({ screen: 'weekly-plan' })}
              >
                <div className="home-week-day">{formatWeekdayShort(date)}</div>
                <div className="home-week-date">{formatDayOfMonth(date)}</div>
                <div className="home-week-menu">{planRecipe ? planRecipe.name : ''}</div>
              </button>
            );
          })}
        </div>
      </div>

      {expiringSoon.length > 0 && (
        <div className="home-section">
          <div className="home-section-head">
            <span className="home-section-title">유통기한이 다가와요</span>
          </div>
          {expiringSoon.map(({ ingredient, info }) => {
            const matchedRecipe = findRecipeUsingIngredient(ingredient.id);
            return (
              <div className="home-expiring-row" key={ingredient.id}>
                <span className="home-expiring-thumb">🥕</span>
                <div className="home-expiring-info">
                  <div className="home-expiring-name">{ingredient.name}</div>
                  <div className="home-expiring-days">{formatExpirationBadge(info)}</div>
                </div>
                {matchedRecipe && (
                  <button type="button" className="chip selectable home-expiring-pill" onClick={() => openRecipe(matchedRecipe.id)}>
                    레시피 <ChevronRight size={12} strokeWidth={2.75} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showProfileSheet && <ProfileSheet onClose={() => setShowProfileSheet(false)} />}
    </div>
  );
}
