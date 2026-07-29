import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../../data/session';
import { useRecipes, getCurrentHouseholdId } from '../../data/store';
import { useRecipeViewMode } from '../../data/viewMode';
import { fetchPublicRecipes, type PublicRecipeEntry } from '../../data/publicRecipes';
import { fetchLikeInfo, type LikeInfo } from '../../data/recipeLikes';
import { getErrorMessage } from '../../lib/errorMessage';
import { RecipeCard, RecipeListItem } from './RecipesPage';

const SEARCH_DEBOUNCE_MS = 300;
type SortMode = 'recent' | 'name';

/**
 * 다른 household의 전체공개(visibility='public') 레시피를 둘러보는 화면(우리 가구 것은 이미
 * "우리집 레시피"에 보이므로 제외). RecipesPage와 같은 그리드/리스트 카드 레이아웃을 그대로
 * 재사용하되(RecipeCard/RecipeListItem), 데이터 출처가 household 공유 store가 아니라 화면
 * 진입 시 1회 조회하는 fetchPublicRecipes라서 별도 컴포넌트로 분리했다.
 */
export function DiscoverRecipesPage({
  onSelectEntry,
}: {
  onSelectEntry: (entry: PublicRecipeEntry, ingredientNameById: Map<string, string>) => void;
}) {
  const { user } = useSession();
  const { recipes: myRecipes } = useRecipes();
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

  if (loading) {
    return <p className="text-muted">공개 레시피를 불러오는 중...</p>;
  }

  if (error) {
    return <p style={{ color: 'var(--danger)' }}>{error}</p>;
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
          {entries.length > 0 && (
            <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)} style={{ width: 'auto', fontSize: 13 }}>
              <option value="recent">최근 추가순</option>
              <option value="name">이름순</option>
            </select>
          )}
        </div>
      </div>

      {entries.length === 0 && (
        <div className="empty-hint">
          아직 다른 가구가 공개한 레시피가 없어요. 레시피를 공개하면 다른 사람도 볼 수 있어요!
        </div>
      )}
      {entries.length > 0 && sorted.length === 0 && (
        <div className="empty-hint">조건에 맞는 레시피가 없어요.</div>
      )}

      {viewMode === 'grid' ? (
        <div className="recipe-grid">
          {sorted.map((entry) => (
            <RecipeCard
              key={entry.recipe.id}
              recipe={entry.recipe}
              tagNames={entry.tagNames}
              onClick={() => onSelectEntry(entry, ingredientNameById)}
              ownerLabel={`${entry.authorName}님의 레시피`}
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
              ownerLabel={`${entry.authorName}님의 레시피`}
              cornerBadge={entry.alreadyCopied ? '이미 있음' : undefined}
              likeCount={likeInfoById.get(entry.recipe.id)?.likeCount ?? 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
