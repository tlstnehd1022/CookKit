import { useEffect, useState } from 'react';
import { useIngredientsById, useRecipes, useTags } from '../../data/store';
import { useShoppingSelection } from '../../data/shoppingSelection';
import { computeRecipeAllergens, scaleAmount } from '../../data/computed';

export function RecipeDetailPage({
  recipeId,
  onBack,
  onEdit,
}: {
  recipeId: string;
  onBack: () => void;
  onEdit: () => void;
}) {
  const { recipes } = useRecipes();
  const { tags } = useTags();
  const ingredientsById = useIngredientsById();
  const { isSelected, toggle } = useShoppingSelection();
  const recipe = recipes.find((r) => r.id === recipeId);
  const [servings, setServings] = useState(recipe?.servingsBase ?? 1);

  useEffect(() => {
    if (recipe) setServings(recipe.servingsBase);
  }, [recipe?.id]);

  if (!recipe) {
    return (
      <div>
        <button className="btn" onClick={onBack}>
          ← 목록으로
        </button>
        <div className="empty-hint">레시피를 찾을 수 없습니다.</div>
      </div>
    );
  }

  const recipeTags = tags.filter((tag) => recipe.tagIds.includes(tag.id));
  const recipeAllergens = computeRecipeAllergens(recipe, ingredientsById);

  return (
    <div>
      <div className="row">
        <button className="btn small" onClick={onBack}>
          ← 목록
        </button>
        <div className="chip-row" style={{ marginTop: 0 }}>
          <button className="btn small" onClick={onEdit}>
            수정
          </button>
        </div>
      </div>

      <h1 style={{ marginTop: 12 }}>{recipe.name}</h1>
      <button
        className={`btn ${isSelected(recipe.id) ? 'primary' : ''}`}
        style={{ width: '100%', marginBottom: 8 }}
        onClick={() => toggle(recipe.id)}
      >
        {isSelected(recipe.id) ? '🛒 장보기에 담김 (빼기)' : '🛒 장보기에 담기'}
      </button>
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

      <div className="section-title">인분 조절</div>
      <div className="stepper">
        <button onClick={() => setServings((s) => Math.max(1, s - 1))}>−</button>
        <strong>{servings}인분</strong>
        <button onClick={() => setServings((s) => s + 1)}>+</button>
      </div>

      <div className="section-title">재료 ({recipe.servingsBase}인분 기준 재계산됨)</div>
      <div className="card">
        {recipe.ingredients.map((item, index) => {
          const ingredient = ingredientsById.get(item.ingredientId);
          const scaled = scaleAmount(item.amount, recipe.servingsBase, servings);
          return (
            <div className="row" key={index} style={{ marginBottom: 6 }}>
              <span>{ingredient?.name ?? '(삭제된 재료)'}</span>
              <span className="text-muted">
                {scaled} {item.unit}
              </span>
            </div>
          );
        })}
      </div>

      <div className="section-title">조리 순서</div>
      {recipe.steps.map((step, index) => (
        <StepCard key={index} index={index + 1} step={step} />
      ))}
    </div>
  );
}

function StepCard({
  index,
  step,
}: {
  index: number;
  step: { title: string; content: string; timerSeconds?: number };
}) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (remaining === null) return;
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((r) => (r ?? 0) - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  return (
    <div className="card">
      <div className="row">
        <strong>
          {index}. {step.title}
        </strong>
        {step.timerSeconds != null && (
          <button
            className="btn small"
            onClick={() => setRemaining(remaining === null ? step.timerSeconds! : null)}
          >
            {remaining === null ? `타이머 ${formatSeconds(step.timerSeconds)}` : formatSeconds(remaining)}
          </button>
        )}
      </div>
      <p style={{ marginTop: 6 }}>{step.content}</p>
    </div>
  );
}

function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
