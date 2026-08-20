import { useMemo, useState } from 'react';
import { useCategories, useIngredients } from '../../data/store';
import { getErrorMessage } from '../../lib/errorMessage';
import { getPantryAvailability } from '../../lib/pantryAvailability';
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
  const [showExpiredReview, setShowExpiredReview] = useState(false);
  const [showNoExpirationReview, setShowNoExpirationReview] = useState(false);

  // A-4: 유통기한이 지나 확인이 필요한 재료 개수 — 있으면 "확인하기" 액션을 노출한다. 이 목록은
  // 있어요/없어요 박스의 로컬 드래프트(localOwned)와 무관하게 실제 DB 상태(ingredients) 기준으로
  // 판단한다(확인 흐름 자체가 즉시 저장되는 별도 액션이라 — 아래 ExpiredReviewModal 참고).
  const expiredUnconfirmedCount = useMemo(
    () => ingredients.filter((i) => getPantryAvailability(i) === 'expired_unconfirmed').length,
    [ingredients],
  );
  // 보유 중인데 유통기한이 아예 입력 안 된 재료 개수 — owned가 아닌 재료는 유통기한 개념이
  // 없어서(27차 확장 기준) 대상에서 제외한다.
  const noExpirationCount = useMemo(
    () => ingredients.filter((i) => i.owned && !i.expirationDate).length,
    [ingredients],
  );

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
        <p className="text-muted" style={{ marginTop: -4, fontSize: 13 }}>
          탭하면 반대편으로 옮겨져요, 적용해야 저장돼요.
        </p>

        {expiredUnconfirmedCount > 0 && (
          <button
            type="button"
            className="btn"
            style={{ width: '100%', marginBottom: 12 }}
            onClick={() => setShowExpiredReview(true)}
          >
            ⏰ 유통기한 지난 재료 확인하기 ({expiredUnconfirmedCount}개)
          </button>
        )}
        {noExpirationCount > 0 && (
          <button
            type="button"
            className="btn"
            style={{ width: '100%', marginBottom: 12 }}
            onClick={() => setShowNoExpirationReview(true)}
          >
            📅 유통기한 없는 재료들이 있어요 ({noExpirationCount}개)
          </button>
        )}

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

      {showExpiredReview && <ExpiredReviewModal onClose={() => setShowExpiredReview(false)} />}
      {showNoExpirationReview && <NoExpirationReviewModal onClose={() => setShowNoExpirationReview(false)} />}
    </div>
  );
}

/** A-4: 유통기한 지난 재료를 한 번에 훑으며 처리하는 빠른 리뷰 목록 — 위 있어요/없어요 박스의
 * "적용 눌러야 저장" 드래프트 방식과 달리, 여기는 각 재료를 탭할 때마다 바로 저장한다(재료마다
 * "괜찮음"/"버림"을 즉시 확정하는 게 목적이라 되돌릴 것을 모아뒀다가 한꺼번에 적용할 이유가 없음).
 * ExpiredConfirmModal(IngredientsPage.tsx)과 같은 판단(괜찮으면 유통기한 비우기, 버리면
 * owned:false)을 목록 형태로 빠르게 반복한다. */
function ExpiredReviewModal({ onClose }: { onClose: () => void }) {
  const { ingredients, saveIngredient } = useIngredients();
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remaining = ingredients.filter(
    (i) => getPantryAvailability(i) === 'expired_unconfirmed' && !resolvedIds.has(i.id),
  );

  async function handle(ingredient: Ingredient, stillGood: boolean) {
    setBusyId(ingredient.id);
    setError(null);
    try {
      if (stillGood) {
        await saveIngredient({ ...ingredient, expirationDate: undefined });
      } else {
        await saveIngredient({ ...ingredient, owned: false });
      }
      setResolvedIds((prev) => new Set(prev).add(ingredient.id));
    } catch (err) {
      setError(getErrorMessage(err, '처리 중 오류가 발생했어요. 다시 시도해주세요.'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>유통기한 지난 재료 확인하기</h2>
        {remaining.length === 0 ? (
          <p className="empty-hint">확인할 재료가 없어요.</p>
        ) : (
          remaining.map((ingredient) => (
            <div
              className="row"
              key={ingredient.id}
              style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}
            >
              <span>{ingredient.name}</span>
              <div className="row" style={{ gap: 4, flexShrink: 0, justifyContent: 'flex-end' }}>
                <button
                  className="btn small"
                  disabled={busyId === ingredient.id}
                  onClick={() => handle(ingredient, true)}
                >
                  아직 괜찮아요
                </button>
                <button
                  className="btn small danger"
                  disabled={busyId === ingredient.id}
                  onClick={() => handle(ingredient, false)}
                >
                  버렸어요
                </button>
              </div>
            </div>
          ))
        )}
        {error && <p style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</p>}
        <button className="btn" style={{ width: '100%', marginTop: 16 }} onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}

/** 보유 중인데 유통기한이 아예 없는 재료를 한 번에 훑으며 입력하는 빠른 화면 — 위
 * ExpiredReviewModal과 같은 목록형 즉시-저장 패턴. 날짜를 고르는 순간 바로 저장돼서(따로
 * "저장" 버튼을 안 눌러도 됨) 한 번의 탭으로 끝난다. */
function NoExpirationReviewModal({ onClose }: { onClose: () => void }) {
  const { ingredients, saveIngredient } = useIngredients();
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remaining = ingredients.filter((i) => i.owned && !i.expirationDate && !resolvedIds.has(i.id));

  async function handleSetDate(ingredient: Ingredient, date: string) {
    if (!date) return;
    setBusyId(ingredient.id);
    setError(null);
    try {
      await saveIngredient({ ...ingredient, expirationDate: date });
      setResolvedIds((prev) => new Set(prev).add(ingredient.id));
    } catch (err) {
      setError(getErrorMessage(err, '저장 중 오류가 발생했어요. 다시 시도해주세요.'));
    } finally {
      setBusyId(null);
    }
  }

  function handleSkip(ingredient: Ingredient) {
    setResolvedIds((prev) => new Set(prev).add(ingredient.id));
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>유통기한 입력하기</h2>
        {remaining.length === 0 ? (
          <p className="empty-hint">입력할 재료가 없어요.</p>
        ) : (
          remaining.map((ingredient) => (
            <div
              className="row"
              key={ingredient.id}
              style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', gap: 8 }}
            >
              <span style={{ flexShrink: 0 }}>{ingredient.name}</span>
              <input
                type="date"
                style={{ flex: 1 }}
                disabled={busyId === ingredient.id}
                onChange={(e) => handleSetDate(ingredient, e.target.value)}
              />
              <button
                className="btn small"
                style={{ flexShrink: 0 }}
                disabled={busyId === ingredient.id}
                onClick={() => handleSkip(ingredient)}
              >
                건너뛰기
              </button>
            </div>
          ))
        )}
        {error && <p style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</p>}
        <button className="btn" style={{ width: '100%', marginTop: 16 }} onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}
