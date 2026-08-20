import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useCategories, useIngredients, useIngredientsById, useRecipes, makeId } from '../../data/store';
import { isRecipeMakeableWithPantry } from '../../data/computed';
import { requestPantryOnlyFilter } from '../../data/pantryFilterRequest';
import { showUndoToast } from '../../data/undoToast';
import { CategoryManager } from './CategoryManager';
import { ReceiptScanModal } from './ReceiptScanModal';
import { PantryTidyModal } from './PantryTidyModal';
import { getExpirationInfo, formatExpirationBadge } from '../../lib/expiration';
import { getPantryAvailability } from '../../lib/pantryAvailability';
import { getErrorMessage } from '../../lib/errorMessage';
import { useHighlightIngredientIds, clearHighlightIngredientIds } from '../../data/highlightIngredients';
import { useHousehold } from '../../data/household';
import { ConfirmDialog } from '../recipes/ConfirmDialog';
import type { Ingredient } from '../../data/types';

export function IngredientsPage() {
  const { ingredients, saveIngredient, markIngredientFilled, deleteIngredient } = useIngredients();
  const { categories } = useCategories();
  const { recipes } = useRecipes();
  const ingredientsById = useIngredientsById();
  const [editingDetailsId, setEditingDetailsId] = useState<string | null>(null);
  const [expiredConfirmId, setExpiredConfirmId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showReceiptScan, setShowReceiptScan] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showTidyModal, setShowTidyModal] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const highlightIds = useHighlightIngredientIds();

  function toggleCollapsed(categoryId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  // 유통기한 알림을 클릭해서 들어온 경우 — 강조할 재료가 접힌 카테고리 안에 있으면 펼쳐주고,
  // 몇 초 뒤에는 강조 상태를 지워서(전역 store) 다음에 이 탭에 다시 왔을 때 남아있지 않게 한다.
  useEffect(() => {
    if (highlightIds.length === 0) return;
    const categoryIdsToExpand = new Set(
      ingredients.filter((i) => highlightIds.includes(i.id)).map((i) => i.categoryId),
    );
    if (categoryIdsToExpand.size > 0) {
      setCollapsed((prev) => {
        const next = new Set(prev);
        categoryIdsToExpand.forEach((id) => next.delete(id));
        return next;
      });
    }
    const timer = setTimeout(() => clearHighlightIngredientIds(), 4000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightIds]);

  // 목록 = "지금 냉장고에 있는 것"만 보여준다(owned=false는 정리 모드에서만 다룸) — 카테고리별
  // 접기/펼치기 그루핑은 그대로 유지.
  const ownedIngredients = useMemo(() => ingredients.filter((i) => i.owned), [ingredients]);
  const ownedGroups = categories.map((category) => ({
    category,
    items: ownedIngredients.filter((i) => i.categoryId === category.id),
  }));
  const uncategorizedOwned = ownedIngredients.filter((i) => !categories.some((c) => c.id === i.categoryId));

  // 유통기한 임박/경과 재료 요약 — 카테고리와 무관하게 보유 중인 재료 중에서만 뽑아 가장 급한
  // 순으로 보여줌(daysLeft 오름차순 정렬이 지남(음수)을 자연히 맨 앞에 둠, B-5). owned=false인
  // 재료는 유통기한이 설정돼 있어도 애초에 냉장고에 없는 것이라 대상에서 제외한다.
  const expiringSoon = useMemo(() => {
    return ingredients
      .filter((ingredient) => ingredient.owned)
      .map((ingredient) => ({ ingredient, info: getExpirationInfo(ingredient.expirationDate) }))
      .filter((entry): entry is { ingredient: Ingredient; info: NonNullable<typeof entry.info> } =>
        Boolean(entry.info),
      )
      .sort((a, b) => a.info.daysLeft - b.info.daysLeft);
  }, [ingredients]);

  // "지금 재료로 바로 만들 수 있는 레시피" 개수 — RecipesPage의 "🧺 보유 재료로 가능" 필터와
  // 같은 기준(isRecipeMakeableWithPantry)을 공유한다.
  const makeableRecipeCount = useMemo(
    () => recipes.filter((recipe) => isRecipeMakeableWithPantry(recipe, ingredientsById)).length,
    [recipes, ingredientsById],
  );

  // 유통기한이 지나 확인이 필요한 재료는 탭하면 상세 설정 대신 확인 모달(A-4)이 먼저 뜬다 —
  // "괜찮음/버림"을 정하기 전까지는 다른 설정(알러지 등)을 만지는 게 우선순위가 아니라서.
  function openIngredient(ingredient: Ingredient) {
    if (getPantryAvailability(ingredient) === 'expired_unconfirmed') {
      setExpiredConfirmId(ingredient.id);
    } else {
      setEditingDetailsId(ingredient.id);
    }
  }

  function renderCategoryGroups(groups: { category: { id: string; name: string }; items: Ingredient[] }[], uncategorized: Ingredient[]) {
    return (
      <>
        {groups.map(({ category, items }) => {
          if (items.length === 0) return null;
          const isCollapsed = collapsed.has(category.id);
          return (
            <div key={category.id} style={{ marginBottom: 8 }}>
              <button
                className="row"
                style={{
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  padding: '8px 0',
                  cursor: 'pointer',
                }}
                onClick={() => toggleCollapsed(category.id)}
              >
                <span className="section-title" style={{ margin: 0 }}>
                  {isCollapsed ? '▸' : '▾'} {category.name} ({items.length})
                </span>
              </button>
              {!isCollapsed && (
                <div className="chip-row" style={{ marginTop: 0 }}>
                  {items.map((ingredient) => (
                    <IngredientChip
                      key={ingredient.id}
                      ingredient={ingredient}
                      onClick={() => openIngredient(ingredient)}
                      highlighted={highlightIds.includes(ingredient.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {uncategorized.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div className="section-title">미분류 ({uncategorized.length})</div>
            <div className="chip-row" style={{ marginTop: 0 }}>
              {uncategorized.map((ingredient) => (
                <IngredientChip
                  key={ingredient.id}
                  ingredient={ingredient}
                  onClick={() => setEditingDetailsId(ingredient.id)}
                  highlighted={highlightIds.includes(ingredient.id)}
                />
              ))}
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div>
      <h1 className="page-header-title">냉장고</h1>
      <div className="page-header-actions">
        <button className="btn small" onClick={() => setShowCategoryManager(true)}>
          카테고리 관리
        </button>
      </div>

      <p className="text-muted" style={{ marginTop: -6, marginBottom: 14 }}>
        재료 {ownedIngredients.length}개 · 이걸로 만들 수 있는 레시피 {makeableRecipeCount}개
      </p>

      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary" style={{ flex: 1 }} onClick={() => setShowReceiptScan(true)}>
          📷 영수증
        </button>
        <button className="btn primary" style={{ flex: 1 }} onClick={() => setShowAddForm(true)}>
          ➕ 직접 추가
        </button>
        <button className="btn" style={{ flex: 1 }} onClick={() => setShowTidyModal(true)}>
          🧹 정리하기
        </button>
      </div>

      {makeableRecipeCount > 0 && (
        <button type="button" className="action-banner" style={{ marginTop: 14 }} onClick={() => requestPantryOnlyFilter()}>
          <span className="action-banner-text">
            🧺 지금 재료로 바로 만들 수 있는 레시피 {makeableRecipeCount}개를 찾았어요
          </span>
          <span className="action-banner-cta">
            보러 가기 <ChevronRight size={14} strokeWidth={2.75} />
          </span>
        </button>
      )}

      {expiringSoon.length > 0 && (
        <>
          <div className="section-title">⏰ 유통기한 임박/경과 ({expiringSoon.length})</div>
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="chip-row" style={{ marginTop: 0 }}>
              {expiringSoon.map(({ ingredient, info }) => (
                <button
                  key={ingredient.id}
                  className={`chip expiration-${info.level}`}
                  onClick={() => openIngredient(ingredient)}
                >
                  {ingredient.name} · {formatExpirationBadge(info)}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="section-title">냉장고에 있는 재료</div>
      {ownedIngredients.length === 0 && (
        <p className="empty-hint">보유 중인 재료가 없어요. 영수증으로 채우거나 직접 추가해보세요.</p>
      )}
      {renderCategoryGroups(ownedGroups, uncategorizedOwned)}

      {editingDetailsId && (
        <IngredientDetailModal
          ingredient={ingredients.find((i) => i.id === editingDetailsId)!}
          onClose={() => setEditingDetailsId(null)}
          onSave={async (patch) => {
            const target = ingredients.find((i) => i.id === editingDetailsId);
            if (!target) return;
            await saveIngredient({ ...target, ...patch });
            setEditingDetailsId(null);
          }}
          onDelete={async () => {
            const target = ingredients.find((i) => i.id === editingDetailsId);
            await deleteIngredient(editingDetailsId);
            setEditingDetailsId(null);
            if (target) {
              showUndoToast(`'${target.name}' 재료를 지웠어요`, () => saveIngredient(target));
            }
          }}
        />
      )}

      {expiredConfirmId && (
        <ExpiredConfirmModal
          ingredient={ingredients.find((i) => i.id === expiredConfirmId)!}
          onClose={() => setExpiredConfirmId(null)}
          onResolve={async (stillGood) => {
            const target = ingredients.find((i) => i.id === expiredConfirmId);
            if (!target) return;
            if (stillGood) {
              await saveIngredient({ ...target, expirationDate: undefined });
            } else {
              await saveIngredient({ ...target, owned: false });
            }
          }}
          onEditDetails={() => {
            setExpiredConfirmId(null);
            setEditingDetailsId(expiredConfirmId);
          }}
        />
      )}

      {showAddForm && (
        <AddIngredientModal
          existingNames={ingredients.map((i) => i.name.trim().toLowerCase())}
          onClose={() => setShowAddForm(false)}
          onSave={async (ingredient) => {
            await markIngredientFilled(ingredient);
            setShowAddForm(false);
          }}
        />
      )}

      {showReceiptScan && <ReceiptScanModal onClose={() => setShowReceiptScan(false)} />}

      {showCategoryManager && <CategoryManager onClose={() => setShowCategoryManager(false)} />}

      {showTidyModal && <PantryTidyModal onClose={() => setShowTidyModal(false)} />}
    </div>
  );
}

function IngredientChip({
  ingredient,
  onClick,
  highlighted,
}: {
  ingredient: Ingredient;
  onClick: () => void;
  /** 유통기한 알림을 클릭해서 들어온 경우, 그 알림이 가리키는 재료면 true — 스크롤+반짝임 강조 */
  highlighted?: boolean;
}) {
  const expirationInfo = getExpirationInfo(ingredient.expirationDate);
  const chipRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (highlighted) {
      chipRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlighted]);

  return (
    <button
      ref={chipRef}
      type="button"
      className={`chip selectable ${expirationInfo ? `expiration-${expirationInfo.level}` : ''} ${
        highlighted ? 'ingredient-row-highlight' : ''
      }`}
      onClick={onClick}
    >
      {ingredient.name}
      {ingredient.defaultBuyUnit ? ` · ${ingredient.defaultBuyUnit}` : ''}
      {expirationInfo ? ` · ${formatExpirationBadge(expirationInfo)}` : ''}
      {ingredient.allergens.length > 0 ? ' · ⚠' : ''}
    </button>
  );
}

/**
 * A-4: 유통기한이 지난 재료를 탭했을 때 먼저 뜨는 확인 모달 — 앱이 식품 안전을 판단하지 않고
 * 사용자에게 직접 묻는다. "아직 괜찮아요"는 유통기한을 비워 usable로 되돌리고(정확한 새 날짜를
 * 알고 있으면 "자세히 수정하기"로 상세 편집에서 다시 입력 가능), "버렸어요"는 owned:false로
 * 뺀다. IngredientsPage 외에 ShoppingListPage/WeeklyPlanPage도 재사용한다(각자의 saveIngredient로
 * onResolve를 구현).
 */
export function ExpiredConfirmModal({
  ingredient,
  onClose,
  onResolve,
  onEditDetails,
}: {
  ingredient: Ingredient;
  onClose: () => void;
  onResolve: (stillGood: boolean) => Promise<void>;
  onEditDetails?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(stillGood: boolean) {
    setBusy(true);
    setError(null);
    try {
      await onResolve(stillGood);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, '처리 중 오류가 발생했어요. 다시 시도해주세요.'));
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{ingredient.name}</h2>
        <p className="text-muted" style={{ marginTop: -4 }}>
          유통기한이 지났어요. 상태를 확인해주세요.
        </p>
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <button className="btn" style={{ flex: 1 }} disabled={busy} onClick={() => handle(true)}>
            아직 괜찮아요
          </button>
          <button className="btn danger" style={{ flex: 1 }} disabled={busy} onClick={() => handle(false)}>
            버렸어요
          </button>
        </div>
        {onEditDetails && (
          <button className="btn small" style={{ marginTop: 12, width: '100%' }} onClick={onEditDetails} disabled={busy}>
            자세히 수정하기(유통기한 새로 입력 등)
          </button>
        )}
        {error && <p style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</p>}
      </div>
    </div>
  );
}

interface IngredientDetailPatch {
  name: string;
  categoryId: string;
  allergens: string[];
  expirationDate?: string;
}

function IngredientDetailModal({
  ingredient,
  onClose,
  onSave,
  onDelete,
}: {
  ingredient: Ingredient;
  onClose: () => void;
  onSave: (patch: IngredientDetailPatch) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { household } = useHousehold();
  const { categories } = useCategories();
  const [name, setName] = useState(ingredient.name);
  const [categoryId, setCategoryId] = useState(ingredient.categoryId);
  const [allergens, setAllergens] = useState<string[]>(ingredient.allergens);
  const [draft, setDraft] = useState('');
  const [expirationDate, setExpirationDate] = useState(ingredient.expirationDate ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  async function handleDelete() {
    setShowDeleteConfirm(false);
    setDeleting(true);
    try {
      await onDelete();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '삭제에 실패했어요. 다시 시도해주세요.');
      setDeleting(false);
    }
  }

  function toggleAllergen(name: string) {
    setAllergens((prev) => (prev.includes(name) ? prev.filter((a) => a !== name) : [...prev, name]));
  }

  function addCustomAllergen() {
    const trimmed = draft.trim();
    if (trimmed && !allergens.includes(trimmed)) {
      setAllergens([...allergens, trimmed]);
    }
    setDraft('');
  }

  // 가구가 관리하는 알러지 목록(household.allergens) + 이 재료에 이미 붙어있는 것을 합쳐서
  // 토글 칩으로 보여준다 — 프로필에서 정한 목록을 여기서 탭 한 번으로 이 재료에도 표시할 수
  // 있게(예: "돈까스소스"에 "마늘" 체크). 목록에 없는 성분은 아래 직접 입력으로 추가.
  const allergenOptions = Array.from(new Set([...(household?.allergens ?? []), ...allergens]));

  return (
    <>
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>재료 상세 설정</h2>
        <div className="field">
          <label>이름</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 양파" />
        </div>
        <div className="field">
          <label>카테고리</label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="section-title">알러지 유발 성분</div>
        <p className="text-muted" style={{ marginTop: -4, marginBottom: 8 }}>
          이 재료에 해당하는 걸 눌러서 표시하세요. 프로필의 "알러지 관리"에서 가구 목록을 먼저
          만들어두면 여기서 고르기만 하면 돼요.
        </p>
        {allergenOptions.length > 0 && (
          <div className="chip-row">
            {allergenOptions.map((name) => (
              <button
                key={name}
                type="button"
                className={`chip selectable ${allergens.includes(name) ? 'active' : ''}`}
                onClick={() => toggleAllergen(name)}
              >
                {name}
              </button>
            ))}
          </div>
        )}
        <div className="field" style={{ marginTop: 12 }}>
          <label>목록에 없는 성분 직접 추가</label>
          <div className="row">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="예: 새우"
              onKeyDown={(e) => e.key === 'Enter' && addCustomAllergen()}
            />
            <button className="btn small" onClick={addCustomAllergen}>
              추가
            </button>
          </div>
        </div>

        <div className="section-title">유통기한 (선택)</div>
        <div className="field">
          <label>유통기한</label>
          <div className="row" style={{ gap: 8 }}>
            <input
              type="date"
              value={expirationDate}
              onChange={(e) => setExpirationDate(e.target.value)}
              style={{ flex: 1 }}
            />
            {expirationDate && (
              <button className="btn small" onClick={() => setExpirationDate('')}>
                지우기
              </button>
            )}
          </div>
          <p className="text-muted" style={{ marginTop: 4 }}>
            설정해두면 재료 목록에 임박 배지가 표시되고, 알림을 켜두면 미리 알려드려요.
          </p>
        </div>

        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn danger" onClick={() => setShowDeleteConfirm(true)} disabled={saving || deleting}>
            {deleting ? '삭제 중...' : '삭제'}
          </button>
          <button className="btn" onClick={onClose} disabled={saving || deleting}>
            취소
          </button>
          <button
            className="btn primary"
            disabled={saving || deleting || !name.trim()}
            onClick={async () => {
              setSaving(true);
              setSaveError(null);
              try {
                await onSave({
                  name: name.trim(),
                  categoryId,
                  allergens,
                  expirationDate: expirationDate || undefined,
                });
              } catch (err) {
                setSaveError(err instanceof Error ? err.message : '저장에 실패했어요. 다시 시도해주세요.');
                setSaving(false);
              }
            }}
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
        {saveError && <p style={{ color: 'var(--danger)', marginTop: 8 }}>{saveError}</p>}
      </div>
    </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          message={`'${ingredient.name}'을(를) 삭제할까요? 이 재료를 쓰는 레시피에서는 "삭제된 재료"로 표시돼요.`}
          confirmLabel="삭제"
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  );
}

export function AddIngredientModal({
  onClose,
  onSave,
  existingNames,
  defaultOwned = true,
}: {
  onClose: () => void;
  onSave: (ingredient: Ingredient) => Promise<void>;
  existingNames: string[];
  /** 냉장고의 "직접 추가"는 지금 채워 넣는 의미라 기본 true, 장보기의 "직접 추가"(E-2/E-3)는
   * 아직 안 산 항목을 등록하는 의미라 false로 호출한다. */
  defaultOwned?: boolean;
}) {
  const { categories } = useCategories();
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showDuplicateConfirm, setShowDuplicateConfirm] = useState(false);

  const canSave = name.trim().length > 0 && categoryId;

  async function performSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave({
        id: makeId(),
        name: name.trim(),
        categoryId,
        // 장보기 집계용 기본 단위 — 다른 재료 생성 경로(RecipeEditor/영수증 스캔 등)와 같이
        // 사용자에게 따로 입력받지 않고 '1개'로 고정한다(재료마다 관리하기 번거롭다는 판단 —
        // 입력 필드 자체를 없앰).
        defaultBuyUnit: '1개',
        allergens: [],
        owned: defaultOwned,
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '저장에 실패했어요. 다시 시도해주세요.');
      setSaving(false);
    }
  }

  function handleSubmit() {
    if (existingNames.includes(name.trim().toLowerCase())) {
      setShowDuplicateConfirm(true);
      return;
    }
    performSave();
  }

  return (
    <>
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>재료 추가</h2>
        <div className="field">
          <label>이름</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 애호박" />
        </div>
        <div className="field">
          <label>카테고리</label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {categories.length === 0 && (
            <p className="text-muted">먼저 카테고리 관리에서 카테고리를 추가해주세요.</p>
          )}
        </div>
        <div className="row">
          <button className="btn" onClick={onClose} disabled={saving}>
            취소
          </button>
          <button className="btn primary" disabled={!canSave || saving} onClick={handleSubmit}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
        {saveError && <p style={{ color: 'var(--danger)', marginTop: 8 }}>{saveError}</p>}
      </div>
    </div>

      {showDuplicateConfirm && (
        <ConfirmDialog
          message={`'${name.trim()}'은(는) 이미 등록된 재료예요. 그래도 새로 추가할까요?`}
          confirmLabel="추가"
          onConfirm={() => {
            setShowDuplicateConfirm(false);
            performSave();
          }}
          onCancel={() => setShowDuplicateConfirm(false)}
        />
      )}
    </>
  );
}
