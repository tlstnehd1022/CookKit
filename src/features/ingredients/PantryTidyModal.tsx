import { useMemo, useState } from 'react';
import { useCategories, useIngredients } from '../../data/store';
import { getErrorMessage } from '../../lib/errorMessage';
import { markPantryCleaned } from '../../data/cookingLog';
import { showUndoToast } from '../../data/undoToast';
import type { Category, Ingredient } from '../../data/types';

interface CategoryGroup {
  category: Category | null;
  items: Ingredient[];
}

function groupByCategory(
  ingredients: Ingredient[],
  categories: Category[],
  predicate: (ingredientId: string) => boolean,
): CategoryGroup[] {
  const matched = ingredients.filter((i) => predicate(i.id));
  const groups: CategoryGroup[] = categories
    .map((category) => ({ category, items: matched.filter((i) => i.categoryId === category.id) }))
    .filter((g) => g.items.length > 0);
  const uncategorized = matched.filter((i) => !categories.some((c) => c.id === i.categoryId));
  if (uncategorized.length > 0) groups.push({ category: null, items: uncategorized });
  return groups;
}

/**
 * 재료 정리 모드 — 모든 재료(owned 무관)를 "있어요"/"없어요" 두 박스로 나눠 보여주고, 칩을 탭하면
 * 반대편으로 즉시 이동한다. 조리 단계 순서 변경 때(CLAUDE.md) 이미 "드래그는 모바일 터치에서
 * 불안정하다"고 판단해 ▲▼ 버튼을 쓴 전례가 있어 여기도 드래그 대신 탭 토글로 구현한다.
 *
 * "적용"을 누르기 전까지는 로컬 상태만 바뀌고 DB에는 반영되지 않는다 — 적용 시점에 원래 owned
 * 값과 달라진 재료만 골라 저장한다(owned:true로 바뀐 것은 markIngredientFilled로 채움 이력도
 * 같이 남긴다). 냉장고 화면(C-3)/요리 완료 직후(D-1)/홈의 "정리 안 함" 안내(A-4)가 모두 이
 * 컴포넌트를 공유한다.
 */
export function PantryTidyModal({
  onClose,
  onApplied,
  cookingLogId,
}: {
  onClose: () => void;
  onApplied?: () => void;
  /** D-1/A-4: 정리를 요리 기록과 연결해 왔을 때, 적용 성공 시 이 CookingLog의 pantry_cleaned_at을 기록한다 */
  cookingLogId?: string;
}) {
  const { ingredients, saveIngredient, markIngredientFilled } = useIngredients();
  const { categories } = useCategories();
  const [localOwned, setLocalOwned] = useState<Map<string, boolean>>(
    () => new Map(ingredients.map((i) => [i.id, i.owned])),
  );
  const [justMoved, setJustMoved] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setLocalOwned((prev) => {
      const next = new Map(prev);
      next.set(id, !(prev.get(id) ?? false));
      return next;
    });
    setJustMoved(id);
    window.setTimeout(() => setJustMoved((cur) => (cur === id ? null : cur)), 350);
  }

  const ownedGroups = useMemo(
    () => groupByCategory(ingredients, categories, (id) => localOwned.get(id) === true),
    [ingredients, categories, localOwned],
  );
  const notOwnedGroups = useMemo(
    () => groupByCategory(ingredients, categories, (id) => localOwned.get(id) !== true),
    [ingredients, categories, localOwned],
  );

  const changedCount = ingredients.filter((i) => (localOwned.get(i.id) ?? i.owned) !== i.owned).length;

  async function handleApply() {
    setApplying(true);
    setError(null);
    try {
      // 실행 취소(E)용 — 바뀌기 전 원본을 그대로 저장해두면 되돌릴 때 saveIngredient만 다시
      // 호출하면 owned/lastFilledAt 등이 전부 원래대로 복원된다.
      const beforeSnapshots: Ingredient[] = [];
      for (const ingredient of ingredients) {
        const next = localOwned.get(ingredient.id) ?? ingredient.owned;
        if (next === ingredient.owned) continue;
        beforeSnapshots.push(ingredient);
        if (next) {
          await markIngredientFilled(ingredient);
        } else {
          await saveIngredient({ ...ingredient, owned: false });
        }
      }
      if (cookingLogId) {
        await markPantryCleaned(cookingLogId).catch((err) => console.error('정리 완료 기록 실패:', err));
      }
      if (beforeSnapshots.length > 0) {
        showUndoToast(`냉장고를 정리했어요 (${beforeSnapshots.length}개 변경)`, async () => {
          for (const snapshot of beforeSnapshots) {
            await saveIngredient(snapshot);
          }
        });
      }
      onApplied?.();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, '적용 중 오류가 발생했습니다.'));
    } finally {
      setApplying(false);
    }
  }

  function renderBox(title: string, groups: CategoryGroup[]) {
    return (
      <div className="pantry-tidy-box">
        <div className="pantry-tidy-box-title">{title}</div>
        {groups.length === 0 && <p className="empty-hint" style={{ padding: '8px 0' }}>없어요.</p>}
        {groups.map((group) => (
          <div key={group.category?.id ?? '__uncategorized__'} className="pantry-tidy-group">
            <div className="text-muted" style={{ fontSize: 11, marginBottom: 4 }}>
              {group.category?.name ?? '미분류'}
            </div>
            <div className="chip-row" style={{ marginTop: 0 }}>
              {group.items.map((ingredient) => (
                <button
                  key={ingredient.id}
                  type="button"
                  className={`chip selectable ${justMoved === ingredient.id ? 'pantry-tidy-chip-moved' : ''}`}
                  onClick={() => toggle(ingredient.id)}
                >
                  {ingredient.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>냉장고 정리하기</h2>
        <p className="text-muted" style={{ marginTop: -4 }}>
          재료를 탭하면 반대편 박스로 옮겨져요. 적용을 눌러야 실제로 저장돼요.
        </p>

        {renderBox('✅ 있어요', ownedGroups)}
        {renderBox('🛒 없어요', notOwnedGroups)}

        {error && <p style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</p>}

        <div className="row" style={{ gap: 6, marginTop: 16 }}>
          <button className="btn" onClick={onClose} disabled={applying}>
            취소
          </button>
          <button className="btn primary" onClick={handleApply} disabled={applying || changedCount === 0}>
            {applying ? '적용하는 중...' : `적용 (${changedCount}개 변경)`}
          </button>
        </div>
      </div>
    </div>
  );
}
