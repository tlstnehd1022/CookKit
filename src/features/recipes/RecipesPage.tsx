import { useEffect, useMemo, useState } from 'react';
import { SlidersHorizontal, ClipboardList, Tags, Plus, ChefHat, X } from 'lucide-react';
import { useIngredientsById, useRecipes, useTags } from '../../data/store';
import {
  collectAllAllergens,
  computeRecipeAllergens,
  computeTotalCookMinutes,
  isRecipeMakeableWithPantry,
} from '../../data/computed';
import { useStoredImage } from '../../data/imageStore';
import { useRecipeViewMode } from '../../data/viewMode';
import { fetchCookingStats } from '../../data/cookingLog';
import { useSession } from '../../data/session';
import { usePantryFilterRequested, clearPantryFilterRequest } from '../../data/pantryFilterRequest';
import { useRequestedMaxMinutesFilter, clearMaxMinutesFilterRequest } from '../../data/recipeTimeFilterRequest';
import { DIFFICULTY_LABEL } from '../../lib/recipeDifficulty';
import { matchesRecipeSearch } from '../../lib/recipeSearch';
import {
  RecipeCategoryDetailPage,
  RecipeRowSection,
  groupRowItemsByTagName,
  splitTagRows,
  type RecipeRowItem,
  type TagRow,
} from './RecipeRowSection';
import type { Difficulty, Recipe, Tag } from '../../data/types';

// 태그 이름별 대표 이모지 — 대표 이미지(조리 단계 이미지)가 없는 레시피의 플레이스홀더용.
// 매칭되는 태그가 없으면 기본 이모지로 대체.
export const TAG_PLACEHOLDER_EMOJI: Record<string, string> = {
  크림류: '🥛',
  토마토류: '🍅',
  국물요리: '🍲',
  디저트·베이킹: '🍰',
  음료: '🥤',
};
export const DEFAULT_PLACEHOLDER_EMOJI = '🍽️';

export function resolveRecipeTagNames(recipe: Recipe, tags: Tag[]): string[] {
  return tags.filter((tag) => recipe.tagIds.includes(tag.id)).map((tag) => tag.name);
}

const SEARCH_DEBOUNCE_MS = 300;

type SortMode = 'recent' | 'name' | 'frequent';

interface FilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

const TIME_PRESETS = [20, 40, 60];

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'recent', label: '최근 추가순' },
  { value: 'name', label: '이름순' },
  { value: 'frequent', label: '자주 해먹은 순' },
];

