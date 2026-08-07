import { useState } from 'react';
import { useRecipes } from '../../data/store';
import type { Recipe } from '../../data/types';

const MAX_RECIPES = 3;

/** "🍳 여러개 요리하기" 진입점 — 동시에 진행할 레시피를 2~3개 고른다(그 이상은 실제로 동시 조리가
 * 비현실적이라 제한). 장보기 담기처럼 목록에서 토글하는 방식과 비슷하되, 여기서는 개수 제한이
 * 있어 선택 화면을 따로 둔다. */
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
      if (prev.length >= MAX_RECIPES) return prev;
      return [...prev, id];
    });
  }

  return (
    <div>
      <div className="row">
        <button className="btn small" onClick={onCancel}>
          ← 뒤로
        </button>
        <h1 style={{ margin: 0 }}>🍳 여러개 요리하기</h1>
        <span />
      </div>
      <p className="text-muted">동시에 진행할 레시피를 2~3개 골라주세요.</p>

      {recipes.length === 0 && <div className="empty-hint">등록된 레시피가 없습니다.</div>}
      {recipes.map((recipe) => {
        const checked = selectedIds.includes(recipe.id);
        return (
          <div className="card" key={recipe.id} style={{ marginBottom: 8 }}>
            <label className="row" style={{ cursor: 'pointer' }}>
              <span>{recipe.name}</span>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(recipe.id)}
                disabled={!checked && selectedIds.length >= MAX_RECIPES}
              />
            </label>
          </div>
        );
      })}

      <button
        className="btn primary"
        style={{ width: '100%', marginTop: 12 }}
        disabled={selectedIds.length < 2}
        onClick={() => onConfirm(recipes.filter((r) => selectedIds.includes(r.id)))}
      >
        {selectedIds.length < 2 ? '2개 이상 선택해주세요' : `선택 완료 (${selectedIds.length}개)`}
      </button>
    </div>
  );
}
