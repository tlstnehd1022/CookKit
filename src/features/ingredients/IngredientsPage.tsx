import { useState } from 'react';
import { useCategories, useIngredients, usePantryStatus, makeId } from '../../data/store';
import { CategoryManager } from './CategoryManager';
import type { Ingredient } from '../../data/types';

export function IngredientsPage() {
  const { ingredients, saveIngredient, deleteIngredient } = useIngredients();
  const { categories } = useCategories();
  const { pantryStatus, setOwned } = usePantryStatus();
  const [editingAllergensId, setEditingAllergensId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggleCollapsed(categoryId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  const groups = categories.map((category) => ({
    category,
    items: ingredients.filter((ingredient) => ingredient.categoryId === category.id),
  }));
  const uncategorized = ingredients.filter(
    (ingredient) => !categories.some((c) => c.id === ingredient.categoryId),
  );

  return (
    <div>
      <div className="row">
        <h1>재료 관리</h1>
        <div className="chip-row" style={{ marginTop: 0 }}>
          <button className="btn small" onClick={() => setShowCategoryManager(true)}>
            카테고리 관리
          </button>
          <button className="btn primary small" onClick={() => setShowAddForm(true)}>
            + 재료 추가
          </button>
        </div>
      </div>

      {groups.map(({ category, items }) => {
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
            {!isCollapsed && items.length === 0 && (
              <div className="empty-hint" style={{ padding: '4px 0' }}>
                등록된 재료가 없습니다.
              </div>
            )}
            {!isCollapsed &&
              items.map((ingredient) => (
                <IngredientRow
                  key={ingredient.id}
                  ingredient={ingredient}
                  owned={pantryStatus[ingredient.id] ?? false}
                  onToggleOwned={() => setOwned(ingredient.id, !pantryStatus[ingredient.id])}
                  onEditAllergens={() => setEditingAllergensId(ingredient.id)}
                  onDelete={() => deleteIngredient(ingredient.id)}
                />
              ))}
          </div>
        );
      })}

      {uncategorized.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div className="section-title">미분류 ({uncategorized.length})</div>
          {uncategorized.map((ingredient) => (
            <IngredientRow
              key={ingredient.id}
              ingredient={ingredient}
              owned={pantryStatus[ingredient.id] ?? false}
              onToggleOwned={() => setOwned(ingredient.id, !pantryStatus[ingredient.id])}
              onEditAllergens={() => setEditingAllergensId(ingredient.id)}
              onDelete={() => deleteIngredient(ingredient.id)}
            />
          ))}
        </div>
      )}

      {editingAllergensId && (
        <AllergenEditorModal
          ingredient={ingredients.find((i) => i.id === editingAllergensId)!}
          onClose={() => setEditingAllergensId(null)}
          onSave={(allergens) => {
            const target = ingredients.find((i) => i.id === editingAllergensId);
            if (target) saveIngredient({ ...target, allergens });
            setEditingAllergensId(null);
          }}
        />
      )}

      {showAddForm && (
        <AddIngredientModal
          onClose={() => setShowAddForm(false)}
          onSave={(ingredient) => {
            saveIngredient(ingredient);
            setShowAddForm(false);
          }}
        />
      )}

      {showCategoryManager && <CategoryManager onClose={() => setShowCategoryManager(false)} />}
    </div>
  );
}

function IngredientRow({
  ingredient,
  owned,
  onToggleOwned,
  onEditAllergens,
  onDelete,
}: {
  ingredient: Ingredient;
  owned: boolean;
  onToggleOwned: () => void;
  onEditAllergens: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ingredient.name}
        </span>
        {ingredient.allergens.length > 0 && (
          <button className="chip allergen" style={{ flexShrink: 0 }} onClick={onEditAllergens}>
            ⚠ {ingredient.allergens.length}
          </button>
        )}
        {ingredient.allergens.length === 0 && (
          <button className="chip selectable" style={{ flexShrink: 0 }} onClick={onEditAllergens}>
            알러지
          </button>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button className="btn small danger" onClick={onDelete}>
          삭제
        </button>
        <button className={`toggle ${owned ? 'on' : ''}`} onClick={onToggleOwned} aria-label="보유 여부">
          <span className="knob" />
        </button>
      </div>
    </div>
  );
}

function AllergenEditorModal({
  ingredient,
  onClose,
  onSave,
}: {
  ingredient: Ingredient;
  onClose: () => void;
  onSave: (allergens: string[]) => void;
}) {
  const [allergens, setAllergens] = useState<string[]>(ingredient.allergens);
  const [draft, setDraft] = useState('');

  function addAllergen() {
    const trimmed = draft.trim();
    if (trimmed && !allergens.includes(trimmed)) {
      setAllergens([...allergens, trimmed]);
    }
    setDraft('');
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{ingredient.name} — 알러지 유발 성분</h2>
        <div className="chip-row">
          {allergens.map((allergen) => (
            <span className="chip allergen" key={allergen}>
              {allergen}
              <button onClick={() => setAllergens(allergens.filter((a) => a !== allergen))}>✕</button>
            </span>
          ))}
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label>새 알러지 성분 추가</label>
          <div className="row">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="예: 마늘, 밀가루"
              onKeyDown={(e) => e.key === 'Enter' && addAllergen()}
            />
            <button className="btn small" onClick={addAllergen}>
              추가
            </button>
          </div>
        </div>
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn" onClick={onClose}>
            취소
          </button>
          <button className="btn primary" onClick={() => onSave(allergens)}>
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

function AddIngredientModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (ingredient: Ingredient) => void;
}) {
  const { categories } = useCategories();
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [defaultBuyUnit, setDefaultBuyUnit] = useState('');

  const canSave = name.trim().length > 0 && categoryId;

  return (
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
        <div className="field">
          <label>추천 구매 단위</label>
          <input
            value={defaultBuyUnit}
            onChange={(e) => setDefaultBuyUnit(e.target.value)}
            placeholder="예: 1개, 500g"
          />
        </div>
        <div className="row">
          <button className="btn" onClick={onClose}>
            취소
          </button>
          <button
            className="btn primary"
            disabled={!canSave}
            onClick={() =>
              onSave({
                id: makeId('ing'),
                name: name.trim(),
                categoryId,
                defaultBuyUnit: defaultBuyUnit.trim() || '1개',
                allergens: [],
              })
            }
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