export function RecipesPage({
  onSelectRecipe,
  onAddRecipe,
  onManageTags,
  onOpenCookingHistory,
  onOpenMultiCook,
}: {
  onSelectRecipe: (id: string) => void;
  onAddRecipe: () => void;
  onManageTags: () => void;
  onOpenCookingHistory: () => void;
  onOpenMultiCook: () => void;
}) {
  const { recipes } = useRecipes();
  const { tags } = useTags();
  const ingredientsById = useIngredientsById();
  const { user } = useSession();
  const { mode: viewMode, setMode: setViewMode } = useRecipeViewMode();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeTagIds, setActiveTagIds] = useState<string[]>([]);
  const [excludedAllergens, setExcludedAllergens] = useState<string[]>([]);
  const [pantryOnly, setPantryOnly] = useState(false);
  const [maxCookMinutes, setMaxCookMinutes] = useState<number | null>(null);
  const [difficulties, setDifficulties] = useState<Difficulty[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showFabMenu, setShowFabMenu] = useState(false);
  const [categoryDetail, setCategoryDetail] = useState<{ title: string; items: RecipeRowItem[] } | null>(null);
  // 태그별 행(cuisine+style)이 29차 확장으로 최대 16개까지 늘어날 수 있어 기본은 접어둔다
  // (요구사항 3) — "보유 재료로 가능"/"최근 추가됨"만 항상 펼쳐진 상태로 보임. 국가/장르와
  // 요리 스타일은 서로 다른 축이라 독립된 접기/펼치기로 나눈다(하나 펼친다고 다른 하나까지
  // 안 펼쳐짐).
  const [cuisineRowsExpanded, setCuisineRowsExpanded] = useState(false);
  const [styleRowsExpanded, setStyleRowsExpanded] = useState(false);
  const [cookingCountById, setCookingCountById] = useState<Map<string, number>>(new Map());
  const pantryFilterRequested = usePantryFilterRequested();
  const requestedMaxMinutes = useRequestedMaxMinutesFilter();

  // 냉장고 화면의 "지금 재료로 만들 수 있는 레시피" 배너(C-2)를 통해 들어온 경우, 다른 필터는
  // 비우고 "🧺 보유 재료로 가능" 필터만 적용된 상태로 연다.
  useEffect(() => {
    if (!pantryFilterRequested) return;
    setSearch('');
    setActiveTagIds([]);
    setExcludedAllergens([]);
    setMaxCookMinutes(null);
    setDifficulties([]);
    setPantryOnly(true);
    clearPantryFilterRequest();
  }, [pantryFilterRequested]);

  // 홈의 "⏱ 20분 안에 되는 것" 섹션(A-1) "전체 보기"를 통해 들어온 경우, 다른 필터는 비우고
  // 조리시간 필터만 적용된 상태로 연다.
  useEffect(() => {
    if (requestedMaxMinutes == null) return;
    setSearch('');
    setActiveTagIds([]);
    setExcludedAllergens([]);
    setPantryOnly(false);
    setDifficulties([]);
    setMaxCookMinutes(requestedMaxMinutes);
    clearMaxMinutesFilterRequest();
  }, [requestedMaxMinutes]);

  // 검색은 재료 이름까지 훑어야 해서(레시피 개수가 늘어날 걸 감안하면) 매 키 입력마다 바로
  // 필터링하지 않고 300ms 디바운스 — 지금 데이터 규모에선 사실 없어도 되지만, 나중에 레시피가
  // 수백 개 이상으로 늘어나면 체감 차이가 날 수 있어서 미리 넣어둠.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // "자주 해먹은 순" 정렬용 — 레시피 목록이 바뀔 때마다 요리 기록 횟수를 다시 집계한다.
  useEffect(() => {
    if (!user || recipes.length === 0) {
      setCookingCountById(new Map());
      return;
    }
    let cancelled = false;
    fetchCookingStats(recipes.map((r) => r.id))
      .then((stats) => {
        if (cancelled) return;
        setCookingCountById(new Map(Array.from(stats.entries()).map(([id, s]) => [id, s.count])));
      })
      .catch((err) => console.error('요리 기록 집계 실패:', err));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipes.map((r) => r.id).join(','), user?.id]);

  const allAllergens = useMemo(
    () => collectAllAllergens(Array.from(ingredientsById.values())),
    [ingredientsById],
  );

  // 지금은 클라이언트 사이드 필터링/정렬(레시피 몇십 개 규모에서는 충분히 빠름). 나중에 레시피가
  // 수백 개 이상으로 늘어나면 서버 사이드 필터링/정렬 + 페이지네이션으로 옮기는 걸 고려할 것
  // (CLAUDE.md "레시피 관리 화면(모바일 개편)" 항목에도 같은 내용 기록해둠).
  const filtered = recipes.filter((recipe) => {
    if (!matchesRecipeSearch(recipe, debouncedSearch, ingredientsById, tags)) return false;
    if (activeTagIds.length > 0 && !activeTagIds.every((tagId) => recipe.tagIds.includes(tagId))) {
      return false;
    }
    if (excludedAllergens.length > 0) {
      const recipeAllergens = computeRecipeAllergens(recipe, ingredientsById);
      if (excludedAllergens.some((allergen) => recipeAllergens.includes(allergen))) {
        return false;
      }
    }
    if (pantryOnly && !isRecipeMakeableWithPantry(recipe, ingredientsById)) return false;
    if (maxCookMinutes != null && (recipe.estimatedMinutes == null || recipe.estimatedMinutes > maxCookMinutes)) {
      return false;
    }
    if (difficulties.length > 0 && (!recipe.difficulty || !difficulties.includes(recipe.difficulty))) {
      return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortMode === 'name') return a.name.localeCompare(b.name, 'ko');
    if (sortMode === 'frequent') {
      const diff = (cookingCountById.get(b.id) ?? 0) - (cookingCountById.get(a.id) ?? 0);
      if (diff !== 0) return diff;
      // 기록 횟수가 같으면(둘 다 0인 경우 포함) 최근 추가순으로 보조 정렬
    }
    // 최근 추가순 — createdAt이 없는 경우(이론상 없어야 하지만 방어적으로) 맨 뒤로 보냄
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });

  function toggleTag(tagId: string) {
    setActiveTagIds((prev) => (prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]));
  }

  function toggleAllergen(allergen: string) {
    setExcludedAllergens((prev) =>
      prev.includes(allergen) ? prev.filter((a) => a !== allergen) : [...prev, allergen],
    );
  }

  // 검색어/태그/알러지 제외/보유 재료 필터가 하나라도 걸려있으면 행(넷플릭스 스타일 가로 스크롤)
  // 대신 기존 필터링된 그리드/리스트 결과 화면을 보여준다(요구사항 3) — "행 탐색"과 "검색 결과"는
  // 서로 다른 화면이라는 게 이 기능의 핵심 설계라 명확히 분기한다.
  const hasActiveFilter =
    debouncedSearch.length > 0 ||
    activeTagIds.length > 0 ||
    excludedAllergens.length > 0 ||
    pantryOnly ||
    maxCookMinutes != null ||
    difficulties.length > 0;

  const appliedFilterChips: FilterChip[] = [
    ...activeTagIds.map((id) => ({
      key: `tag-${id}`,
      label: tags.find((t) => t.id === id)?.name ?? '태그',
      onRemove: () => toggleTag(id),
    })),
    ...excludedAllergens.map((allergen) => ({
      key: `allergen-${allergen}`,
      label: `${allergen} 제외`,
      onRemove: () => toggleAllergen(allergen),
    })),
    ...(pantryOnly
      ? [{ key: 'pantry', label: '🧺 보유 재료로 가능', onRemove: () => setPantryOnly(false) }]
      : []),
    ...(maxCookMinutes != null
      ? [{ key: 'time', label: `~${maxCookMinutes}분`, onRemove: () => setMaxCookMinutes(null) }]
      : []),
    ...difficulties.map((d) => ({
      key: `difficulty-${d}`,
      label: DIFFICULTY_LABEL[d],
      onRemove: () => setDifficulties((prev) => prev.filter((x) => x !== d)),
    })),
  ];
  const appliedFilterCount = appliedFilterChips.length;
  const isRowMode = !hasActiveFilter && recipes.length > 0;

  // 행 구조에서는 항상 "최근 추가순"으로 카드를 배열한다(요구사항 5) — 이후 각 행은 이 순서를
  // 그대로 물려받아 필터만 다르게 적용한다.
  const recentSortedRecipes = useMemo(
    () =>
      [...recipes].sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      }),
    [recipes],
  );

  const rowItems: RecipeRowItem[] = useMemo(
    () =>
      recentSortedRecipes.map((recipe) => ({
        id: recipe.id,
        recipe,
        tagNames: resolveRecipeTagNames(recipe, tags),
        onClick: () => onSelectRecipe(recipe.id),
        ownerLabel: recipe.authorName ? `${recipe.authorName}님의 레시피` : undefined,
        ownerAvatarUrl: recipe.authorAvatarUrl,
      })),
    [recentSortedRecipes, tags, onSelectRecipe],
  );

  const pantryRowItems = useMemo(
    () => rowItems.filter((item) => isRecipeMakeableWithPantry(item.recipe, ingredientsById)),
    [rowItems, ingredientsById],
  );

  const tagTypeByName = useMemo(() => new Map(tags.map((tag) => [tag.name, tag.type])), [tags]);
  const { cuisineRows, styleRows } = useMemo(
    () => splitTagRows(groupRowItemsByTagName(rowItems), tagTypeByName),
    [rowItems, tagTypeByName],
  );

  function openTagRow(row: TagRow) {
    setCategoryDetail({ title: row.title, items: row.items });
  }

  if (categoryDetail) {
    return (
      <RecipeCategoryDetailPage
        title={categoryDetail.title}
        items={categoryDetail.items}
        onBack={() => setCategoryDetail(null)}
      />
    );
  }

  return (
    <div>
      {/* 상단 "+ 레시피 추가"/☰(요리 기록·태그 관리) 버튼과 FAB("🍳 요리하기")을 speed dial 하나로
          통합 — FAB을 누르면 두 그룹(레시피 추가·요리 기록·태그 관리 / 요리하기)이 펼쳐지고,
          FAB 자체가 🍳 ↔ ✕로 바뀌며 닫기 버튼을 겸한다(당근마켓 "글쓰기" 메뉴 참고). */}
      {showFabMenu && <div className="modal-backdrop" onClick={() => setShowFabMenu(false)} />}
      {showFabMenu && (
        <div className="recipe-fab-menu">
          <div className="recipe-fab-menu-group">
            <button
              type="button"
              className="profile-sheet-menu-item"
              onClick={() => {
                setShowFabMenu(false);
                onAddRecipe();
              }}
            >
              <Plus size={19} strokeWidth={2.75} />
              <span>레시피 추가</span>
            </button>
            <button
              type="button"
              className="profile-sheet-menu-item"
              onClick={() => {
                setShowFabMenu(false);
                onOpenCookingHistory();
              }}
            >
              <ClipboardList size={19} strokeWidth={2.75} />
              <span>요리 기록</span>
            </button>
            <button
              type="button"
              className="profile-sheet-menu-item"
              onClick={() => {
                setShowFabMenu(false);
                onManageTags();
              }}
            >
              <Tags size={19} strokeWidth={2.75} />
              <span>태그 관리</span>
            </button>
          </div>
          <div className="recipe-fab-menu-group">
            <button
              type="button"
              className="profile-sheet-menu-item accent"
              onClick={() => {
                setShowFabMenu(false);
                onOpenMultiCook();
              }}
            >
              <ChefHat size={19} strokeWidth={2.75} />
              <span>요리하기</span>
            </button>
          </div>
        </div>
      )}
      {recipes.length > 0 && (
        <button
          type="button"
          className="recipe-fab"
          onClick={() => setShowFabMenu((v) => !v)}
          aria-label={showFabMenu ? '닫기' : '레시피 메뉴 열기'}
        >
          {showFabMenu ? <X size={26} strokeWidth={2.5} /> : '🍳'}
        </button>
      )}

      <h1 className="page-header-title" style={{ margin: 0 }}>
        레시피 관리
      </h1>

      <div className="row" style={{ gap: 8, alignItems: 'center', marginTop: 14, marginBottom: 14 }}>
        <div className="pill-input-row" style={{ flex: 1, marginBottom: 0 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="레시피 이름 또는 재료로 검색"
          />
        </div>
        {/* 첫 화면(행 구조)에서는 그리드/리스트 toggle이 필요 없음 — 검색/필터로 넘어가거나
            행에서 "더보기"로 들어간 카테고리 상세 화면에서만 다시 노출됨 */}
        {!isRowMode && (
          <button
            className="btn small"
            style={{ flexShrink: 0 }}
            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            title={viewMode === 'grid' ? '리스트로 보기' : '그리드로 보기'}
          >
            {viewMode === 'grid' ? '☰' : '▦'}
          </button>
        )}
        <button type="button" className="recipe-filter-btn" onClick={() => setShowFilterSheet(true)} aria-label="필터">
          <SlidersHorizontal size={19} strokeWidth={2.5} />
          {appliedFilterCount > 0 && <span className="recipe-filter-badge">{appliedFilterCount}</span>}
        </button>
      </div>

      {appliedFilterChips.length > 0 && (
        <div className="chip-row-scroll" style={{ marginTop: 8 }}>
          {appliedFilterChips.map((chip) => (
            <span className="chip selectable active" key={chip.key}>
              {chip.label}
              <button onClick={chip.onRemove} aria-label={`${chip.label} 해제`}>
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {recipes.length === 0 && (
        <div className="empty-hint" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          아직 레시피가 없어요. 첫 레시피를 만들어보세요!
          <button className="btn primary small" style={{ alignSelf: 'center' }} onClick={onAddRecipe}>
            + 레시피 추가
          </button>
        </div>
      )}

      {isRowMode ? (
        <div>
          <RecipeRowSection title="🧺 보유 재료로 가능" items={pantryRowItems} onMore={() => setCategoryDetail({ title: '🧺 보유 재료로 가능', items: pantryRowItems })} />
          <RecipeRowSection title="🆕 최근 추가됨" items={rowItems} onMore={() => setCategoryDetail({ title: '🆕 최근 추가됨', items: rowItems })} />
          {cuisineRows.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <button
                className="row"
                style={{ width: '100%', background: 'none', border: 'none', padding: '8px 0', cursor: 'pointer' }}
                onClick={() => setCuisineRowsExpanded((prev) => !prev)}
              >
                <span className="section-title" style={{ margin: 0 }}>
                  {cuisineRowsExpanded ? '▾' : '▸'} 🌍 국가/장르
                </span>
              </button>
              {cuisineRowsExpanded && (
                <div>
                  {cuisineRows.map((row) => (
                    <RecipeRowSection key={row.title} title={row.title} items={row.items} onMore={() => openTagRow(row)} />
                  ))}
                </div>
              )}
            </div>
          )}
          {styleRows.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <button
                className="row"
                style={{ width: '100%', background: 'none', border: 'none', padding: '8px 0', cursor: 'pointer' }}
                onClick={() => setStyleRowsExpanded((prev) => !prev)}
              >
                <span className="section-title" style={{ margin: 0 }}>
                  {styleRowsExpanded ? '▾' : '▸'} 🍳 요리 스타일
                </span>
              </button>
              {styleRowsExpanded && (
                <div>
                  {styleRows.map((row) => (
                    <RecipeRowSection key={row.title} title={row.title} items={row.items} onMore={() => openTagRow(row)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="section-title" style={{ margin: '0 0 8px' }}>
            레시피 목록 ({sorted.length})
          </div>

          {sorted.length === 0 && recipes.length > 0 && (
            <div className="empty-hint" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              조건에 맞는 레시피가 없어요.
              <button
                className="btn small"
                style={{ alignSelf: 'center' }}
                onClick={() => {
                  setSearch('');
                  setActiveTagIds([]);
                  setExcludedAllergens([]);
                  setPantryOnly(false);
                  setMaxCookMinutes(null);
                  setDifficulties([]);
                }}
              >
                필터 초기화
              </button>
            </div>
          )}

          {viewMode === 'grid' ? (
            <div className="recipe-grid">
              {sorted.map((recipe) => (
                <RecipeCard
                  key={recipe.id}
                  recipe={recipe}
                  tagNames={resolveRecipeTagNames(recipe, tags)}
                  onClick={() => onSelectRecipe(recipe.id)}
                  ownerLabel={recipe.authorName ? `${recipe.authorName}님의 레시피` : undefined}
                  ownerAvatarUrl={recipe.authorAvatarUrl}
                />
              ))}
            </div>
          ) : (
            <div className="recipe-list">
              {sorted.map((recipe) => (
                <RecipeListItem
                  key={recipe.id}
                  recipe={recipe}
                  tagNames={resolveRecipeTagNames(recipe, tags)}
                  onClick={() => onSelectRecipe(recipe.id)}
                  ownerLabel={recipe.authorName ? `${recipe.authorName}님의 레시피` : undefined}
                />
              ))}
            </div>
          )}
        </>
      )}

      {showFilterSheet && (
        <RecipeFilterSheet
          tags={tags}
          allAllergens={allAllergens}
          initialTagIds={activeTagIds}
          initialExcludedAllergens={excludedAllergens}
          initialPantryOnly={pantryOnly}
          initialMaxCookMinutes={maxCookMinutes}
          initialDifficulties={difficulties}
          initialSortMode={sortMode}
          onClose={() => setShowFilterSheet(false)}
          onApply={(draft) => {
            setActiveTagIds(draft.tagIds);
            setExcludedAllergens(draft.excludedAllergens);
            setPantryOnly(draft.pantryOnly);
            setMaxCookMinutes(draft.maxCookMinutes);
            setDifficulties(draft.difficulties);
            setSortMode(draft.sortMode);
            setShowFilterSheet(false);
          }}
        />
      )}
    </div>
  );
}

interface RecipeFilterDraft {
  tagIds: string[];
  excludedAllergens: string[];
  pantryOnly: boolean;
  maxCookMinutes: number | null;
  difficulties: Difficulty[];
  sortMode: SortMode;
}

const ALL_DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

function RecipeFilterSheet({
  tags,
  allAllergens,
  initialTagIds,
  initialExcludedAllergens,
  initialPantryOnly,
  initialMaxCookMinutes,
  initialDifficulties,
  initialSortMode,
  onClose,
  onApply,
}: {
  tags: Tag[];
  allAllergens: string[];
  initialTagIds: string[];
  initialExcludedAllergens: string[];
  initialPantryOnly: boolean;
  initialMaxCookMinutes: number | null;
  initialDifficulties: Difficulty[];
  initialSortMode: SortMode;
  onClose: () => void;
  onApply: (draft: RecipeFilterDraft) => void;
}) {
  const [tagIds, setTagIds] = useState(initialTagIds);
  const [excludedAllergens, setExcludedAllergens] = useState(initialExcludedAllergens);
  const [pantryOnly, setPantryOnly] = useState(initialPantryOnly);
  const [maxCookMinutes, setMaxCookMinutes] = useState(initialMaxCookMinutes);
  const [difficulties, setDifficulties] = useState(initialDifficulties);
  const [sortMode, setSortMode] = useState(initialSortMode);

  function toggleTagId(id: string) {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleExcludedAllergen(allergen: string) {
    setExcludedAllergens((prev) => (prev.includes(allergen) ? prev.filter((x) => x !== allergen) : [...prev, allergen]));
  }

  function toggleDifficulty(d: Difficulty) {
    setDifficulties((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  function reset() {
    setTagIds([]);
    setExcludedAllergens([]);
    setPantryOnly(false);
    setMaxCookMinutes(null);
    setDifficulties([]);
    setSortMode('recent');
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>필터</h2>

        <div className="section-title" style={{ marginTop: 0 }}>
          태그
        </div>
        {tags.length === 0 && <p className="empty-hint" style={{ padding: '4px 0' }}>등록된 태그가 없어요.</p>}
        <div className="chip-row">
          {tags.map((tag) => (
            <button
              key={tag.id}
              className={`chip selectable ${tagIds.includes(tag.id) ? 'active' : ''}`}
              onClick={() => toggleTagId(tag.id)}
            >
              {tag.name}
            </button>
          ))}
        </div>

        {allAllergens.length > 0 && (
          <>
            <div className="section-title">알러지 제외</div>
            <div className="chip-row">
              {allAllergens.map((allergen) => (
                <button
                  key={allergen}
                  className={`chip allergen selectable ${excludedAllergens.includes(allergen) ? 'active' : ''}`}
                  onClick={() => toggleExcludedAllergen(allergen)}
                >
                  {allergen} 제외
                </button>
              ))}
            </div>
          </>
        )}

        <div className="section-title">보유 재료</div>
        <div className="chip-row">
          <button className={`chip selectable ${pantryOnly ? 'active' : ''}`} onClick={() => setPantryOnly((prev) => !prev)}>
            🧺 보유 재료로 가능한 것만
          </button>
        </div>

        <div className="section-title">조리시간</div>
        <div className="chip-row">
          {TIME_PRESETS.map((minutes) => (
            <button
              key={minutes}
              className={`chip selectable ${maxCookMinutes === minutes ? 'active' : ''}`}
              onClick={() => setMaxCookMinutes((prev) => (prev === minutes ? null : minutes))}
            >
              {minutes}분 이내
            </button>
          ))}
        </div>

        <div className="section-title">난이도</div>
        <div className="chip-row">
          {ALL_DIFFICULTIES.map((d) => (
            <button
              key={d}
              className={`chip selectable ${difficulties.includes(d) ? 'active' : ''}`}
              onClick={() => toggleDifficulty(d)}
            >
              {DIFFICULTY_LABEL[d]}
            </button>
          ))}
        </div>

        <div className="section-title">정렬</div>
        <div className="chip-row">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={`chip selectable ${sortMode === option.value ? 'active' : ''}`}
              onClick={() => setSortMode(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="row" style={{ gap: 6, marginTop: 8 }}>
          <button className="btn" onClick={reset}>
            초기화
          </button>
          <button
            className="btn primary"
            onClick={() => onApply({ tagIds, excludedAllergens, pantryOnly, maxCookMinutes, difficulties, sortMode })}
          >
            적용
          </button>
        </div>
      </div>
    </div>
  );
}

export function useRecipeCardInfo(recipe: Recipe, tagNames: string[]) {
  // 대표 이미지 우선순위: 완성 사진 > 첫 조리 단계 이미지 > (없으면 태그 기반 플레이스홀더)
  const firstStepImageId = recipe.steps.find((step) => step.imageId)?.imageId;
  const imageUrl = useStoredImage(recipe.finalImageId ?? firstStepImageId);
  const totalMinutes = computeTotalCookMinutes(recipe);
  const placeholderEmoji = tagNames.map((name) => TAG_PLACEHOLDER_EMOJI[name]).find(Boolean) ?? DEFAULT_PLACEHOLDER_EMOJI;
  return { imageUrl, totalMinutes, placeholderEmoji };
}

export interface RecipeCardProps {
  recipe: Recipe;
  tagNames: string[];
  onClick: () => void;
  /** 둘러보기 화면에서 "OO님의 레시피"처럼 작성자 표시용(선택) */
  ownerLabel?: string;
  /** 작성자 프로필 사진(선택) — 그리드 카드에서만 ownerLabel 옆에 작게 표시(리스트 뷰는 한 줄에
   * 다 몰아넣는 컴팩트 레이아웃이라 생략) */
  ownerAvatarUrl?: string;
  /** 둘러보기 화면에서 "이미 있음" 같은 코너 배지용(선택) */
  cornerBadge?: string;
  /** 좋아요 수(조회 전용) — 값이 있을 때만 표시(선택) */
  likeCount?: number;
  /** 'row'면 가로 스크롤 행 안에서 쓰는 작은 정사각형 카드로 렌더링(기본은 'default') */
  size?: 'default' | 'row';
}

export function RecipeCard({
  recipe,
  tagNames,
  onClick,
  ownerLabel,
  ownerAvatarUrl,
  cornerBadge,
  likeCount,
  size = 'default',
}: RecipeCardProps) {
  const { imageUrl, totalMinutes, placeholderEmoji } = useRecipeCardInfo(recipe, tagNames);

  return (
    <div
      className={`recipe-card ${size === 'row' ? 'recipe-card-row' : ''}`}
      onClick={onClick}
      style={{ position: 'relative' }}
    >
      {cornerBadge && <span className="recipe-card-corner-badge">{cornerBadge}</span>}
      {imageUrl ? (
        <img src={imageUrl} alt={recipe.name} className="recipe-card-image" />
      ) : (
        <div className="recipe-card-placeholder">{placeholderEmoji}</div>
      )}
      <div className="recipe-card-body">
        <strong className="recipe-title">{recipe.name}</strong>
        {size !== 'row' && tagNames.length > 0 && (
          <div className="chip-row" style={{ marginTop: 0 }}>
            {tagNames.slice(0, 2).map((name) => (
              <span className="chip" key={name}>
                {name}
              </span>
            ))}
          </div>
        )}
        <span
          className="text-muted"
          style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {recipe.servingsBase}인분{totalMinutes > 0 ? ` · 약 ${totalMinutes}분` : ''}
          {recipe.nutrition ? ` · ${Math.round(recipe.nutrition.calories)}kcal` : ''}
          {likeCount != null ? ` · ❤️ ${likeCount}` : ''}
        </span>
        {size !== 'row' && ownerLabel && (
          <span className="text-muted" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
            {ownerAvatarUrl && (
              <img
                src={ownerAvatarUrl}
                alt=""
                style={{ width: 16, height: 16, borderRadius: '50%', objectFit: 'cover' }}
              />
            )}
            {ownerLabel}
          </span>
        )}
      </div>
    </div>
  );
}

export function RecipeListItem({ recipe, tagNames, onClick, ownerLabel, cornerBadge, likeCount }: RecipeCardProps) {
  const { imageUrl, totalMinutes, placeholderEmoji } = useRecipeCardInfo(recipe, tagNames);

  return (
    <div className="recipe-list-item" onClick={onClick} style={{ position: 'relative' }}>
      {cornerBadge && <span className="recipe-card-corner-badge">{cornerBadge}</span>}
      {imageUrl ? (
        <img src={imageUrl} alt={recipe.name} className="recipe-list-thumb" />
      ) : (
        <div className="recipe-list-thumb-placeholder">{placeholderEmoji}</div>
      )}
      <div className="recipe-list-body">
        <strong className="recipe-title">{recipe.name}</strong>
        <span className="text-muted" style={{ fontSize: 12 }}>
          {tagNames.slice(0, 2).join(', ')}
          {tagNames.length > 0 ? ' · ' : ''}
          {recipe.servingsBase}인분{totalMinutes > 0 ? ` · 약 ${totalMinutes}분` : ''}
          {recipe.nutrition ? ` · ${Math.round(recipe.nutrition.calories)}kcal` : ''}
          {likeCount != null ? ` · ❤️ ${likeCount}` : ''}
          {ownerLabel ? ` · ${ownerLabel}` : ''}
        </span>
      </div>
    </div>
  );
}
