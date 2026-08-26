import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  useCategories,
  useIngredients,
  useIngredientsById,
  usePantryStatus,
  useRecipes,
  getCurrentHouseholdId,
} from '../../data/store';
import { useShoppingSelection, type ShoppingSelectionEntry } from '../../data/shoppingSelection';
import { useShoppingExtraItems } from '../../data/shoppingExtraItems';
import { useHousehold } from '../../data/household';
import { scaleAmount } from '../../data/computed';
import { AddIngredientModal } from '../ingredients/IngredientsPage';
import { fetchFillFrequencies, type FillFrequencyInfo } from '../../data/ingredientFillLog';
import { computeRefillSuggestions } from '../../lib/refillSuggestions';
import { getPantryAvailability } from '../../lib/pantryAvailability';
import { getErrorMessage } from '../../lib/errorMessage';
import { showUndoToast } from '../../data/undoToast';
import type { Ingredient, Recipe } from '../../data/types';
import { pushHistoryEntry, goBack, discardHistoryEntries } from '../../lib/navigationHistory';

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
  const { categories } = useCategories();
  const ingredientsById = useIngredientsById();
  const { setOwned } = usePantryStatus();
  const { selection, selectedRecipeIds, toggle: toggleRecipe, updateServings } = useShoppingSelection();
  const { items: extraItems, add: addExtraItem, remove: removeExtraItem } = useShoppingExtraItems();
  const { household } = useHousehold();
  // 화면 목적이 "뭘 사야 하는지"라 기본값을 "구매 필요"로 시작한다(요구사항 4).
  const [filterMode, setFilterMode] = useState<FilterMode>('need');
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
  // 재료 수량은 recipe.servingsBase가 아니라 담을 때(또는 아래에서 개별 조절한) 인분
  // (entry.servings) 기준으로 scaleAmount 재계산한다 — B-0에서 확인된 버그(인분 조절이 장보기에
  // 반영 안 되던 문제) 수정.
  const aggregated: AggregatedRow[] = useMemo(() => {
    const map = new Map<string, AggregatedRow>();
    for (const entry of selection) {
      const recipe = recipes.find((r) => r.id === entry.recipeId);
      if (!recipe) continue;
      const contributionLabel = `${recipe.name} ${entry.servings}인분`;
      for (const item of recipe.ingredients) {
        const scaledAmount = scaleAmount(item.amount, recipe.servingsBase, entry.servings);
        const key = `${item.ingredientId}__${item.unit}`;
        const existing = map.get(key);
        if (existing) {
          existing.totalAmount += scaledAmount;
          if (!existing.sourceLabel.split(', ').includes(contributionLabel)) {
            existing.sourceLabel = `${existing.sourceLabel}, ${contributionLabel}`;
          }
        } else {
          map.set(key, {
            key,
            ingredientId: item.ingredientId,
            unit: item.unit,
            totalAmount: scaledAmount,
            sourceLabel: contributionLabel,
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
  }, [recipes, selection, extraItems, ingredientsById]);

  // A-5: "구매 필요"/"보유" 구분은 usable 기준 — 유통기한 지나 확인이 필요한 재료는 "보유"로
  // 치지 않는다(완전히 없다고 치지도 않고 "구매 필요" 쪽에 섞이되, 행 표시에서 별도 안내한다).
  // 삭제된 재료(ingredientsById에 없음)는 usable이 아닌 것으로 취급.
  function isRowUsable(ingredientId: string): boolean {
    const ingredient = ingredientsById.get(ingredientId);
    return ingredient != null && getPantryAvailability(ingredient) === 'usable';
  }

  const filteredRows = aggregated.filter((row) => {
    const usable = isRowUsable(row.ingredientId);
    if (filterMode === 'need') return !usable;
    if (filterMode === 'owned') return usable;
    return true;
  });

  const neededCount = aggregated.filter((row) => !isRowUsable(row.ingredientId)).length;
  const gotCount = aggregated.length - neededCount;
  const checkedRows = aggregated.filter((row) => checkedKeys.has(row.key));

  // 카테고리(매대)별로 묶어서 보여준다 — 매장 동선대로 한 구역씩 사면서 확인하기 쉽게. 재료
  // 관리 화면(IngredientsPage)의 categories 순서를 그대로 따르고, 삭제된 재료는 "기타"로 묶는다.
  const groupedRows = useMemo(() => {
    const byCategory = new Map<string, AggregatedRow[]>();
    const uncategorized: AggregatedRow[] = [];
    for (const row of filteredRows) {
      const categoryId = ingredientsById.get(row.ingredientId)?.categoryId;
      if (!categoryId) {
        uncategorized.push(row);
        continue;
      }
      const list = byCategory.get(categoryId);
      if (list) list.push(row);
      else byCategory.set(categoryId, [row]);
    }
    const groups = categories
      .map((category) => ({ name: category.name, rows: byCategory.get(category.id) ?? [] }))
      .filter((group) => group.rows.length > 0);
    if (uncategorized.length > 0) groups.push({ name: '기타', rows: uncategorized });
    return groups;
  }, [filteredRows, ingredientsById, categories]);

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
      // 새로 담을 때(이미 담겨 있으면 무시되고 그냥 빠짐)는 가구 기본 인원을 초기값으로 쓴다 —
      // 여기(레시피에서 담기 모달)는 "지금 보고 있던 인분" 같은 화면 맥락이 없어서.
      await toggleRecipe(recipeId, household?.defaultServings ?? 2);
    } catch (err) {
      console.error('장보기 담기 실패:', err);
      alert('장보기에 담지 못했어요. 다시 시도해주세요.');
    }
  }

  async function handleUpdateServings(recipeId: string, servings: number) {
    if (servings < 1) return;
    try {
      await updateServings(recipeId, servings);
    } catch (err) {
      console.error('인분 수정 실패:', err);
      alert('인분을 수정하지 못했어요. 다시 시도해주세요.');
    }
  }

  async function handleRemoveRecipe(recipeId: string) {
    try {
      await toggleRecipe(recipeId, 0); // 이미 담긴 상태라 servings 인자는 쓰이지 않고 그냥 빠짐
    } catch (err) {
      console.error('장보기에서 빼기 실패:', err);
      alert('장보기에서 빼지 못했어요. 다시 시도해주세요.');
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
    goBack();
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
            <button
              className="btn primary"
              onClick={() => {
                pushHistoryEntry(() => setShowRecipeSelect(false));
                setShowRecipeSelect(true);
              }}
            >
              레시피에서 담기
            </button>
            <button
              className="btn"
              onClick={() => {
                pushHistoryEntry(() => setShowAddExtra(false));
                setShowAddExtra(true);
              }}
            >
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
            <button
              type="button"
              className="btn-icon-plain"
              onClick={() => {
                pushHistoryEntry(() => setShowAddMenu(false));
                setShowAddMenu(true);
              }}
              aria-label="담기"
            >
              <Plus size={22} strokeWidth={2.75} />
            </button>
          </div>

          {selection.length > 0 && (
            <>
              <div className="section-title" style={{ marginTop: 4 }}>담은 레시피</div>
              {selection.map((entry) => (
                <ShoppingRecipeRow
                  key={entry.recipeId}
                  entry={entry}
                  recipe={recipes.find((r) => r.id === entry.recipeId)}
                  onChangeServings={(next) => handleUpdateServings(entry.recipeId, next)}
                  onRemove={() => handleRemoveRecipe(entry.recipeId)}
                />
              ))}
            </>
          )}

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
          {groupedRows.map((group) => (
            <div key={group.name} style={{ marginBottom: 4 }}>
              <div className="section-title" style={{ margin: '12px 0 2px' }}>
                {group.name}
              </div>
              {group.rows.map((row) => (
                <ShoppingItemRow
                  key={row.key}
                  row={row}
                  ingredient={ingredientsById.get(row.ingredientId)}
                  checked={checkedKeys.has(row.key)}
                  onToggleChecked={() => toggleChecked(row.key)}
                />
              ))}
            </div>
          ))}
        </>
      )}

      {checkedRows.length > 0 && (
        <div className="shopping-move-bar">
          <button
            className="btn primary"
            style={{ width: '100%' }}
            onClick={() => {
              pushHistoryEntry(() => setShowMoveToFridge(false));
              setShowMoveToFridge(true);
            }}
          >
            담은 재료 {checkedRows.length}개 냉장고로 옮기기
          </button>
        </div>
      )}

      {showAddMenu && (
        <AddMenuSheet
          onClose={goBack}
          onPickRecipe={() => {
            discardHistoryEntries(1);
            setShowAddMenu(false);
            pushHistoryEntry(() => setShowRecipeSelect(false));
            setShowRecipeSelect(true);
          }}
          onPickManual={() => {
            discardHistoryEntries(1);
            setShowAddMenu(false);
            pushHistoryEntry(() => setShowAddExtra(false));
            setShowAddExtra(true);
          }}
        />
      )}

      {showRecipeSelect && (
        <RecipeSelectModal
          recipes={recipes}
          selectedRecipeIds={selectedRecipeIds}
          onToggle={handleToggleRecipe}
          onClose={goBack}
        />
      )}

      {showAddExtra && (
        <AddIngredientModal
          existingNames={ingredients.map((i) => i.name.trim().toLowerCase())}
          defaultOwned={false}
          onClose={goBack}
          onSave={handleAddExtraIngredient}
        />
      )}

      {showMoveToFridge && (
        <MoveToFridgeModal
          rows={checkedRows}
          ingredientsById={ingredientsById}
          onClose={goBack}
          onApply={async (expirationDates) => {
            // 실행 취소(E)용 — 재료 원본과, 삭제될 shopping_extra_items 행(재추가에 필요한
            // ingredientId/amount/unit)을 미리 스냅샷으로 남겨둔다.
            const ingredientSnapshots: Ingredient[] = [];
            const removedExtraItems: { ingredientId: string; amount?: number; unit?: string }[] = [];
            for (const row of checkedRows) {
              const ingredient = ingredientsById.get(row.ingredientId);
              if (!ingredient) continue;
              ingredientSnapshots.push(ingredient);
              const expirationDate = expirationDates.get(row.key)?.trim();
              await markIngredientFilled({
                ...ingredient,
                expirationDate: expirationDate || ingredient.expirationDate,
              });
              if (row.extraItemId) {
                const extra = extraItems.find((e) => e.id === row.extraItemId);
                if (extra) {
                  removedExtraItems.push({
                    ingredientId: extra.ingredientId,
                    amount: extra.amount ?? undefined,
                    unit: extra.unit ?? undefined,
                  });
                }
                await removeExtraItem(row.extraItemId);
              }
            }
            setCheckedKeys(new Set());
            goBack();
            if (ingredientSnapshots.length > 0) {
              showUndoToast(`냉장고로 옮겼어요 (${ingredientSnapshots.length}개)`, async () => {
                for (const snapshot of ingredientSnapshots) {
                  await saveIngredient(snapshot);
                }
                for (const extra of removedExtraItems) {
                  await addExtraItem(extra.ingredientId, extra.amount, extra.unit);
                }
              });
            }
          }}
        />
      )}
    </div>
  );
}

/** 집계된 재료 한 행 — 카테고리(매대)별 그룹 안에서 반복 렌더링된다. 보유 여부 수정은 여기서
 * 하지 않는다(냉장고 탭에서만) — "담음" 체크(왼쪽) 하나로 충분하고, 보유 토글까지 같이 있으면
 * "구매 필요" 필터와 상호작용하면서 혼란스러웠다(토글을 켜면 항목이 필터에서 바로 사라지는 등).
 * 클릭 영역은 원형 버튼뿐 아니라 행 전체 — 재료명을 눌러도 반응이 없다는 피드백을 반영해 행에
 * onClick을 달았다(원형 버튼 자체의 onClick은 없애 이벤트 버블링으로 한 번만 토글되게 함). */
function ShoppingItemRow({
  row,
  ingredient,
  checked,
  onToggleChecked,
}: {
  row: AggregatedRow;
  ingredient: Ingredient | undefined;
  checked: boolean;
  onToggleChecked: () => void;
}) {
  const isExpired = ingredient != null && getPantryAvailability(ingredient) === 'expired_unconfirmed';
  return (
    <div
      className="shopping-item-row"
      style={{ opacity: checked ? 0.55 : 1, cursor: 'pointer' }}
      onClick={onToggleChecked}
    >
      <button
        type="button"
        className={`shopping-item-check ${checked ? 'checked' : ''}`}
        aria-label="담음 체크"
      >
        {checked && '✓'}
      </button>
      <div className="shopping-item-body">
        <div className={`shopping-item-name ${checked ? 'checked' : ''}`}>{ingredient?.name ?? '(삭제된 재료)'}</div>
        <div className="text-muted" style={{ fontSize: 11 }}>
          {row.sourceLabel}
        </div>
        {isExpired && <div className="shopping-item-note">유통기한 지남 — 확인 필요(냉장고 탭에서 확인)</div>}
      </div>
      <div className="text-muted" style={{ flexShrink: 0, fontSize: 12 }}>
        {row.totalAmount} {row.unit}
      </div>
    </div>
  );
}

/** "담은 레시피" 목록의 한 행 — 인분을 개별로 조절(수정 시 상위에서 즉시 재집계)하거나 통째로
 * 뺄 수 있다(B-3). */
function ShoppingRecipeRow({
  entry,
  recipe,
  onChangeServings,
  onRemove,
}: {
  entry: ShoppingSelectionEntry;
  recipe: Recipe | undefined;
  onChangeServings: (next: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="shopping-recipe-row">
      <span className="shopping-recipe-name">{recipe?.name ?? '(삭제된 레시피)'}</span>
      <div className="stepper">
        <button onClick={() => onChangeServings(Math.max(1, entry.servings - 1))}>−</button>
        <strong>{entry.servings}인분</strong>
        <button onClick={() => onChangeServings(entry.servings + 1)}>+</button>
      </div>
      <button className="btn small danger" onClick={onRemove}>
        빼기
      </button>
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
