import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useCategories, useIngredients, makeId } from '../../data/store';
import { useSettings } from '../../data/settings';
import { extractReceiptItems, ApiProxyError } from '../../lib/aiProxy';
import type { ReceiptItem } from '../../lib/geminiClient';
import { resizeImageForUpload } from '../../lib/imageResize';
import { getErrorMessage } from '../../lib/errorMessage';
import { setActiveTab } from '../../data/activeTab';
import type { Category } from '../../data/types';

const NEW_CATEGORY_PREFIX = '__new__:';

interface ReviewRow {
  key: string;
  rawText: string;
  guessedName: string;
  quantity: string;
  unit: string;
  categoryId: string;
  selected: boolean;
  uncertain: boolean;
}

function defaultCategoryId(categories: Category[], guessedCategoryName?: string | null): string {
  const name = guessedCategoryName?.trim();
  if (name) {
    const matched = categories.find((c) => c.name === name);
    return matched ? matched.id : `${NEW_CATEGORY_PREFIX}${name}`;
  }
  return categories.find((c) => c.name === '기타')?.id ?? categories[0]?.id ?? '';
}

function buildReviewRow(item: ReceiptItem, categories: Category[]): ReviewRow {
  const guessedName = item.guessedName?.trim() || item.rawText;
  return {
    key: crypto.randomUUID(),
    rawText: item.rawText,
    guessedName,
    quantity: item.quantity != null ? String(item.quantity) : '',
    unit: item.unit?.trim() ?? '',
    categoryId: defaultCategoryId(categories, item.categoryName),
    selected: true,
    uncertain: Boolean(item.uncertain) || !item.guessedName?.trim(),
  };
}

/**
 * 영수증 사진 → 재료 업데이트. 인식은 서버(api/ai-receipt.ts, Gemini 비전)가 하지만, 실제로
 * 재료가 추가/보유표시되는 것은 사용자가 이 화면에서 체크박스로 선택하고 "적용하기"를 눌러야만
 * 일어난다(자동 저장 금지 — CookKit 전체 원칙).
 */
