import { useEffect, useMemo, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useSession } from '../../data/session';
import { useIngredients, useRecipes, useTags, getCurrentHouseholdId } from '../../data/store';
import { useRecipeViewMode } from '../../data/viewMode';
import {
  fetchPublicRecipes,
  formatPublicRecipeOwnerLabel,
  SYSTEM_USER_ID,
  type PublicRecipeEntry,
} from '../../data/publicRecipes';
import { fetchLikeInfo, type LikeInfo } from '../../data/recipeLikes';
import { getErrorMessage } from '../../lib/errorMessage';
import { isPantryUsable } from '../../lib/pantryAvailability';
import { RecipeCard, RecipeListItem } from './RecipesPage';
import {
  RecipeCategoryDetailPage,
  RecipeRowSection,
  groupRowItemsByTagName,
  splitTagRows,
  type RecipeRowItem,
  type TagRow,
} from './RecipeRowSection';

const SEARCH_DEBOUNCE_MS = 300;
type SortMode = 'recent' | 'name';

/**
 * 다른 household의 전체공개(visibility='public') 레시피를 둘러보는 화면(우리 가구 것은 이미
 * "우리집 레시피"에 보이므로 제외). RecipesPage와 같은 그리드/리스트 카드 레이아웃을 그대로
 * 재사용하되(RecipeCard/RecipeListItem), 데이터 출처가 household 공유 store가 아니라 화면
 * 진입 시 1회 조회하는 fetchPublicRecipes라서 별도 컴포넌트로 분리했다. RecipesPage와 마찬가지로
 * 검색/필터가 없을 때는 가로 스크롤 행(RecipeRowSection) 구조로, 검색/필터가 있으면 기존
 * 그리드/리스트 결과 화면으로 전환한다.
 */
