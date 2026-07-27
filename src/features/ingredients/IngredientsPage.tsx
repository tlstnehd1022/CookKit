import { useState } from 'react';
import { useCategories, useIngredients, usePantryStatus, makeId } from '../../data/store';
import { CategoryManager } from './CategoryManager';
import { COMMON_UNITS } from '../../data/units';
import type { Ingredient } from '../../data/types';

export function IngredientsPage() {
  const { ingredients, saveIngredient, deleteIngredient } = useIngredients();
  const { categories } = useCategories();
  const { pantryStatus, setOwned } = usePantryStatus();
  const [editingDetailsId, setEditingDetailsId] = useState<string | null>(null);
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
                  onEditDetails={() => setEditingDetailsId(ingredient.id)}
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
              onEditDetails={() => setEditingDetailsId(ingredient.id)}
              onDelete={() => deleteIngredient(ingredient.id)}
            />
          ))}
        </div>
      )}

      {editingDetailsId && (
        <IngredientDetailModal
          ingredient={ingredients.find((i) => i.id === editingDetailsId)!}
          onClose={() => setEditingDetailsId(null)}
          onSave={(patch) => {
            const target = ingredients.find((i) => i.id === editingDetailsId);
            if (target) saveIngredient({ ...target, ...patch });
            setEditingDetailsId(null);
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
  onEditDetails,
  onDelete,
}: {
  ingredient: Ingredient;
  owned: boolean;
  onToggleOwned: () => void;
  onEditDetails: () => void;
  onDelete: () => void;
}) {
  const hasPreference = Boolean(ingredient.preferredUnit || ingredient.preferredMethod);
  return (
    <div className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ingredient.name}
        </span>
        {ingredient.allergens.length > 0 ? (
          <button className="chip allergen" style={{ flexShrink: 0 }} onClick={onEditDetails}>
            ⚠ {ingredient.allergens.length}
          </button>
        ) : (
          <button className="chip selectable" style={{ flexShrink: 0 }} onClick={onEditDetails}>
            {hasPreference ? '⚙ 선호' : '설정'}
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

interface IngredientDetailPatch {
  allergens: string[];
  preferredUnit?: string;
  preferredMethod?: string;
}

const METHOD_PRESETS = ['다진 것', '편으로', '그라인더로', '가루로', '생것 그대로'];
const CUSTOM_METHOD_VALUE = '__custom__';

function IngredientDetailModal({
  ingredient,
  onClose,
  onSave,
}: {
  ingredient: Ingredient;
  onClose: () => void;
  onSave: (patch: IngredientDetailPatch) => void;
}) {
  const [allergens, setAllergens] = useState<string[]>(ingredient.allergens);
  const [draft, setDraft] = useState('');
  const [preferredUnit, setPreferredUnit] = useState(ingredient.preferredUnit ?? '');

  const initialMethod = ingredient.preferredMethod ?? '';
  const isInitialPreset = METHOD_PRESETS.includes(initialMethod);
  const [selectedMethod, setSelectedMethod] = useState(
    initialMethod === '' ? '' : isInitialPreset ? initialMethod : CUSTOM_METHOD_VALUE,
  );
  const [customMethodText, setCustomMethodText] = useState(isInitialPreset ? '' : initialMethod);

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
        <h2>{ingredient.name} — 상세 설정</h2>

        <div className="section-title">알러지 유발 성분</div>
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

        <div className="section-title">개인 선호 (AI 레시피 생성/수정 시 참고됨)</div>
        <div className="field">
          <label>선호 계량 단위 (선택)</label>
          <select value={preferredUnit} onChange={(e) => setPreferredUnit(e.target.value)}>
            <option value="">(설정 안 함)</option>
            {COMMON_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>선호 방식 (선택)</label>
          <div className="chip-row">
            {METHOD_PRESETS.map((method) => (
              <button
                key={method}
                className={`chip selectable ${selectedMethod === method ? 'active' : ''}`}
                onClick={() => setSelectedMethod((prev) => (prev === method ? '' : method))}
              >
                {method}
              </button>
            ))}
            <button
              className={`chip selectable ${selectedMethod === CUSTOM_METHOD_VALUE ? 'active' : ''}`}
              onClick={() =>
                setSelectedMethod((prev) => (prev === CUSTOM_METHOD_VALUE ? '' : CUSTOM_METHOD_VALUE))
              }
            >
              직접입력
            </button>
          </div>
          {selectedMethod === CUSTOM_METHOD_VALUE && (
            <input
              style={{ marginTop: 6 }}
              value={customMethodText}
              onChange={(e) => setCustomMethodText(e.target.value)}
              placeholder="예: 다진 마늘 대신 마늘칩 사용"
            />
          )}
        </div>

        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn" onClick={onClose}>
            취소
          </button>
          <button
            className="btn primary"
            onClick={() =>
              onSave({
                allergens,
                preferredUnit: preferredUnit.trim() || undefined,
                preferredMethod:
                  selectedMethod === CUSTOM_METHOD_VALUE
                    ? customMethodText.trim() || undefined
                    : selectedMethod || undefined,
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
                owned: false,
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
