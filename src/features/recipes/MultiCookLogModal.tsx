import { useMemo, useState } from 'react';
import type { Ingredient, Recipe } from '../../data/types';
import { getErrorMessage } from '../../lib/errorMessage';

interface MergedIngredientRow {
  ingredientId: string;
  recipeNames: string[];
}

/**
 * 복합 요리(여러 레시피 동시 진행) 완료 확인 모달 — CookingLogModal과 같은 흐름(체크박스로 확인
 * 후 확정해야 반영)이지만, 선택한 레시피 전체의 재료를 하나로 합쳐서 보여준다. 같은 재료를 여러
 * 레시피가 같이 쓰면(예: 양파) ingredientId 기준으로 한 번만 표시하고, 어느 레시피들이 쓰는지
 * 옆에 같이 보여준다 — 실제 차감도 호출부(RecipesFeature)가 ingredientId 기준으로 한 번만
 * 처리하므로 중복 차감 걱정 없음.
 */
export function MultiCookLogModal({
  recipes,
  ingredientsById,
  onClose,
  onConfirm,
}: {
  recipes: Recipe[];
  ingredientsById: Map<string, Ingredient>;
  onClose: () => void;
  onConfirm: (selectedIngredientIds: string[], memo: string) => Promise<void>;
}) {
  const mergedRows = useMemo<MergedIngredientRow[]>(() => {
    const rowById = new Map<string, MergedIngredientRow>();
    for (const recipe of recipes) {
      for (const item of recipe.ingredients) {
        const row = rowById.get(item.ingredientId);
        if (row) {
          if (!row.recipeNames.includes(recipe.name)) row.recipeNames.push(recipe.name);
        } else {
          rowById.set(item.ingredientId, { ingredientId: item.ingredientId, recipeNames: [recipe.name] });
        }
      }
    }
    return Array.from(rowById.values());
  }, [recipes]);
  const [selected, setSelected] = useState<Set<string>>(new Set(mergedRows.map((r) => r.ingredientId)));
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    try {
      await onConfirm(Array.from(selected), memo);
    } catch (err) {
      setError(getErrorMessage(err, '기록 중 오류가 발생했습니다.'));
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>🍳 오늘 만들었어요</h2>
        <p className="text-muted">{recipes.map((r) => r.name).join(', ')} — 이 재료들 다 썼어요?</p>

        {mergedRows.length === 0 && <div className="empty-hint">등록된 재료가 없어요.</div>}
        {mergedRows.map((row) => {
          const ingredient = ingredientsById.get(row.ingredientId);
          return (
            <label className="row" key={row.ingredientId} style={{ padding: '6px 0' }}>
              <div>
                <span>{ingredient?.name ?? '(삭제된 재료)'}</span>
                {row.recipeNames.length > 1 && (
                  <span className="text-muted" style={{ fontSize: 12, marginLeft: 6 }}>
                    ({row.recipeNames.join(' + ')})
                  </span>
                )}
              </div>
              <input type="checkbox" checked={selected.has(row.ingredientId)} onChange={() => toggle(row.ingredientId)} />
            </label>
          );
        })}

        <div className="field" style={{ marginTop: 12 }}>
          <label>메모 (선택)</label>
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="예: 맛있었다, 다음엔 덜 짜게"
          />
        </div>

        {error && <p style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</p>}

        <div className="row" style={{ gap: 6, marginTop: 16 }}>
          <button className="btn" onClick={onClose} disabled={saving}>
            취소
          </button>
          <button className="btn primary" onClick={handleConfirm} disabled={saving}>
            {saving ? '기록하는 중...' : '완료'}
          </button>
        </div>
      </div>
    </div>
  );
}