export function ReceiptScanModal({ onClose }: { onClose: () => void }) {
  const { ingredients, saveIngredient } = useIngredients();
  const { categories, saveCategory } = useCategories();
  const { settings } = useSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingApiKey, setMissingApiKey] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const categoryOptions = useMemo(() => {
    const base = categories.map((c) => ({ value: c.id, label: c.name }));
    if (!rows) return base;
    const newNames = new Set<string>();
    for (const row of rows) {
      if (row.categoryId.startsWith(NEW_CATEGORY_PREFIX)) newNames.add(row.categoryId.slice(NEW_CATEGORY_PREFIX.length));
    }
    const extra = Array.from(newNames).map((name) => ({ value: `${NEW_CATEGORY_PREFIX}${name}`, label: `${name} (새로 생성)` }));
    return [...base, ...extra];
  }, [categories, rows]);

  function updateRow(key: string, patch: Partial<ReviewRow>) {
    setRows((prev) => (prev ? prev.map((row) => (row.key === key ? { ...row, ...patch } : row)) : prev));
  }

  function findExistingIngredient(guessedName: string) {
    const normalized = guessedName.trim().toLowerCase();
    if (!normalized) return undefined;
    return ingredients.find((i) => i.name.trim().toLowerCase() === normalized);
  }

  async function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setMissingApiKey(false);
    setApplyError(null);
    setRows(null);
    setLoading(true);
    try {
      const { base64, mimeType, dataUrl } = await resizeImageForUpload(file);
      setPreviewUrl(dataUrl);
      const items = await extractReceiptItems(settings.geminiModel, base64, mimeType);
      if (items.length === 0) {
        setError('인식된 항목이 없어요. 다시 시도하거나 재료 화면에서 직접 추가해주세요.');
        return;
      }
      setRows(items.map((item) => buildReviewRow(item, categories)));
    } catch (err) {
      if (err instanceof ApiProxyError && err.code === 'no_api_key') setMissingApiKey(true);
      setError(getErrorMessage(err, '영수증 인식에 실패했습니다.'));
    } finally {
      setLoading(false);
    }
  }

  function retake() {
    setRows(null);
    setPreviewUrl(null);
    setError(null);
    setApplyError(null);
  }

  async function handleApply() {
    if (!rows) return;
    const selectedRows = rows.filter((row) => row.selected && row.guessedName.trim());
    if (selectedRows.length === 0) return;

    setApplying(true);
    setApplyError(null);
    try {
      // 새 카테고리/재료를 한 응답 안에서 여러 개 만들 수 있어서, 동시(Promise.all) 대신 순차
      // 처리 + 배치 내 캐시로 만든다 — AI 반영 로직(createIngredientFromAi)에서 겪었던 "같은
      // 이름 카테고리가 두 번 생성되는" 레이스 컨디션과 같은 종류의 버그를 막기 위함
      // (CLAUDE.md "버그(수정 완료) — 카테고리 중복 생성 레이스 컨디션" 참고).
      const newCategoryCache = new Map<string, string>();
      let addedCount = 0;
      let markedOwnedCount = 0;

      for (const row of selectedRows) {
        const name = row.guessedName.trim();
        const existing = findExistingIngredient(name);
        if (existing) {
          if (!existing.owned) await saveIngredient({ ...existing, owned: true });
          markedOwnedCount += 1;
          continue;
        }

        let categoryId = row.categoryId;
        if (categoryId.startsWith(NEW_CATEGORY_PREFIX)) {
          const newName = categoryId.slice(NEW_CATEGORY_PREFIX.length);
          const cached = newCategoryCache.get(newName);
          if (cached) {
            categoryId = cached;
          } else {
            const existingCategory = categories.find((c) => c.name === newName);
            if (existingCategory) {
              categoryId = existingCategory.id;
            } else {
              const id = makeId();
              await saveCategory({ id, name: newName });
              newCategoryCache.set(newName, id);
              categoryId = id;
            }
          }
        }

        const quantity = Number(row.quantity);
        const unit = row.unit.trim();
        const buyAmount = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
        await saveIngredient({
          id: makeId(),
          name,
          categoryId,
          defaultBuyUnit: unit ? `${buyAmount}${unit}` : '1개',
          allergens: [],
          owned: true,
        });
        addedCount += 1;
      }

      alert(`${markedOwnedCount + addedCount}개 반영했어요. (기존 재료 보유 표시 ${markedOwnedCount}개, 새로 추가 ${addedCount}개)`);
      onClose();
    } catch (err) {
      setApplyError(getErrorMessage(err, '반영 중 오류가 발생했습니다.'));
    } finally {
      setApplying(false);
    }
  }

  const uncertainRows = rows?.filter((row) => row.uncertain) ?? [];
  const normalRows = rows?.filter((row) => !row.uncertain) ?? [];
  const selectedCount = rows?.filter((row) => row.selected).length ?? 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 style={{ margin: 0 }}>📷 영수증으로 재료 업데이트</h2>
          <button className="btn small" onClick={onClose}>
            닫기
          </button>
        </div>

        {!rows && (
          <>
            <p className="text-muted" style={{ marginTop: 8 }}>
              영수증 사진을 찍거나 갤러리에서 선택하면 식료품 품목을 자동으로 인식해요. 인식 결과는 확인 후
              선택한 항목만 반영돼요.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={handleFileSelected}
            />
            <button
              className="btn primary"
              style={{ width: '100%', marginTop: 8 }}
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
            >
              {loading ? '인식하는 중...' : '📷 사진 선택하기'}
            </button>
            {previewUrl && (
              <img
                src={previewUrl}
                alt="영수증 미리보기"
                style={{ width: '100%', marginTop: 10, borderRadius: 'var(--radius)' }}
              />
            )}
            {error && (
              <div style={{ marginTop: 10 }}>
                <p style={{ color: 'var(--danger)' }}>{error}</p>
                {missingApiKey && (
                  <button className="btn small" onClick={() => setActiveTab('settings')}>
                    설정으로 이동
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {rows && (
          <>
            {uncertainRows.length > 0 && (
              <>
                <div className="section-title">⚠️ 확인이 필요해요 ({uncertainRows.length})</div>
                {uncertainRows.map((row) => (
                  <ReceiptRow
                    key={row.key}
                    row={row}
                    existingId={findExistingIngredient(row.guessedName)?.id}
                    categoryOptions={categoryOptions}
                    onChange={(patch) => updateRow(row.key, patch)}
                  />
                ))}
              </>
            )}
            <div className="section-title">인식된 품목 ({normalRows.length})</div>
            {normalRows.map((row) => (
              <ReceiptRow
                key={row.key}
                row={row}
                existingId={findExistingIngredient(row.guessedName)?.id}
                categoryOptions={categoryOptions}
                onChange={(patch) => updateRow(row.key, patch)}
              />
            ))}

            {applyError && <p style={{ color: 'var(--danger)', marginTop: 8 }}>{applyError}</p>}

            <div className="row" style={{ gap: 6, marginTop: 16 }}>
              <button className="btn small" onClick={retake} disabled={applying}>
                다시 찍기
              </button>
              <button className="btn small primary" onClick={handleApply} disabled={applying || selectedCount === 0}>
                {applying ? '반영 중...' : `적용하기 (${selectedCount}개)`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ReceiptRow({
  row,
  existingId,
  categoryOptions,
  onChange,
}: {
  row: ReviewRow;
  existingId?: string;
  categoryOptions: { value: string; label: string }[];
  onChange: (patch: Partial<ReviewRow>) => void;
}) {
  return (
    <div className="card" style={{ marginBottom: 8 }}>
      <label className="row" style={{ alignItems: 'flex-start', gap: 8 }}>
        <input
          type="checkbox"
          checked={row.selected}
          onChange={(e) => onChange({ selected: e.target.checked })}
          style={{ marginTop: 4 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="text-muted" style={{ fontSize: 11 }}>
            {row.rawText}
          </div>
          <input value={row.guessedName} onChange={(e) => onChange({ guessedName: e.target.value })} />
        </div>
        <span className={`chip ${existingId ? '' : 'selectable active'}`}>{existingId ? '이미 있음' : '새로 추가됨'}</span>
      </label>
      <div className="row" style={{ marginTop: 8, gap: 6 }}>
        <input
          type="number"
          value={row.quantity}
          onChange={(e) => onChange({ quantity: e.target.value })}
          placeholder="수량"
          style={{ width: 70 }}
        />
        <input
          value={row.unit}
          onChange={(e) => onChange({ unit: e.target.value })}
          placeholder="단위"
          style={{ width: 70 }}
        />
        {!existingId && (
          <select value={row.categoryId} onChange={(e) => onChange({ categoryId: e.target.value })} style={{ flex: 1 }}>
            {categoryOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
