import { useEffect, useMemo, useState } from 'react';
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
    () => new Set(myIngredients.filter((i) => i.owned).map((i) => i.name.trim())),
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
      <div className="field">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="레시피 이름 또는 재료로 검색"
        />
      </div>

      {allTagNames.length > 0 && (
        <>
          <div className="section-title">필터</div>
          <div className="chip-row-scroll">
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
        </>
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
            <div className="row">
              <div className="section-title" style={{ margin: 0 }}>
                둘러보기 ({sorted.length})
              </div>
              <div className="chip-row" style={{ marginTop: 0 }}>
                <button
                  className="btn small"
                  onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                  title={viewMode === 'grid' ? '리스트로 보기' : '그리드로 보기'}
                >
                  {viewMode === 'grid' ? '☰' : '▦'}
                </button>
                <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)} style={{ width: 'auto', fontSize: 13 }}>
                  <option value="recent">최근 추가순</option>
                  <option value="name">이름순</option>
                </select>
              </div>
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
    </div>
  );
}
