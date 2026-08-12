import { useMemo, useState } from 'react';
import type { Ingredient, Recipe } from '../../data/types';
import { getErrorMessage } from '../../lib/errorMessage';
import { buildImagePath, saveImage, useStoredImage } from '../../data/imageStore';

/**
 * "🍳 오늘 만들었어요" 확인 모달 — 이 레시피가 쓰는 재료를 체크박스로 보여주고(기본 전체 선택),
 * 사용자가 실제로 다 쓴 재료만 남긴 뒤 확정해야 재료 차감(owned=false)이 일어난다. 자동 차감
 * 없음 — 반영 자체는 onConfirm을 호출한 부모(RecipeDetailPage)가 담당한다.
 *
 * 확정 후에는 같은 모달 안에서 "완료" 화면(step='done')으로 전환해, 만든 사진을 올리고(선택)
 * 대표 이미지로 설정할지 고를 수 있게 한다 — 사진 반영 자체는 onSetFinalImage를 호출한
 * 부모가 담당(레시피 saveRecipe는 부모 소유 상태라 모달이 직접 건드리지 않음).
 */
export function CookingLogModal({
  recipe,
  ingredientsById,
  householdId,
  onClose,
  onConfirm,
  onSetFinalImage,
  onEditRecipe,
  onOpenPantryTidy,
}: {
  recipe: Recipe;
  ingredientsById: Map<string, Ingredient>;
  householdId: string | null;
  onClose: () => void;
  onConfirm: (selectedIngredientIds: string[], memo: string) => Promise<void>;
  onSetFinalImage: (imageId: string) => Promise<void>;
  onEditRecipe: () => void;
  /** D-1: 요리에 쓴 재료가 자동으로 "없어요"로 표시된 상태에서 냉장고 정리 모드로 이동 */
  onOpenPantryTidy: () => void;
}) {
  const uniqueIngredientIds = useMemo(
    () => Array.from(new Set(recipe.ingredients.map((item) => item.ingredientId))),
    [recipe.ingredients],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set(uniqueIngredientIds));
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'checklist' | 'done'>('checklist');

  const [uploadedImageId, setUploadedImageId] = useState<string | null>(null);
  const [setAsFinalImage, setSetAsFinalImage] = useState(true);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [applyingFinalImage, setApplyingFinalImage] = useState(false);
  const uploadedImageUrl = useStoredImage(uploadedImageId ?? undefined);

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
      setStep('done');
    } catch (err) {
      setError(getErrorMessage(err, '기록 중 오류가 발생했습니다.'));
    } finally {
      setSaving(false);
    }
  }

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error ?? new Error('파일을 읽지 못했습니다.'));
      reader.readAsDataURL(file);
    });
  }

  async function handlePhotoUpload(file: File) {
    if (!householdId) {
      setPhotoError('household 정보를 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.');
      return;
    }
    setPhotoUploading(true);
    setPhotoError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const imageId = buildImagePath(householdId, recipe.id, 'final');
      await saveImage(imageId, dataUrl);
      setUploadedImageId(imageId);
    } catch (err) {
      setPhotoError(getErrorMessage(err, '사진 업로드에 실패했습니다.'));
    } finally {
      setPhotoUploading(false);
    }
  }

  async function applyFinalImageIfNeeded(): Promise<boolean> {
    if (!uploadedImageId || !setAsFinalImage) return true;
    setApplyingFinalImage(true);
    try {
      await onSetFinalImage(uploadedImageId);
      return true;
    } catch (err) {
      setPhotoError(getErrorMessage(err, '대표 이미지 설정에 실패했습니다.'));
      return false;
    } finally {
      setApplyingFinalImage(false);
    }
  }

  async function handleClose() {
    if (!(await applyFinalImageIfNeeded())) return;
    onClose();
  }

  async function handleEditRecipe() {
    if (!(await applyFinalImageIfNeeded())) return;
    onEditRecipe();
  }

  async function handleOpenPantryTidy() {
    if (!(await applyFinalImageIfNeeded())) return;
    onOpenPantryTidy();
  }

  if (step === 'done') {
    return (
      <div className="modal-backdrop" onClick={handleClose}>
        <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
          <h2>🎉 요리 기록을 남겼어요!</h2>
          <p className="text-muted">오늘 만든 모습을 사진으로 남겨볼까요? (선택)</p>

          {uploadedImageUrl ? (
            <img
              src={uploadedImageUrl}
              alt="오늘 만든 요리"
              style={{
                width: '100%',
                aspectRatio: '4 / 3',
                objectFit: 'cover',
                borderRadius: 'var(--radius)',
                marginBottom: 8,
              }}
            />
          ) : (
            <label className="btn" style={{ cursor: 'pointer', display: 'block', textAlign: 'center' }}>
              {photoUploading ? '업로드 중...' : '📷 만든 사진 올리기'}
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                disabled={photoUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) handlePhotoUpload(file);
                }}
              />
            </label>
          )}
          {photoError && <p style={{ color: 'var(--danger)', marginTop: 8 }}>{photoError}</p>}

          {uploadedImageId && (
            <label className="row" style={{ marginTop: 8 }}>
              <span>이 사진을 레시피 대표 이미지로 설정</span>
              <input
                type="checkbox"
                checked={setAsFinalImage}
                onChange={(e) => setSetAsFinalImage(e.target.checked)}
              />
            </label>
          )}

          <div className="section-title" style={{ marginTop: 16 }}>냉장고 정리</div>
          <p className="text-muted" style={{ marginTop: -4 }}>
            요리에 쓴 재료는 자동으로 "없어요"로 표시됐어요. 확인만 하고 남은 재료만 되돌리면 돼요.
          </p>
          <div className="row" style={{ gap: 6, marginBottom: 4 }}>
            <button className="btn" onClick={handleClose} disabled={applyingFinalImage || photoUploading}>
              나중에
            </button>
            <button className="btn primary" onClick={handleOpenPantryTidy} disabled={applyingFinalImage || photoUploading}>
              🧹 정리하기
            </button>
          </div>

          <div className="row" style={{ gap: 6, marginTop: 16 }}>
            <button className="btn" onClick={handleEditRecipe} disabled={applyingFinalImage}>
              맛이 별로였어요 → 레시피 수정하기
            </button>
            <button className="btn primary" onClick={handleClose} disabled={applyingFinalImage || photoUploading}>
              {applyingFinalImage ? '저장 중...' : '닫기'}
            </button>
          </div>
        </div>
      </div>
    );
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
