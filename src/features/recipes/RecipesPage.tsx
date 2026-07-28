import { useEffect, useMemo, useState } from 'react';
import { useIngredientsById, useRecipes, useTags } from '../../data/store';
import { collectAllAllergens, computeRecipeAllergens, computeTotalCookMinutes } from '../../data/computed';
import { useStoredImage } from '../../data/imageStore';
import { useRecipeViewMode } from '../../data/viewMode';
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

type SortMode = 'recent' | 'name';
// '자주 해먹은 순'은 CookingLog(요리 기록)가 아직 미구현이라 이번엔 제외 — 나중에 요리 기록
// 기능이 생기면 SortMode에 'frequent' 등을 추가하고 기록 횟수로 정렬하면 됨.

export function RecipesPage({
  onSelectRecipe,
  onAddRecipe,
  onManageTags,
}: {
  onSelectRecipe: (id: string) => void;
  onAddRecipe: () => void;
  onManageTags: () => void;
}) {
  const { recipes } = useRecipes();
  const { tags } = useTags();
  const ingredientsById = useIngredientsById();
  const { mode: viewMode, setMode: setViewMode } = useRecipeViewMode();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeTagIds, setActiveTagIds] = useState<string[]>([]);
  const [excludedAllergens, setExcludedAllergens] = useState<string[]>([]);
  const [pantryOnly, setPantryOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('recent');

  // 검색은 재료 이름까지 훑어야 해서(레시피 개수가 늘어날 걸 감안하면) 매 키 입력마다 바로
  // 필터링하지 않고 300ms 디바운스 — 지금 데이터 규모에선 사실 없어도 되지만, 나중에 레시피가
  // 수백 개 이상으로 늘어나면 체감 차이가 날 수 있어서 미리 넣어둠.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

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

  function isMakeableWithPantry(recipe: Recipe, ingredientsMap: Map<string, Ingredient>): boolean {
    if (recipe.ingredients.length === 0) return false;
    return recipe.ingredients.every((item) => ingredientsMap.get(item.ingredientId)?.owned === true);
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
    if (pantryOnly && !isMakeableWithPantry(recipe, ingredientsById)) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortMode === 'name') return a.name.localeCompare(b.name, 'ko');
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

  return (
    <div>
      <div className="row">
        <h1>레시피 관리</h1>
        <div className="chip-row" style={{ marginTop: 0 }}>
          <button
            className="btn small"
            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            title={viewMode === 'grid' ? '리스트로 보기' : '그리드로 보기'}
          >
            {viewMode === 'grid' ? '☰' : '▦'}
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
            {allAllergens.map((allergen) => (
              <button
                key={allergen}
                className={`chip selectable ${excludedAllergens.includes(allergen) ? 'active' : ''}`}
                onClick={() => toggleAllergen(allergen)}
              >
                {allergen} 제외
              </button>
            ))}
          </div>
        </>
      )}

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
      {recipes.length === 0 && (
        <div className="empty-hint" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          아직 레시피가 없어요. 첫 레시피를 만들어보세요!
          <button className="btn primary small" style={{ alignSelf: 'center' }} onClick={onAddRecipe}>
            + 레시피 추가
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
            />
          ))}
        </div>
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
  /** 둘러보기 화면에서 "이미 있음" 같은 코너 배지용(선택) */
  cornerBadge?: string;
}

export function RecipeCard({ recipe, tagNames, onClick, ownerLabel, cornerBadge }: RecipeCardProps) {
  const { imageUrl, totalMinutes, placeholderEmoji } = useRecipeCardInfo(recipe, tagNames);

  return (
    <div className="recipe-card" onClick={onClick} style={{ position: 'relative' }}>
      {cornerBadge && <span className="recipe-card-corner-badge">{cornerBadge}</span>}
      {imageUrl ? (
        <img src={imageUrl} alt={recipe.name} className="recipe-card-image" />
      ) : (
        <div className="recipe-card-placeholder">{placeholderEmoji}</div>
      )}
      <div className="recipe-card-body">
        <strong className="recipe-title">{recipe.name}</strong>
        {tagNames.length > 0 && (
          <div className="chip-row" style={{ marginTop: 0 }}>
            {tagNames.slice(0, 2).map((name) => (
              <span className="chip" key={name}>
                {name}
              </span>
            ))}
          </div>
        )}
        <span className="text-muted" style={{ fontSize: 12 }}>
          {recipe.servingsBase}인분{totalMinutes > 0 ? ` · 약 ${totalMinutes}분` : ''}
        </span>
        {ownerLabel && (
          <span className="text-muted" style={{ fontSize: 11 }}>
            {ownerLabel}
          </span>
        )}
      </div>
    </div>
  );
}

export function RecipeListItem({ recipe, tagNames, onClick, ownerLabel, cornerBadge }: RecipeCardProps) {
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
          {ownerLabel ? ` · ${ownerLabel}` : ''}
        </span>
      </div>
    </div>
  );
}
