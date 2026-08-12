import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useIngredients, useIngredientsById, usePantryStatus, useRecipes, getCurrentHouseholdId } from '../../data/store';
import { useShoppingSelection } from '../../data/shoppingSelection';
import { useShoppingExtraItems } from '../../data/shoppingExtraItems';
import { AddIngredientModal } from '../ingredients/IngredientsPage';
import { fetchFillFrequencies, type FillFrequencyInfo } from '../../data/ingredientFillLog';
import { computeRefillSuggestions } from '../../lib/refillSuggestions';
import { getErrorMessage } from '../../lib/errorMessage';
import type { Ingredient, Recipe } from '../../data/types';

type FilterMode = 'all' | 'need' | 'owned';

interface AggregatedRow {
  key: string;
  ingredientId: string;
  unit: string;
  totalAmount: number;
  /** 이 재료를 필요로 하는 레시피 이름들(콤마 구분), 직접 추가한 항목이면 "직접 추가" */
  sourceLabel: string;
  /** shopping_extra_items에서 온 행이면 그 행의 id — 냉장고로 옮기기 적용 시 삭제 대상 */
  extraItemId?: string;
}

export function ShoppingListPage() {
  const { recipes } = useRecipes();
  const { ingredients, saveIngredient, markIngredientFilled } = useIngredients();
  const ingredientsById = useIngredientsById();
  const { pantryStatus, setOwned } = usePantryStatus();
  const { selectedRecipeIds, toggle: toggleRecipe } = useShoppingSelection();
  const { items: extraItems, add: addExtraItem, remove: removeExtraItem } = useShoppingExtraItems();
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [fillFrequencies, setFillFrequencies] = useState<Map<string, FillFrequencyInfo> | null>(null);
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showRecipeSelect, setShowRecipeSelect] = useState(false);
  const [showAddExtra, setShowAddExtra] = useState(false);
  const [showMoveToFridge, setShowMoveToFridge] = useState(false);

  // "자주 채우는데 지금 없어요" 선제 제안 근거 데이터 — 계산이 무거울 수 있어 화면 진입 시 1회만
  // 조회하고 재사용한다(usePantryStatus처럼 계속 구독하는 캐시가 아님).
  useEffect(() => {
    const householdId = getCurrentHouseholdId();
    if (!householdId) return;
    let cancelled = false;
    fetchFillFrequencies(householdId)
      .then((result) => {
        if (!cancelled) setFillFrequencies(result);
      })
      .catch((err) => console.error('채움 빈도 조회 실패:', err));
    return () => {
      cancelled = true;
    };
  }, []);

  const refillSuggestions = useMemo(
    () => (fillFrequencies ? computeRefillSuggestions(ingredients, fillFrequencies) : []),
    [ingredients, fillFrequencies],
  );

  // 레시피에서 자동 집계된 항목 + 직접 추가한 항목(shopping_extra_items)을 하나의 목록으로 합친다 —
  // 직접 추가한 항목은 단위/수량이 다를 수 있어 레시피 집계와 병합하지 않고 별도 행으로 둔다.
  const aggregated: AggregatedRow[] = useMemo(() => {
    const map = new Map<string, AggregatedRow>();
    const selectedRecipes = recipes.filter((recipe) => selectedRecipeIds.includes(recipe.id));
    for (const recipe of selectedRecipes) {
      for (const item of recipe.ingredients) {
        const key = `${item.ingredientId}__${item.unit}`;
        const existing = map.get(key);
        if (existing) {
          existing.totalAmount += item.amount;
          if (!existing.sourceLabel.split(', ').includes(recipe.name)) {
            existing.sourceLabel = `${existing.sourceLabel}, ${recipe.name}`;
          }
        } else {
          map.set(key, {
            key,
            ingredientId: item.ingredientId,
            unit: item.unit,
            totalAmount: item.amount,
            sourceLabel: recipe.name,
          });
        }
      }
    }
    for (const extra of extraItems) {
      map.set(`extra__${extra.id}`, {
        key: `extra__${extra.id}`,
        ingredientId: extra.ingredientId,
        unit: extra.unit ?? ingredientsById.get(extra.ingredientId)?.defaultBuyUnit ?? '',
        totalAmount: extra.amount ?? 1,
        sourceLabel: '직접 추가',
        extraItemId: extra.id,
      });
    }
    return Array.from(map.values());
  }, [recipes, selectedRecipeIds, extraItems, ingredientsById]);

  const filteredRows = aggregated.filter((row) => {
    const owned = pantryStatus[row.ingredientId] ?? false;
    if (filterMode === 'need') return !owned;
    if (filterMode === 'owned') return owned;
    return true;
  });

  const neededCount = aggregated.filter((row) => !(pantryStatus[row.ingredientId] ?? false)).length;
  const gotCount = aggregated.length - neededCount;
  const checkedRows = aggregated.filter((row) => checkedKeys.has(row.key));

  async function handleToggleOwned(id: string, next: boolean) {
    try {
      await setOwned(id, next);
    } catch (err) {
      console.error('재료 보유 상태 저장 실패:', err);
      alert('재료 상태를 저장하지 못했어요. 다시 시도해주세요.');
    }
  }

  async function handleToggleRecipe(recipeId: string) {
    try {
      await toggleRecipe(recipeId);
    } catch (err) {
      console.error('장보기 담기 실패:', err);
      alert('장보기에 담지 못했어요. 다시 시도해주세요.');
    }
  }

  function toggleChecked(key: string) {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /** "직접 추가" — 이미 있는 이름이면 기존 재료를 그대로 링크하고, 없으면 새로 등록(owned:false)
   * 한 뒤 shopping_extra_items에 연결한다. */
  async function handleAddExtraIngredient(ingredient: Ingredient) {
    const existing = ingredients.find((i) => i.name.trim().toLowerCase() === ingredient.name.trim().toLowerCase());
    const ingredientId = existing ? existing.id : ingredient.id;
    if (!existing) {
      await saveIngredient(ingredient);
    }
    await addExtraItem(ingredientId);
    setShowAddExtra(false);
  }

  const isEmpty = selectedRecipeIds.length === 0 && extraItems.length === 0;

  return (
    <div>
      <h1>장보기 리스트</h1>

      {refillSuggestions.length > 0 && (
        <>
          <div className="section-title">💡 이런 재료는 어떠세요?</div>
          <div className="card" style={{ marginBottom: 12 }}>
            {refillSuggestions.map((ingredient) => (
              <div className="row" key={ingredient.id} style={{ padding: '4px 0' }}>
                <span>{ingredient.name}, 자주 채우시는데 지금 없어요</span>
                <button className="btn small" onClick={() => handleToggleOwned(ingredient.id, true)}>
                  ✅ 채웠어요
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {isEmpty ? (
        <div className="empty-hint" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          아직 담은 게 없어요
          <span style={{ fontSize: 13 }}>레시피를 고르면 필요한 재료가 모여요</span>
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 4 }}>
            <button className="btn primary" onClick={() => setShowRecipeSelect(true)}>
              레시피에서 담기
            </button>
            <button className="btn" onClick={() => setShowAddExtra(true)}>
              직접 추가
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="row">
            <span style={{ fontSize: 15, fontWeight: 600 }}>
              살 것 {neededCount}개 · 담은 것 {gotCount}개
            </span>
            <button type="button" className="btn-icon-plain" onClick={() => setShowAddMenu(true)} aria-label="담기">
              <Plus size={22} strokeWidth={2.75} />
            </button>
          </div>

          <div className="chip-row-scroll" style={{ marginTop: 6, marginBottom: 10 }}>
            <button
              className={`chip selectable ${filterMode === 'all' ? 'active' : ''}`}
              onClick={() => setFilterMode('all')}
            >
              전체
            </button>
            <button
              className={`chip selectable ${filterMode === 'need' ? 'active' : ''}`}
              onClick={() => setFilterMode('need')}
            >
              구매 필요
            </button>
            <button
              className={`chip selectable ${filterMode === 'owned' ? 'active' : ''}`}
              onClick={() => setFilterMode('owned')}
            >
              보유
            </button>
          </div>

          {filteredRows.length === 0 && <div className="empty-hint">조건에 맞는 재료가 없습니다.</div>}
          {filteredRows.map((row) => {
            const ingredient = ingredientsById.get(row.ingredientId);
            const owned = pantryStatus[row.ingredientId] ?? false;
            const checked = checkedKeys.has(row.key);
            return (
              <div className="shopping-item-row" key={row.key} style={{ opacity: checked ? 0.55 : 1 }}>
                <button
                  type="button"
                  className={`shopping-item-check ${checked ? 'checked' : ''}`}
                  onClick={() => toggleChecked(row.key)}
                  aria-label="담음 체크"
                >
                  {checked && '✓'}
                </button>
                <div className="shopping-item-body">
                  <div className={`shopping-item-name ${checked ? 'checked' : ''}`}>
                    {ingredient?.name ?? '(삭제된 재료)'}
                  </div>
                  <div className="text-muted" style={{ fontSize: 11 }}>
                    {row.sourceLabel}
                  </div>
                </div>
                <div className="text-muted" style={{ flexShrink: 0, fontSize: 12 }}>
                  {row.totalAmount} {row.unit}
                </div>
                <button
                  className={`toggle ${owned ? 'on' : ''}`}
                  onClick={() => handleToggleOwned(row.ingredientId, !owned)}
                  disabled={!ingredient}
                  aria-label="보유 여부"
                  title={!ingredient ? '삭제된 재료라 상태를 변경할 수 없어요' : undefined}
                >
                  <span className="knob" />
                </button>
              </div>
            );
          })}
        </>
      )}

      {checkedRows.length > 0 && (
        <div className="shopping-move-bar">
          <button className="btn primary" style={{ width: '100%' }} onClick={() => setShowMoveToFridge(true)}>
            담은 재료 {checkedRows.length}개 냉장고로 옮기기
          </button>
        </div>
      )}

      {showAddMenu && (
        <AddMenuSheet
          onClose={() => setShowAddMenu(false)}
          onPickRecipe={() => {
            setShowAddMenu(false);
            setShowRecipeSelect(true);
          }}
          onPickManual={() => {
            setShowAddMenu(false);
            setShowAddExtra(true);
          }}
        />
      )}

      {showRecipeSelect && (
        <RecipeSelectModal
          recipes={recipes}
          selectedRecipeIds={selectedRecipeIds}
          onToggle={handleToggleRecipe}
          onClose={() => setShowRecipeSelect(false)}
        />
      )}

      {showAddExtra && (
        <AddIngredientModal
          existingNames={ingredients.map((i) => i.name.trim().toLowerCase())}
          defaultOwned={false}
          onClose={() => setShowAddExtra(false)}
          onSave={handleAddExtraIngredient}
        />
      )}

      {showMoveToFridge && (
        <MoveToFridgeModal
          rows={checkedRows}
          ingredientsById={ingredientsById}
          onClose={() => setShowMoveToFridge(false)}
          onApply={async (expirationDates) => {
            for (const row of checkedRows) {
              const ingredient = ingredientsById.get(row.ingredientId);
              if (!ingredient) continue;
              const expirationDate = expirationDates.get(row.key)?.trim();
              await markIngredientFilled({
                ...ingredient,
                expirationDate: expirationDate || ingredient.expirationDate,
              });
              if (row.extraItemId) {
                await removeExtraItem(row.extraItemId);
              }
            }
            setCheckedKeys(new Set());
            setShowMoveToFridge(false);
          }}
        />
      )}
    </div>
  );
}

function AddMenuSheet({
  onClose,
  onPickRecipe,
  onPickManual,
}: {
  onClose: () => void;
  onPickRecipe: () => void;
  onPickManual: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>무엇을 담을까요?</h2>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn primary" style={{ flex: 1 }} onClick={onPickRecipe}>
            레시피에서 담기
          </button>
          <button className="btn" style={{ flex: 1 }} onClick={onPickManual}>
            직접 추가
          </button>
        </div>
      </div>
    </div>
  );
}

function RecipeSelectModal({
  recipes,
  selectedRecipeIds,
  onToggle,
  onClose,
}: {
  recipes: Recipe[];
  selectedRecipeIds: string[];
  onToggle: (recipeId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>레시피에서 담기</h2>
        {recipes.length === 0 && <div className="empty-hint">등록된 레시피가 없습니다.</div>}
        <div className="chip-row">
          {recipes.map((recipe) => (
            <button
              key={recipe.id}
              className={`chip selectable ${selectedRecipeIds.includes(recipe.id) ? 'active' : ''}`}
              onClick={() => onToggle(recipe.id)}
            >
              {recipe.name}
            </button>
          ))}
        </div>
        <button className="btn primary" style={{ width: '100%', marginTop: 16 }} onClick={onClose}>
          완료
        </button>
      </div>
    </div>
  );
}

/** 체크한 항목을 냉장고로 옮긴다(E-4) — 재료별 유통기한 입력은 선택 사항(장 보고 온 직후가
 * 입력하기 가장 좋은 타이밍이라 여기서 받아둔다). 적용 시 owned:true + lastFilledAt 갱신은
 * markIngredientFilled가 한 번에 처리하고, 직접 추가했던 항목은 shopping_extra_items에서 제거한다
 * (레시피 유래 항목은 owned=true가 되면 "구매 필요" 필터에서 자연히 빠져 별도 삭제가 필요 없다). */
function MoveToFridgeModal({
  rows,
  ingredientsById,
  onClose,
  onApply,
}: {
  rows: AggregatedRow[];
  ingredientsById: Map<string, Ingredient>;
  onClose: () => void;
  onApply: (expirationDates: Map<string, string>) => Promise<void>;
}) {
  const [expirationDates, setExpirationDates] = useState<Map<string, string>>(new Map());
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApply() {
    setApplying(true);
    setError(null);
    try {
      await onApply(expirationDates);
    } catch (err) {
      setError(getErrorMessage(err, '적용 중 오류가 발생했습니다.'));
      setApplying(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>냉장고로 옮기기</h2>
        <p className="text-muted" style={{ marginTop: -4 }}>
          유통기한은 선택이에요 — 비워도 돼요.
        </p>
        {rows.map((row) => {
          const ingredient = ingredientsById.get(row.ingredientId);
          return (
            <div className="field" key={row.key}>
              <label>{ingredient?.name ?? '(삭제된 재료)'}</label>
              <input
                type="date"
                value={expirationDates.get(row.key) ?? ''}
                onChange={(e) =>
                  setExpirationDates((prev) => {
                    const next = new Map(prev);
                    next.set(row.key, e.target.value);
                    return next;
                  })
                }
              />
            </div>
          );
        })}
        {error && <p style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</p>}
        <div className="row" style={{ gap: 6, marginTop: 12 }}>
          <button className="btn" onClick={onClose} disabled={applying}>
            취소
          </button>
          <button className="btn primary" onClick={handleApply} disabled={applying}>
            {applying ? '적용하는 중...' : '적용'}
          </button>
        </div>
      </div>
    </div>
  );
}
