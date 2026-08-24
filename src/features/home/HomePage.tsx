import { useEffect, useMemo, useState } from 'react';
import { Search, ChevronRight, Clock, Flame, User } from 'lucide-react';
import {
  useRecipes,
  useIngredients,
  useIngredientsById,
  getCurrentHouseholdId,
} from '../../data/store';
import { useProfile } from '../../data/profile';
import { useHousehold } from '../../data/household';
import { useStoredImage } from '../../data/imageStore';
import { setActiveTab, useActiveTab } from '../../data/activeTab';
import { useShoppingSelection } from '../../data/shoppingSelection';
import { requestRecipeSearchFocus } from '../../data/recipeSearchFocus';
import { requestMaxMinutesFilter } from '../../data/recipeTimeFilterRequest';
import { useProfileSheetRequested, clearProfileSheetRequest } from '../../data/profileSheet';
import {
  hasSeenOnboardingTour,
  useOnboardingTourRestartRequested,
  clearOnboardingTourRestartRequest,
} from '../../data/onboardingTour';
import { useNotifications } from '../../data/notifications';
import { getExpirationInfo, formatExpirationBadge } from '../../lib/expiration';
import { isPantryUsable } from '../../lib/pantryAvailability';
import {
  pickTodayRecommendations,
  pickBestRecipeUsingIngredient,
  type RecommendationCandidate,
  type RecommendationReason,
} from '../../lib/recipeRecommendation';
import { fetchMealPlans } from '../../data/mealPlans';
import { pickNextMealPlan } from '../../lib/mealTime';
import {
  fetchTodayCookingLog,
  fetchMonthlyCookingCount,
  fetchUncleanedRecentCookingLog,
  fetchCookingStats,
  type UncleanedCookingLog,
  type CookingStats,
} from '../../data/cookingLog';
import { getCurrentWeekDates, formatWeekdayShort, formatDayOfMonth, todayDateString } from '../../lib/weekDates';
import { pickGreeting, TIME_SLOT_LABEL } from '../../lib/homeGreeting';
import { DIFFICULTY_LABEL } from '../../lib/recipeDifficulty';
import { RecipeDetailPage } from '../recipes/RecipeDetailPage';
import { RecipeEditor } from '../recipes/RecipeEditor';
import { CookingHistoryPage } from '../recipes/CookingHistoryPage';
import { PantryTidyModal } from '../ingredients/PantryTidyModal';
import { ProfileSheet } from '../settings/ProfileSheet';
import { WeeklyPlanPage } from './WeeklyPlanPage';
import { OnboardingTour } from './OnboardingTour';
import type { MealPlan, Recipe } from '../../data/types';

type View =
  | { screen: 'feed' }
  | { screen: 'detail'; recipeId: string; autoCook?: boolean; initialServings?: number }
  | { screen: 'edit'; recipeId?: string; initialChatPrompt?: string; initialOwnedIngredientIds?: string[] }
  | { screen: 'weekly-plan' }
  | { screen: 'cooking-history' };

const OWNED_CHIP_LIMIT = 6;
const EXPIRING_LIMIT = 4;
const QUICK_RECIPE_MAX_MINUTES = 20;
const QUICK_RECIPE_MIN_COUNT = 3;
const WEEK_DATES = getCurrentWeekDates();

