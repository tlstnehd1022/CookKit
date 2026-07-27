import { useMemo, useState } from 'react';
import { useIngredientsById, useRecipes, useTags } from '../../data/store';
import { collectAllAllergens, computeRecipeAllergens, computeTotalCookMinutes } from '../../data/computed';
import { useStoredImage } from '../../data/imageStore';
import type { Recipe, Tag } from '../../data/types';

// 태그 이름별 대표 이모지 — 대표 이미지(조리 단계 이미지)가 없는 레시피의 플레이스홀더용.
// 매칭되는 태그가 없으면 기본 이모지로 대체.
const TAG_PLACEHOLDER_EMOJI: Record<string, string> = {
  크림류: '🥛',
  토마토류: '🍅',
  고기요리: '🥩',
  국물요리: '🍲',
};
const DEFAULT_PLACEHOLDER_EMOJI = '🍽️';

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
  const [search, setSearch] = useState('');
  const [activeTagIds, setActiveTagIds] = useState<string[]>([]);
  const [excludedAllergens, setExcludedAllergens] = useState<string[]>([]);

  const allAllergens = useMemo(
    () => collectAllAllergens(Array.from(ingredientsById.values())),
    [ingredientsById],
  );

  const filtered = recipes.filter((recipe) => {
    if (search.trim() && !recipe.name.toLowerCase().includes(search.trim().toLowerCase())) {
      return false;
    }
    if (activeTagIds.length > 0 && !activeTagIds.every((tagId) => recipe.tagIds.includes(tagId))) {
      return false;
    }
    if (excludedAllergens.length > 0) {
      const recipeAllergens = computeRecipeAllergens(recipe, ingredientsById);
      if (excludedAllergens.some((allergen) => recipeAllergens.includes(allergen))) {
        return false;
      }
    }
    return true;
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
          placeholder="레시피 이름 검색"
        />
      </div>

      {tags.length > 0 && (
        <>
          <div className="section-title">태그 필터</div>
          <div className="chip-row">
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

      {allAllergens.length > 0 && (
        <>
          <div className="section-title">알러지 성분 제외</div>
          <div className="chip-row">
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

      <div className="section-title">레시피 목록 ({filtered.length})</div>
      {filtered.length === 0 && recipes.length > 0 && (
        <div className="empty-hint" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          조건에 맞는 레시피가 없어요.
          <button
            className="btn small"
            style={{ alignSelf: 'center' }}
            onClick={() => {
              setSearch('');
              setActiveTagIds([]);
              setExcludedAllergens([]);
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

      <div className="recipe-grid">
        {filtered.map((recipe) => (
          <RecipeCard
            key={recipe.id}
            recipe={recipe}
            tags={tags}
            onClick={() => onSelectRecipe(recipe.id)}
          />
        ))}
      </div>
    </div>
  );
}

function RecipeCard({ recipe, tags, onClick }: { recipe: Recipe; tags: Tag[]; onClick: () => void }) {
  const firstStepImageId = recipe.steps.find((step) => step.imageId)?.imageId;
  const imageUrl = useStoredImage(firstStepImageId);
  const recipeTags = tags.filter((tag) => recipe.tagIds.includes(tag.id));
  const totalMinutes = computeTotalCookMinutes(recipe);
  const placeholderEmoji =
    recipeTags.map((tag) => TAG_PLACEHOLDER_EMOJI[tag.name]).find(Boolean) ?? DEFAULT_PLACEHOLDER_EMOJI;

  return (
    <div className="recipe-card" onClick={onClick}>
      {imageUrl ? (
        <img src={imageUrl} alt={recipe.name} className="recipe-card-image" />
      ) : (
        <div className="recipe-card-placeholder">{placeholderEmoji}</div>
      )}
      <div className="recipe-card-body">
        <strong className="recipe-title">{recipe.name}</strong>
        {recipeTags.length > 0 && (
          <div className="chip-row" style={{ marginTop: 0 }}>
            {recipeTags.slice(0, 2).map((tag) => (
              <span className="chip" key={tag.id}>
                {tag.name}
              </span>
            ))}
          </div>
        )}
        <span className="text-muted" style={{ fontSize: 12 }}>
          {recipe.servingsBase}인분{totalMinutes > 0 ? ` · 약 ${totalMinutes}분` : ''}
        </span>
      </div>
    </div>
  );
}
