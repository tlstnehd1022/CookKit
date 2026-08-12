import { useEffect, useMemo, useState } from 'react';
import { useIngredients, useIngredientsById, usePantryStatus, useRecipes, getCurrentHouseholdId } from '../../data/store';
import { useShoppingSelection } from '../../data/shoppingSelection';
import { ReceiptScanModal } from '../ingredients/ReceiptScanModal';
import { fetchFillFrequencies, type FillFrequencyInfo } from '../../data/ingredientFillLog';
import { computeRefillSuggestions } from '../../lib/refillSuggestions';

type FilterMode = 'all' | 'need' | 'owned';

interface AggregatedRow {
  ingredientId: string;
  unit: string;
  totalAmount: number;
}

export function ShoppingListPage() {
  const { recipes } = useRecipes();
  const { ingredients } = useIngredients();
  const ingredientsById = useIngredientsById();
  const { pantryStatus, setOwned } = usePantryStatus();
  const { selectedRecipeIds, toggle: toggleRecipe } = useShoppingSelection();
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [showReceiptScan, setShowReceiptScan] = useState(false);
  const [fillFrequencies, setFillFrequencies] = useState<Map<string, FillFrequencyInfo> | null>(null);

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

  const aggregated: AggregatedRow[] = useMemo(() => {
    const map = new Map<string, AggregatedRow>();
    const selectedRecipes = recipes.filter((recipe) => selectedRecipeIds.includes(recipe.id));
    for (const recipe of selectedRecipes) {
      for (const item of recipe.ingredients) {
        const key = `${item.ingredientId}__${item.unit}`;
        const existing = map.get(key);
        if (existing) {
          existing.totalAmount += item.amount;
        } else {
          map.set(key, { ingredientId: item.ingredientId, unit: item.unit, totalAmount: item.amount });
        }
      }
    }
    return Array.from(map.values());
  }, [recipes, selectedRecipeIds]);

  const filteredRows = aggregated.filter((row) => {
    const owned = pantryStatus[row.ingredientId] ?? false;
    if (filterMode === 'need') return !owned;
    if (filterMode === 'owned') return owned;
    return true;
  });

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

  return (
    <div>
      <div className="row">
        <h1>장보기 리스트</h1>
        <button className="btn small" onClick={() => setShowReceiptScan(true)}>
          📷 영수증으로 재료 업데이트
        </button>
      </div>

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

      <div className="section-title">만들 레시피 선택</div>
      {recipes.length === 0 && <div className="empty-hint">등록된 레시피가 없습니다.</div>}
      <div className="chip-row">
        {recipes.map((recipe) => (
          <button
            key={recipe.id}
            className={`chip selectable ${selectedRecipeIds.includes(recipe.id) ? 'active' : ''}`}
            onClick={() => handleToggleRecipe(recipe.id)}
          >
            {recipe.name}
          </button>
        ))}
      </div>

      <div className="section-title">필터</div>
      <div className="chip-row">
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

      <div className="section-title">필요한 재료 ({filteredRows.length})</div>
      {selectedRecipeIds.length === 0 && (
        <div className="empty-hint">레시피를 선택하면 필요한 재료가 여기에 모입니다.</div>
      )}
      {selectedRecipeIds.length > 0 && filteredRows.length === 0 && (
        <div className="empty-hint">조건에 맞는 재료가 없습니다.</div>
      )}
      {filteredRows.map((row) => {
        const ingredient = ingredientsById.get(row.ingredientId);
        const owned = pantryStatus[row.ingredientId] ?? false;
        return (
          <div className="card" key={`${row.ingredientId}-${row.unit}`}>
            <div className="row">
              <div>
                <strong>{ingredient?.name ?? '(삭제된 재료)'}</strong>
                <div className="text-muted">
                  실제 필요량: {row.totalAmount} {row.unit} · 추천 구매 단위: {ingredient?.defaultBuyUnit ?? '-'}
                </div>
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
          </div>
        );
      })}

      {showReceiptScan && <ReceiptScanModal onClose={() => setShowReceiptScan(false)} />}
    </div>
  );
}
