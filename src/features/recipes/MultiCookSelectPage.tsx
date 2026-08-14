import { useState } from 'react';
import { useRecipes } from '../../data/store';
import type { Recipe } from '../../data/types';

const MAX_RECIPES = 3;

/** "🍳 요리하기" 진입점 — 하나만 고르면 그 레시피의 요리 모드로 바로 들어가고, 2~3개를 고르면
 * 복합 요리(동시 진행) 흐름으로 이어진다(그 이상은 실제로 동시 조리가 비현실적이라 제한).
 * 어느 쪽으로 갈지는 호출부(RecipesFeature)가 선택 개수를 보고 분기한다. */
export function MultiCookSelectPage({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (recipes: Recipe[]) => void;
}) {
  const { recipes } = useRecipes();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((i) => i !== id);
      if (prev.length >= MAX_RECIPES) {
        alert(`한 번에 ${MAX_RECIPES}개까지 함께 요리할 수 있어요.`);
        return prev;
      }
      return [...prev, id];
    });
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center' }}>
        <button className="btn small" onClick={onCancel} style={{ justifySelf: 'start' }}>
          ← 뒤로
        </button>
        <h1 style={{ margin: 0, justifySelf: 'center' }}>🍳 요리하기</h1>
        <span />
      </div>
      <p className="text-muted">하나 또는 여러 개 레시피를 골라주세요. (최대 {MAX_RECIPES}개)</p>

      {recipes.length === 0 && <div className="empty-hint">등록된 레시피가 없습니다.</div>}
      {recipes.map((recipe) => {
        const checked = selectedIds.includes(recipe.id);
        const atLimit = !checked && selectedIds.length >= MAX_RECIPES;
        return (
          <div className="card" key={recipe.id} style={{ marginBottom: 8, opacity: atLimit ? 0.5 : 1 }}>
            <label className="row" style={{ cursor: 'pointer' }}>
              <span>{recipe.name}</span>
              <input type="checkbox" checked={checked} onChange={() => toggle(recipe.id)} />
            </label>
          </div>
        );
      })}

      <button
        className="btn primary"
        style={{ width: '100%', marginTop: 12 }}
        disabled={selectedIds.length === 0}
        onClick={() => onConfirm(recipes.filter((r) => selectedIds.includes(r.id)))}
      >
        {selectedIds.length === 0 ? '레시피를 선택해주세요' : `요리 시작하기 (${selectedIds.length}개)`}
      </button>
    </div>
  );
}
