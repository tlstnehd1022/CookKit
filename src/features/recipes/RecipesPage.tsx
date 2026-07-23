import { useMemo, useState } from 'react';
import { useIngredientsById, useRecipes, useTags } from '../../data/store';
import { useShoppingSelection } from '../../data/shoppingSelection';
import { collectAllAllergens, computeRecipeAllergens } from '../../data/computed';

export function RecipesPage({
  onSelectRecipe,
  onAddRecipe,
  onManageTags,
}: {
  onSelectRecipe: (id: string) => void;
  onAddRecipe: () => void;
  onManageTags: () => void;
}) {
  const { recipes, deleteRecipe } = useRecipes();
  const { tags } = useTags();
  const ingredientsById = useIngredientsById();
  const { isSelected, toggle: toggleShopping } = useShoppingSelection();
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
      {filtered.length === 0 && <div className="empty-hint">조건에 맞는 레시피가 없습니다.</div>}
      {filtered.map((recipe) => {
        const recipeAllergens = computeRecipeAllergens(recipe, ingredientsById);
        const recipeTags = tags.filter((tag) => recipe.tagIds.includes(tag.id));
        return (
          <div className="card" key={recipe.id} onClick={() => onSelectRecipe(recipe.id)} style={{ cursor: 'pointer' }}>
            <div className="row">
              <strong className="recipe-title">{recipe.name}</strong>
              <div className="chip-row" style={{ marginTop: 0 }}>
                <button
                  className={`btn small ${isSelected(recipe.id) ? 'primary' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleShopping(recipe.id);
                  }}
                  title="장보기에 담기"
                >
                  🛒
                </button>
                <button
                  className="btn small danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`'${recipe.name}' 레시피를 삭제할까요?`)) deleteRecipe(recipe.id);
                  }}
                >
                  삭제
                </button>
              </div>
            </div>
            <div className="text-muted">기준 {recipe.servingsBase}인분</div>
            <div className="chip-row">
              {recipeTags.map((tag) => (
                <span className="chip" key={tag.id}>
                  {tag.name}
                </span>
              ))}
              {recipeAllergens.map((allergen) => (
                <span className="chip allergen" key={allergen}>
                  {allergen}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
