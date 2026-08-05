import { useMemo, useState } from 'react';
import type { Ingredient, Recipe } from '../../data/types';
import { getErrorMessage } from '../../lib/errorMessage';

/**
 * "🍳 오늘 만들었어요" 확인 모달 — 이 레시피가 쓰는 재료를 체크박스로 보여주고(기본 전체 선택),
 * 사용자가 실제로 다 쓴 재료만 남긴 뒤 확정해야 재료 차감(owned=false)이 일어난다. 자동 차감
 * 없음 — 반영 자체는 onConfirm을 호출한 부모(RecipeDetailPage)가 담당한다.
 */
export function CookingLogModal({
  recipe,
  ingredientsById,
  onClose,
  onConfirm,
}: {
  recipe: Recipe;
  ingredientsById: Map<string, Ingredient>;
  onClose: () => void;
  onConfirm: (selectedIngredientIds: string[], memo: string) => Promise<void>;
}) {
  const uniqueIngredientIds = useMemo(
    () => Array.from(new Set(recipe.ingredients.map((item) => item.ingredientId))),
    [recipe.ingredients],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set(uniqueIngredientIds));
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
        <p className="text-muted">이 재료들 다 썼어요? 남은 재료는 체크를 해제해주세요.</p>

        {uniqueIngredientIds.length === 0 && (
          <div className="empty-hint">이 레시피에 등록된 재료가 없어요.</div>
        )}
        {uniqueIngredientIds.map((id) => {
          const ingredient = ingredientsById.get(id);
          return (
            <label className="row" key={id} style={{ padding: '6px 0' }}>
              <span>{ingredient?.name ?? '(삭제된 재료)'}</span>
              <input type="checkbox" checked={selected.has(id)} onChange={() => toggle(id)} />
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