export function HomePage() {
  const [view, setView] = useState<View>({ screen: 'feed' });
  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const [weekPlans, setWeekPlans] = useState<Map<string, MealPlan[]>>(new Map());
  const [cookedTodayRecipeName, setCookedTodayRecipeName] = useState<string | undefined>(undefined);
  const [monthlyCookingCount, setMonthlyCookingCount] = useState<number | null>(null);
  const [uncleanedLog, setUncleanedLog] = useState<UncleanedCookingLog | null>(null);
  const [cookingStatsById, setCookingStatsById] = useState<Map<string, CookingStats>>(new Map());
  const [showPantryTidy, setShowPantryTidy] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const profileSheetRequested = useProfileSheetRequested();
  const tourRestartRequested = useOnboardingTourRestartRequested();

  const { recipes } = useRecipes();
  const { ingredients } = useIngredients();
  const ingredientsById = useIngredientsById();
  const { profile } = useProfile();
  const { household } = useHousehold();
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

  // 신규 가구가 household 생성(+알러지 온보딩) 직후 처음 홈 화면에 진입하는 시점이 곧 이
  // 컴포넌트의 첫 마운트 시점이라(온보딩 중에는 HomePage 자체가 렌더되지 않음), 마운트 시
  // 한 번 "봤음" 플래그만 확인하면 별도의 트리거 신호 없이 자동 시작 요구사항을 만족한다.
  useEffect(() => {
    if (!hasSeenOnboardingTour()) setShowTour(true);
  }, []);

  // 프로필 바텀시트의 "앱 사용법 다시 보기" — 플래그와 무관하게 언제든 재실행.
  useEffect(() => {
    if (tourRestartRequested) {
      setShowTour(true);
      clearOnboardingTourRestartRequest();
    }
  }, [tourRestartRequested]);

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

  // A-2(이번 달 요리 횟수)/A-4(냉장고 정리 안 함 안내) 근거 데이터 — 위 오늘 요리 조회와 같은
  // 시점(홈 진입/복귀)에 함께 다시 불러온다.
  useEffect(() => {
    if (!householdId || activeTab !== 'home' || view.screen !== 'feed') return;
    let cancelled = false;
    fetchMonthlyCookingCount(householdId)
      .then((result) => {
        if (!cancelled) setMonthlyCookingCount(result);
      })
      .catch((err) => console.error('이번 달 요리 횟수 조회 실패:', err));
    fetchUncleanedRecentCookingLog(householdId)
      .then((result) => {
        if (!cancelled) setUncleanedLog(result);
      })
      .catch((err) => console.error('냉장고 정리 여부 조회 실패:', err));
    return () => {
      cancelled = true;
    };
  }, [householdId, activeTab, view.screen]);

  // "오늘 뭐 먹지?" 추천의 "🔁 오랜만이에요" 후보(pickTodayRecommendations)용 — 위 두 조회와
  // 같은 시점(홈 진입/복귀)에 다시 불러와서 요리 완료 직후에도 반영되게 한다.
  useEffect(() => {
    if (!householdId || activeTab !== 'home' || view.screen !== 'feed' || recipes.length === 0) return;
    let cancelled = false;
    fetchCookingStats(recipes.map((r) => r.id))
      .then((result) => {
        if (!cancelled) setCookingStatsById(result);
      })
      .catch((err) => console.error('요리 기록 통계 조회 실패:', err));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, activeTab, view.screen, recipes.map((r) => r.id).join(',')]);

  const ownedIngredients = useMemo(() => ingredients.filter((i) => i.owned), [ingredients]);
  // "있는 재료로 레시피 추가"용 — 유통기한 지나 확인이 필요한 재료는 제안 재료 목록에서 제외한다.
  const usableIngredients = useMemo(() => ownedIngredients.filter((i) => isPantryUsable(i)), [ownedIngredients]);

  // A-1: 예상 조리시간이 짧은 순으로, 최소 3개 이상일 때만 섹션 노출(빈약해 보이지 않게)
  const quickRecipes = useMemo(() => {
    const candidates = recipes
      .filter((r) => r.estimatedMinutes != null && r.estimatedMinutes <= QUICK_RECIPE_MAX_MINUTES)
      .sort((a, b) => (a.estimatedMinutes ?? 0) - (b.estimatedMinutes ?? 0));
    return candidates.length >= QUICK_RECIPE_MIN_COUNT ? candidates : [];
  }, [recipes]);

  // owned=false인 재료는 유통기한이 설정돼 있어도 애초에 냉장고에 없는 것이라 대상에서 제외한다
  // (IngredientsPage.tsx와 같은 기준).
  const expiringSoon = useMemo(() => {
    return ingredients
      .filter((ingredient) => ingredient.owned)
      .map((ingredient) => ({ ingredient, info: getExpirationInfo(ingredient.expirationDate) }))
      .filter((entry): entry is { ingredient: (typeof ingredients)[number]; info: NonNullable<typeof entry.info> } =>
        Boolean(entry.info),
      )
      .sort((a, b) => a.info.daysLeft - b.info.daysLeft)
      .slice(0, EXPIRING_LIMIT);
  }, [ingredients]);

  const recommendations = useMemo(
    () => pickTodayRecommendations(recipes, ingredientsById, cookingStatsById),
    [recipes, ingredientsById, cookingStatsById],
  );

  const today = todayDateString();
  const greetingName = profile?.displayName ? `${profile.displayName}님` : '';

  // "다음 끼니"(아직 안 지난 끼니 중 가장 이른 것, 전부 지났으면 그 날 첫 메뉴)를 오늘의 인사말
  // 대상으로 삼는다 — 오후 3시에 점심 메뉴를 말하면 어색하므로. 같은 끼니에 메뉴가 여러 개면
  // "OO 외 n개"로 요약(끼니 단위 카운트 — 하루 전체 개수가 아님).
  const todayPlans = weekPlans.get(today) ?? [];
  const todayNextPlan = pickNextMealPlan(todayPlans, true);
  const todayNextRecipeName = todayNextPlan
    ? recipes.find((r) => r.id === todayNextPlan.recipeId)?.name
    : undefined;
  const todayNextMealCount = todayNextPlan
    ? todayPlans.filter((p) => p.mealType === todayNextPlan.mealType).length
    : 0;
  const todayNextMealLabel =
    todayNextRecipeName && todayNextMealCount > 1
      ? `${todayNextRecipeName} 외 ${todayNextMealCount - 1}개`
      : todayNextRecipeName;
  // "임박(D-2 이내)"만 대상 — expiringSoon은 soon(D-3~7)까지 포함하므로 따로 좁힌다.
  const urgentIngredientName = expiringSoon.find(({ info }) => info.level === 'urgent')?.ingredient.name;
  // A-7: "지남"은 다른 모든 안내보다 먼저 보여준다(사용자 확인이 필요한 상태라서).
  const expiredIngredientName = expiringSoon.find(({ info }) => info.level === 'expired')?.ingredient.name;
  const greeting = pickGreeting({
    now: new Date(),
    dateStr: today,
    expiredIngredientName,
    cookedTodayRecipeName: cookedTodayRecipeName,
    todayNextMeal:
      todayNextPlan && todayNextMealLabel ? { mealType: todayNextPlan.mealType, menuLabel: todayNextMealLabel } : undefined,
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
        autoStartCookingMode={view.autoCook}
        initialServings={view.initialServings}
      />
    );
  }

  if (view.screen === 'edit') {
    return (
      <RecipeEditor
        recipeId={view.recipeId}
        initialChatPrompt={view.initialChatPrompt}
        initialOwnedIngredientIds={view.initialOwnedIngredientIds}
        onDone={() => setView(view.recipeId ? { screen: 'detail', recipeId: view.recipeId } : { screen: 'feed' })}
      />
    );
  }

  if (view.screen === 'weekly-plan') {
    return <WeeklyPlanPage onBack={() => setView({ screen: 'feed' })} />;
  }

  if (view.screen === 'cooking-history') {
    return householdId ? (
      <CookingHistoryPage householdId={householdId} onBack={() => setView({ screen: 'feed' })} />
    ) : null;
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
          data-tour="profile"
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

      <button
        type="button"
        className="home-search-field"
        data-tour="search"
        onClick={() => requestRecipeSearchFocus()}
      >
        <Search size={18} strokeWidth={2.75} />
        <span>레시피나 재료 검색</span>
      </button>

      <div className="home-section" data-tour="pantry">
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
        {usableIngredients.length > 0 && (
          <button
            type="button"
            className="btn primary"
            data-tour="quick-start"
            style={{ width: '100%', marginTop: 10 }}
            onClick={() =>
              setView({
                screen: 'edit',
                initialChatPrompt: `지금 있는 재료는 ${usableIngredients.map((i) => i.name).join(', ')}이야. 이걸로 뭘 만들 수 있을까?`,
                initialOwnedIngredientIds: usableIngredients.map((i) => i.id),
              })
            }
          >
            🍳 있는 재료로 레시피 추가
          </button>
        )}
      </div>

      {recommendations.length > 0 && (
        <div className="home-section" data-tour="recommend">
          <div className="home-section-head">
            <span className="home-section-title">오늘 뭐 먹지?</span>
          </div>
          <div className="recipe-row-scroll">
            {recommendations.map((candidate) => (
              <RecommendCard
                key={candidate.recipe.id}
                candidate={candidate}
                onOpen={() => openRecipe(candidate.recipe.id)}
                onCook={() =>
                  setView({
                    screen: 'detail',
                    recipeId: candidate.recipe.id,
                    autoCook: true,
                    // B-5: 상세 화면을 거치지 않고 곧바로 요리 모드로 들어가는 경로라 "그 화면에서
                    // 보고 있던 인분"이 없음 — 가구 기본 인원을 대신 쓴다(우선순위 3번, "그 외").
                    initialServings: household?.defaultServings ?? 2,
                  })
                }
              />
            ))}
          </div>
        </div>
      )}

      {quickRecipes.length > 0 && (
        <div className="home-section">
          <div className="home-section-head">
            <span className="home-section-title">⏱ {QUICK_RECIPE_MAX_MINUTES}분 안에 되는 것</span>
            <button type="button" className="home-link" onClick={() => requestMaxMinutesFilter(QUICK_RECIPE_MAX_MINUTES)}>
              전체 보기
            </button>
          </div>
          <div className="recipe-row-scroll">
            {quickRecipes.map((recipe) => (
              <QuickRecipeCard key={recipe.id} recipe={recipe} onClick={() => openRecipe(recipe.id)} />
            ))}
          </div>
        </div>
      )}

      <div className="home-section" data-tour="week">
        <div className="home-section-head">
          <span className="home-section-title">이번 주 일정</span>
          <button type="button" className="home-link" onClick={() => setView({ screen: 'weekly-plan' })}>
            전체 보기
          </button>
        </div>
        <div className="home-week-strip">
          {WEEK_DATES.map((date) => {
            // 요일 칸엔 메뉴 하나만 넣고, 그 날 계획이 여러 개면 "외 n개"로 요약한다(다 못 넣는
            // 문제 해결). 오늘 칸은 "다음 끼니" 메뉴, 다른 요일은 그 날 첫 번째 메뉴 — 둘 다
            // pickNextMealPlan(isToday)이 알아서 분기한다.
            const isToday = date === today;
            const dayPlans = weekPlans.get(date) ?? [];
            const nextPlan = pickNextMealPlan(dayPlans, isToday);
            const nextPlanName = nextPlan
              ? recipes.find((r: Recipe) => r.id === nextPlan.recipeId)?.name
              : undefined;
            const menuLabel =
              nextPlanName && dayPlans.length > 1 ? `${nextPlanName} 외 ${dayPlans.length - 1}개` : nextPlanName;
            return (
              <button
                type="button"
                key={date}
                className={`home-week-cell ${isToday ? 'today' : ''}`}
                onClick={() => setView({ screen: 'weekly-plan' })}
              >
                <div className="home-week-day">{formatWeekdayShort(date)}</div>
                <div className="home-week-date">{formatDayOfMonth(date)}</div>
                <div className="home-week-menu">{menuLabel ?? ''}</div>
              </button>
            );
          })}
        </div>
      </div>

      {expiringSoon.length > 0 && (
        <div className="home-section" data-tour="expiring">
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
                  <div className={`home-expiring-days level-${info.level}`}>{formatExpirationBadge(info)}</div>
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

      {uncleanedLog && (
        <button type="button" className="action-banner" onClick={() => setShowPantryTidy(true)}>
          <span className="action-banner-text">
            🧹 요리 후 냉장고 정리를 하지 않았어요. 정리할까요?
          </span>
          <span className="action-banner-cta">
            정리하기 <ChevronRight size={14} strokeWidth={2.75} />
          </span>
        </button>
      )}

      {monthlyCookingCount != null && monthlyCookingCount > 0 && (
        <button
          type="button"
          className="home-section home-cooking-history-entry"
          onClick={() => setView({ screen: 'cooking-history' })}
        >
          <span>📋 이번 달 {monthlyCookingCount}번 요리했어요</span>
          <ChevronRight size={16} strokeWidth={2.75} />
        </button>
      )}

      {showProfileSheet && (
        <ProfileSheet
          onClose={() => setShowProfileSheet(false)}
          onNavigateToRecipe={(recipeId) => {
            setShowProfileSheet(false);
            openRecipe(recipeId);
          }}
        />
      )}

      {showPantryTidy && (
        <PantryTidyModal
          onClose={() => setShowPantryTidy(false)}
          cookingLogId={uncleanedLog?.id}
          onApplied={() => setUncleanedLog(null)}
        />
      )}

      {showTour && <OnboardingTour onFinish={() => setShowTour(false)} />}
    </div>
  );
}

const RECOMMEND_REASON_LABEL: Record<RecommendationReason, string> = {
  pantry: '🧺 보유 재료로 가능',
  quick: '⏱ 20분 이내',
  frequent: '🔁 오랜만이에요',
};

/** "오늘 뭐 먹지?" 가로 스크롤 행의 카드 — 예전엔 1개만 고정 표시하던 걸 서로 다른 이유의
 * 후보 여러 개로 확장(pickTodayRecommendations)하면서, 카드마다 useStoredImage를 개별
 * 호출해야 해서(hook은 반복문 안에서 호출 불가) QuickRecipeCard와 같은 이유로 분리했다. */
function RecommendCard({
  candidate,
  onOpen,
  onCook,
}: {
  candidate: RecommendationCandidate;
  onOpen: () => void;
  onCook: () => void;
}) {
  const imageId = candidate.recipe.finalImageId ?? candidate.recipe.steps.find((s) => s.imageId)?.imageId;
  const imageUrl = useStoredImage(imageId);
  return (
    <div className="home-recommend-card">
      <button type="button" className="home-recommend-clickarea" onClick={onOpen}>
        <div className="home-recommend-image">
          {imageUrl ? <img src={imageUrl} alt="" /> : <span className="home-recommend-placeholder">🍽️</span>}
          <span className="home-recommend-badge">
            재료 {candidate.totalCount}개 중 {candidate.ownedCount}개 있어요
            {candidate.unconfirmedCount > 0 && ` · 확인 필요 ${candidate.unconfirmedCount}개`}
          </span>
        </div>
        <div className="home-recommend-body">
          <div className="home-recommend-kicker">{RECOMMEND_REASON_LABEL[candidate.reason]}</div>
          <div className="home-recommend-title">{candidate.recipe.name}</div>
          <div className="home-recommend-meta">
            {candidate.recipe.estimatedMinutes != null && (
              <span>
                <Clock size={13} strokeWidth={2.75} /> {candidate.recipe.estimatedMinutes}분
              </span>
            )}
            {candidate.recipe.difficulty && (
              <span>
                <Flame size={13} strokeWidth={2.75} /> {DIFFICULTY_LABEL[candidate.recipe.difficulty]}
              </span>
            )}
            <span>{candidate.recipe.servingsBase}인분</span>
          </div>
        </div>
      </button>
      <div className="home-recommend-actions">
        <button type="button" className="btn primary" style={{ width: '100%' }} onClick={onCook}>
          🍳 바로 요리하기
        </button>
      </div>
    </div>
  );
}

/** A-1 "⏱ 20분 안에 되는 것" 행의 카드 — RecipesPage.tsx의 .recipe-card/.recipe-card-row CSS를
 * 그대로 재사용하되, 메타 텍스트만 이 섹션 취지("12분 · 재료 5개")에 맞게 직접 구성한다. */
function QuickRecipeCard({ recipe, onClick }: { recipe: Recipe; onClick: () => void }) {
  const imageId = recipe.finalImageId ?? recipe.steps.find((s) => s.imageId)?.imageId;
  const imageUrl = useStoredImage(imageId);
  return (
    <div className="recipe-card recipe-card-row" onClick={onClick}>
      {imageUrl ? (
        <img src={imageUrl} alt={recipe.name} className="recipe-card-image" />
      ) : (
        <div className="recipe-card-placeholder">🍽️</div>
      )}
      <div className="recipe-card-body">
        <strong className="recipe-title">{recipe.name}</strong>
        <span className="text-muted" style={{ fontSize: 12 }}>
          {recipe.estimatedMinutes}분 · 재료 {recipe.ingredients.length}개
        </span>
      </div>
    </div>
  );
}
