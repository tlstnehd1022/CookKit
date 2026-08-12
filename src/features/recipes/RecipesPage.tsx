import { useEffect, useMemo, useState } from 'react';
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
import {
  RecipeCategoryDetailPage,
  RecipeRowSection,
  groupRowItemsByTagName,
  splitTagRows,
  type RecipeRowItem,
  type TagRow,
} from './RecipeRowSection';
import type { Ingredient, Recipe, Tag } from '../../data/types';

// 태그 이름별 대표 이모지 — 대표 이미지(조리 단계 이미지)가 없는 레시피의 플레이스홀더용.
// 매칭되는 태그가 없으면 기본 이모지로 대체.
export const TAG_PLACEHOLDER_EMOJI: Record<string, string> = {
  크림류: '🥛',
  토마토류: '🍅',
  고기요리: '🥩',
  국물요리: '🍲',
};
export const DEFAULT_PLACEHOLDER_EMOJI = '🍽️';

export function resolveRecipeTagNames(recipe: Recipe, tags: Tag[]): string[] {
  return tags.filter((tag) => recipe.tagIds.includes(tag.id)).map((tag) => tag.name);
}

const SEARCH_DEBOUNCE_MS = 300;

type SortMode = 'recent' | 'name' | 'frequent';

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
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [categoryDetail, setCategoryDetail] = useState<{ title: string; items: RecipeRowItem[] } | null>(null);
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

  function matchesSearch(recipe: Recipe, query: string, ingredientsMap: Map<string, Ingredient>): boolean {
    if (!query) return true;
    if (recipe.name.toLowerCase().includes(query)) return true;
    return recipe.ingredients.some((item) =>
      ingredientsMap.get(item.ingredientId)?.name.toLowerCase().includes(query),
    );
  }

  // 지금은 클라이언트 사이드 필터링/정렬(레시피 몇십 개 규모에서는 충분히 빠름). 나중에 레시피가
  // 수백 개 이상으로 늘어나면 서버 사이드 필터링/정렬 + 페이지네이션으로 옮기는 걸 고려할 것
  // (CLAUDE.md "레시피 관리 화면(모바일 개편)" 항목에도 같은 내용 기록해둠).
  const filtered = recipes.filter((recipe) => {
    if (!matchesSearch(recipe, debouncedSearch, ingredientsById)) return false;
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
    maxCookMinutes != null;
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
      <div className="row">
        <h1>레시피 관리</h1>
        <div className="chip-row" style={{ marginTop: 0 }}>
          {/* 첫 화면(행 구조)에서는 그리드/리스트 toggle이 필요 없음 — 검색/필터로 넘어가거나
              행에서 "더보기"로 들어간 카테고리 상세 화면에서만 다시 노출됨 */}
          {!isRowMode && (
            <button
              className="btn small"
              onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
              title={viewMode === 'grid' ? '리스트로 보기' : '그리드로 보기'}
            >
              {viewMode === 'grid' ? '☰' : '▦'}
            </button>
          )}
          <button className="btn small" onClick={onOpenCookingHistory}>
            📋 요리 기록
          </button>
          <button className="btn small" onClick={onOpenMultiCook}>
            🍳 여러개 요리하기
          </button>
          <button className="btn small" onClick={onManageTags}>
            태그 관리
          </button>
          <button className="btn primary small" onClick={onAddRecipe}>
            + 레시피 추가
          </button>
        </div>
      </div>

      <div className="field">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="레시피 이름 또는 재료로 검색"
        />
      </div>

      {/* 알러지 제외는 일반 태그/보유재료 필터 칩 사이에 묻히면 잘 안 보인다는 피드백이 있어서
          (기능 자체는 이미 있었지만 발견성이 낮았음) 별도 섹션으로 분리해 더 눈에 띄게 함 —
          설정된 알러지가 있는 household에서만 노출된다. */}
      {allAllergens.length > 0 && (
        <>
          <div className="section-title">⚠️ 알러지 제외</div>
          <div className="chip-row-scroll">
            {allAllergens.map((allergen) => (
              <button
                key={allergen}
                className={`chip allergen selectable ${excludedAllergens.includes(allergen) ? 'active' : ''}`}
                onClick={() => toggleAllergen(allergen)}
              >
                {allergen} 제외
              </button>
            ))}
          </div>
        </>
      )}

      {recipes.length > 0 && (
        <>
          <div className="section-title">필터</div>
          <div className="chip-row-scroll">
            <button
              className={`chip selectable ${pantryOnly ? 'active' : ''}`}
              onClick={() => setPantryOnly((prev) => !prev)}
            >
              🧺 보유 재료로 가능한 것만
            </button>
            {tags.map((tag) => (
              <button
                key={tag.id}
                className={`chip selectable ${activeTagIds.includes(tag.id) ? 'active' : ''}`}
                onClick={() => toggleTag(tag.id)}
              >
                {tag.name}
              </button>
            ))}
          </div>
        </>
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
          {cuisineRows.map((row) => (
            <RecipeRowSection key={row.title} title={row.title} items={row.items} onMore={() => openTagRow(row)} />
          ))}
          {styleRows.map((row) => (
            <RecipeRowSection key={row.title} title={row.title} items={row.items} onMore={() => openTagRow(row)} />
          ))}
        </div>
      ) : (
        <>
          <div className="row">
            <div className="section-title" style={{ margin: 0 }}>
              레시피 목록 ({sorted.length})
            </div>
            {recipes.length > 0 && (
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                style={{ width: 'auto', fontSize: 13 }}
              >
                <option value="recent">최근 추가순</option>
                <option value="name">이름순</option>
                <option value="frequent">자주 해먹은 순</option>
              </select>
            )}
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