export function DiscoverRecipesPage({
  onSelectEntry,
}: {
  onSelectEntry: (entry: PublicRecipeEntry, ingredientNameById: Map<string, string>) => void;
}) {
  const { user } = useSession();
  const { recipes: myRecipes } = useRecipes();
  const { ingredients: myIngredients } = useIngredients();
  const { tags: myTags } = useTags();
  const householdId = getCurrentHouseholdId();
  const { mode: viewMode, setMode: setViewMode } = useRecipeViewMode();
  const [entries, setEntries] = useState<PublicRecipeEntry[]>([]);
  const [ingredientNameById, setIngredientNameById] = useState<Map<string, string>>(new Map());
  const [likeInfoById, setLikeInfoById] = useState<Map<string, LikeInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeTagNames, setActiveTagNames] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [categoryDetail, setCategoryDetail] = useState<{ title: string; items: RecipeRowItem[] } | null>(null);
  // null이면 "실제 사용자 레시피가 있으면 접힘, 없으면 펼침" 기본값을 그대로 따르고, 사용자가
  // 직접 펼치기/접기를 누르면 그 뒤로는 명시적으로 고정된다(요구사항 10).
  const [systemExpandedOverride, setSystemExpandedOverride] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user || !householdId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPublicRecipes(user.id, householdId, myRecipes)
      .then(async (result) => {
        if (cancelled) return;
        setEntries(result.entries);
        setIngredientNameById(result.ingredientNameById);
        const likeInfo = await fetchLikeInfo(result.entries.map((e) => e.recipe.id), user.id);
        if (!cancelled) setLikeInfoById(likeInfo);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, '공개 레시피를 불러오지 못했습니다.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const allTagNames = useMemo(() => {
    const names = new Set<string>();
    entries.forEach((entry) => entry.tagNames.forEach((name) => names.add(name)));
    return Array.from(names);
  }, [entries]);

  function matchesSearch(entry: PublicRecipeEntry, query: string): boolean {
    if (!query) return true;
    if (entry.recipe.name.toLowerCase().includes(query)) return true;
    return entry.recipe.ingredients.some((item) =>
      ingredientNameById.get(item.ingredientId)?.toLowerCase().includes(query),
    );
  }

  const filtered = entries.filter((entry) => {
    if (!matchesSearch(entry, debouncedSearch)) return false;
    if (activeTagNames.length > 0 && !activeTagNames.every((name) => entry.tagNames.includes(name))) {
      return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortMode === 'name') return a.recipe.name.localeCompare(b.recipe.name, 'ko');
    const aTime = a.recipe.createdAt ? new Date(a.recipe.createdAt).getTime() : 0;
    const bTime = b.recipe.createdAt ? new Date(b.recipe.createdAt).getTime() : 0;
    return bTime - aTime;
  });

  function toggleTagName(name: string) {
    setActiveTagNames((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  }

  // RecipesPage(우리집 레시피 관리)와 같은 필터 시트 메커니즘 — 적용된 태그는 검색창 아래
  // 지울 수 있는 칩으로 나열된다.
  const appliedFilterChips = activeTagNames.map((name) => ({
    key: `tag-${name}`,
    label: name,
    onRemove: () => toggleTagName(name),
  }));
  const appliedFilterCount = appliedFilterChips.length;

  // 검색/태그 필터가 하나라도 걸려있으면 RecipesPage와 동일하게 행 구조 대신 기존 필터링된
  // 그리드/리스트 화면으로 전환한다(요구사항 3, 9 — 두 화면의 일관성).
  const hasActiveFilter = debouncedSearch.length > 0 || activeTagNames.length > 0;
  const isRowMode = !hasActiveFilter && entries.length > 0;

  // 시스템 계정(공공데이터 시드) 레시피는 진짜 사용자 레시피와 섞지 않는다(요구사항 10).
  const realEntries = useMemo(() => entries.filter((e) => e.authorUserId !== SYSTEM_USER_ID), [entries]);
  const systemEntries = useMemo(() => entries.filter((e) => e.authorUserId === SYSTEM_USER_ID), [entries]);
  const systemExpanded = systemExpandedOverride ?? realEntries.length === 0;

  // 다른 household 레시피여도 "보유 재료로 가능"은 내 household의 재료 보유 현황 기준으로
  // 판단해야 한다(요구사항 8) — 레시피의 ingredientId는 원본 household 소유라 나와 id가 다르므로,
  // 이름으로 매칭한다(RecipesFeature.tsx의 "내 레시피로 복사하기"와 같은 이름 매칭 패턴).
  const myOwnedNames = useMemo(
    () => new Set(myIngredients.filter((i) => isPantryUsable(i)).map((i) => i.name.trim())),
    [myIngredients],
  );
  function isMakeableWithMyPantry(entry: PublicRecipeEntry): boolean {
    if (entry.recipe.ingredients.length === 0) return false;
    return entry.recipe.ingredients.every((item) => {
      const name = ingredientNameById.get(item.ingredientId)?.trim();
      return Boolean(name) && myOwnedNames.has(name!);
    });
  }

  const tagTypeByName = useMemo(() => new Map(myTags.map((tag) => [tag.name, tag.type])), [myTags]);

  function buildRowItem(entry: PublicRecipeEntry): RecipeRowItem {
    return {
      id: entry.recipe.id,
      recipe: entry.recipe,
      tagNames: entry.tagNames,
      onClick: () => onSelectEntry(entry, ingredientNameById),
      ownerLabel: formatPublicRecipeOwnerLabel(entry),
      ownerAvatarUrl: entry.authorAvatarUrl,
      cornerBadge: entry.alreadyCopied ? '이미 있음' : undefined,
      likeCount: likeInfoById.get(entry.recipe.id)?.likeCount ?? 0,
    };
  }

  function buildRowSet(sourceEntries: PublicRecipeEntry[]) {
    // 행 구조는 항상 최근 추가순(요구사항 5, 9 — RecipesPage와 동일 규칙)
    const recentSorted = [...sourceEntries].sort((a, b) => {
      const aTime = a.recipe.createdAt ? new Date(a.recipe.createdAt).getTime() : 0;
      const bTime = b.recipe.createdAt ? new Date(b.recipe.createdAt).getTime() : 0;
      return bTime - aTime;
    });
    const rowItems = recentSorted.map(buildRowItem);
    const pantryRowItems = recentSorted.filter(isMakeableWithMyPantry).map(buildRowItem);
    const { cuisineRows, styleRows } = splitTagRows(groupRowItemsByTagName(rowItems), tagTypeByName);
    return { rowItems, pantryRowItems, cuisineRows, styleRows };
  }

  const realRows = useMemo(
    () => buildRowSet(realEntries),
    [realEntries, ingredientNameById, myOwnedNames, tagTypeByName, likeInfoById, onSelectEntry],
  );
  const systemRows = useMemo(
    () => buildRowSet(systemEntries),
    [systemEntries, ingredientNameById, myOwnedNames, tagTypeByName, likeInfoById, onSelectEntry],
  );

  function openTagRow(row: TagRow) {
    setCategoryDetail({ title: row.title, items: row.items });
  }

  if (loading) {
    return <p className="text-muted">공개 레시피를 불러오는 중...</p>;
  }

  if (error) {
    return <p style={{ color: 'var(--danger)' }}>{error}</p>;
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
      <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 14 }}>
        <div className="pill-input-row" style={{ flex: 1, marginBottom: 0 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="레시피 이름 또는 재료로 검색"
          />
        </div>
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
        <div className="chip-row-scroll" style={{ marginTop: -6, marginBottom: 8 }}>
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

      {entries.length === 0 && (
        <div className="empty-hint">
          아직 다른 가구가 공개한 레시피가 없어요. 레시피를 공개하면 다른 사람도 볼 수 있어요!
        </div>
      )}

      {isRowMode ? (
        <div>
          <RecipeRowSection
            title="🧺 보유 재료로 가능"
            items={realRows.pantryRowItems}
            onMore={() => setCategoryDetail({ title: '🧺 보유 재료로 가능', items: realRows.pantryRowItems })}
          />
          <RecipeRowSection
            title="🆕 최근 추가됨"
            items={realRows.rowItems}
            onMore={() => setCategoryDetail({ title: '🆕 최근 추가됨', items: realRows.rowItems })}
          />
          {realRows.cuisineRows.map((row) => (
            <RecipeRowSection key={row.title} title={row.title} items={row.items} onMore={() => openTagRow(row)} />
          ))}
          {realRows.styleRows.map((row) => (
            <RecipeRowSection key={row.title} title={row.title} items={row.items} onMore={() => openTagRow(row)} />
          ))}

          {systemEntries.length > 0 && (
            <div style={{ marginTop: realEntries.length > 0 ? 8 : 0 }}>
              <button
                className="row"
                style={{ width: '100%', background: 'none', border: 'none', padding: '8px 0', cursor: 'pointer' }}
                onClick={() => setSystemExpandedOverride(!systemExpanded)}
              >
                <span className="section-title" style={{ margin: 0 }}>
                  {systemExpanded ? '▾' : '▸'} 🍳 CookKit 추천 레시피 ({systemEntries.length})
                </span>
              </button>
              {systemExpanded && (
                <div>
                  <RecipeRowSection
                    title="🧺 보유 재료로 가능"
                    items={systemRows.pantryRowItems}
                    onMore={() =>
                      setCategoryDetail({ title: '🧺 보유 재료로 가능 (CookKit 추천)', items: systemRows.pantryRowItems })
                    }
                  />
                  <RecipeRowSection
                    title="🆕 최근 추가됨"
                    items={systemRows.rowItems}
                    onMore={() =>
                      setCategoryDetail({ title: '🆕 최근 추가됨 (CookKit 추천)', items: systemRows.rowItems })
                    }
                  />
                  {systemRows.cuisineRows.map((row) => (
                    <RecipeRowSection
                      key={row.title}
                      title={row.title}
                      items={row.items}
                      onMore={() => openTagRow(row)}
                    />
                  ))}
                  {systemRows.styleRows.map((row) => (
                    <RecipeRowSection
                      key={row.title}
                      title={row.title}
                      items={row.items}
                      onMore={() => openTagRow(row)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        entries.length > 0 && (
          <>
            <div className="section-title" style={{ margin: '0 0 8px' }}>
              둘러보기 ({sorted.length})
            </div>

            {sorted.length === 0 && <div className="empty-hint">조건에 맞는 레시피가 없어요.</div>}

            {viewMode === 'grid' ? (
              <div className="recipe-grid">
                {sorted.map((entry) => (
                  <RecipeCard
                    key={entry.recipe.id}
                    recipe={entry.recipe}
                    tagNames={entry.tagNames}
                    onClick={() => onSelectEntry(entry, ingredientNameById)}
                    ownerLabel={formatPublicRecipeOwnerLabel(entry)}
                    ownerAvatarUrl={entry.authorAvatarUrl}
                    cornerBadge={entry.alreadyCopied ? '이미 있음' : undefined}
                    likeCount={likeInfoById.get(entry.recipe.id)?.likeCount ?? 0}
                  />
                ))}
              </div>
            ) : (
              <div className="recipe-list">
                {sorted.map((entry) => (
                  <RecipeListItem
                    key={entry.recipe.id}
                    recipe={entry.recipe}
                    tagNames={entry.tagNames}
                    onClick={() => onSelectEntry(entry, ingredientNameById)}
                    ownerLabel={formatPublicRecipeOwnerLabel(entry)}
                    cornerBadge={entry.alreadyCopied ? '이미 있음' : undefined}
                    likeCount={likeInfoById.get(entry.recipe.id)?.likeCount ?? 0}
                  />
                ))}
              </div>
            )}
          </>
        )
      )}

      {showFilterSheet && (
        <DiscoverFilterSheet
          allTagNames={allTagNames}
          initialActiveTagNames={activeTagNames}
          initialSortMode={sortMode}
          onClose={() => setShowFilterSheet(false)}
          onApply={(draft) => {
            setActiveTagNames(draft.activeTagNames);
            setSortMode(draft.sortMode);
            setShowFilterSheet(false);
          }}
        />
      )}
    </div>
  );
}

const DISCOVER_SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'recent', label: '최근 추가순' },
  { value: 'name', label: '이름순' },
];

/** RecipesPage(우리집 레시피 관리)의 RecipeFilterSheet와 같은 메커니즘 — 태그/정렬을 draft
 * 상태로 고르다가 "적용"을 눌러야 반영된다. 둘러보기는 태그를 id가 아니라 이름으로 다룬다
 * (공개 레시피는 조회 household와 태그 테이블이 다를 수 있어 이름 매칭이 기존부터의 방식). */
function DiscoverFilterSheet({
  allTagNames,
  initialActiveTagNames,
  initialSortMode,
  onClose,
  onApply,
}: {
  allTagNames: string[];
  initialActiveTagNames: string[];
  initialSortMode: SortMode;
  onClose: () => void;
  onApply: (draft: { activeTagNames: string[]; sortMode: SortMode }) => void;
}) {
  const [activeTagNames, setActiveTagNames] = useState(initialActiveTagNames);
  const [sortMode, setSortMode] = useState(initialSortMode);

  function toggleTagName(name: string) {
    setActiveTagNames((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  }

  function reset() {
    setActiveTagNames([]);
    setSortMode('recent');
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>필터</h2>

        <div className="section-title" style={{ marginTop: 0 }}>
          태그
        </div>
        {allTagNames.length === 0 && <p className="empty-hint" style={{ padding: '4px 0' }}>등록된 태그가 없어요.</p>}
        <div className="chip-row">
          {allTagNames.map((name) => (
            <button
              key={name}
              className={`chip selectable ${activeTagNames.includes(name) ? 'active' : ''}`}
              onClick={() => toggleTagName(name)}
            >
              {name}
            </button>
          ))}
        </div>

        <div className="section-title">정렬</div>
        <div className="chip-row">
          {DISCOVER_SORT_OPTIONS.map((option) => (
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
          <button className="btn primary" onClick={() => onApply({ activeTagNames, sortMode })}>
            적용
          </button>
        </div>
      </div>
    </div>
  );
}
