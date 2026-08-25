import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { Recipe } from '../../data/types';
import { useIngredients, useIngredientsById, useRecipes, useTags } from '../../data/store';
import { useSession } from '../../data/session';
import { logCooking, setCookingLogImage } from '../../data/cookingLog';
import { getErrorMessage } from '../../lib/errorMessage';
import { buildImagePath, saveImage, useStoredImage } from '../../data/imageStore';
import { resizeImageForUpload } from '../../lib/imageResize';
import { resolveRecipeTagNames, RecipeListItem } from './RecipesPage';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Step = 'recipe' | 'date' | 'photo' | 'ingredients';

/**
 * "요리 기록" 화면의 "+ 기록 추가" — 레시피 상세를 거치지 않고 과거에 만든 요리도 직접 기록할
 * 수 있게 하는 보완 경로("오늘 만들었어요" 흐름은 그대로 유지). 인분 조절 UI는 없어(복합 요리
 * 흐름과 같은 이유로) 레시피 원본 기준(servingsBase)으로 기록한다. 사진/재료 정리 둘 다 선택
 * 사항이라 기본값을 강요하지 않는다 — 과거 기록은 지금 재료 상태와 무관할 수 있어 재료 체크는
 * 기본 전부 해제한 채로 시작한다("오늘 만들었어요"의 기본 전체 선택과는 반대).
 */
export function AddCookingLogModal({
  householdId,
  onClose,
  onSaved,
}: {
  householdId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useSession();
  const { recipes, saveRecipe } = useRecipes();
  const { tags } = useTags();
  const { saveIngredient } = useIngredients();
  const ingredientsById = useIngredientsById();

  const [step, setStep] = useState<Step>('recipe');
  const [query, setQuery] = useState('');
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [date, setDate] = useState(todayStr());
  const [cookingLogId, setCookingLogId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [uploadedImageId, setUploadedImageId] = useState<string | null>(null);
  const [setAsFinalImage, setSetAsFinalImage] = useState(true);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [applyingFinalImage, setApplyingFinalImage] = useState(false);
  const uploadedImageUrl = useStoredImage(uploadedImageId ?? undefined);
  const currentFinalImageUrl = useStoredImage(selectedRecipe?.finalImageId);

  const uniqueIngredientIds = useMemo(
    () => (selectedRecipe ? Array.from(new Set(selectedRecipe.ingredients.map((item) => item.ingredientId))) : []),
    [selectedRecipe],
  );
  // "오늘 만들었어요"와 달리 기본 전부 해제 — 과거 기록이라 지금 재료 상태와 무관할 수 있어
  // 사용자가 실제로 체크한 것만 차감한다(CLAUDE.md 요구사항).
  const [selectedIngredientIds, setSelectedIngredientIds] = useState<Set<string>>(new Set());

  const filtered = query.trim()
    ? recipes.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()))
    : recipes;

  function pickRecipe(recipe: Recipe) {
    setSelectedRecipe(recipe);
    setStep('date');
  }

  async function handleSaveLog() {
    if (!user || !selectedRecipe) return;
    setSaving(true);
    setError(null);
    try {
      const { id } = await logCooking({
        recipeId: selectedRecipe.id,
        householdId,
        userId: user.id,
        servings: selectedRecipe.servingsBase,
        // 날짜만 고르므로 자정 경계에서 타임존 때문에 하루가 밀리지 않도록 정오로 고정.
        cookedAt: new Date(`${date}T12:00:00`).toISOString(),
      });
      setCookingLogId(id);
      setStep('photo');
    } catch (err) {
      setError(getErrorMessage(err, '기록 저장에 실패했습니다.'));
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoUpload(file: File) {
    if (!cookingLogId || !selectedRecipe) return;
    setPhotoUploading(true);
    setPhotoError(null);
    try {
      const { dataUrl } = await resizeImageForUpload(file);
      const imageId = buildImagePath(householdId, selectedRecipe.id, 'log');
      await saveImage(imageId, dataUrl);
      await setCookingLogImage(cookingLogId, imageId);
      setUploadedImageId(imageId);
    } catch (err) {
      setPhotoError(getErrorMessage(err, '사진 업로드에 실패했습니다.'));
    } finally {
      setPhotoUploading(false);
    }
  }

  async function applyFinalImageIfNeeded(): Promise<boolean> {
    if (!uploadedImageId || !setAsFinalImage || !selectedRecipe) return true;
    setApplyingFinalImage(true);
    try {
      await saveRecipe({ ...selectedRecipe, finalImageId: uploadedImageId });
      return true;
    } catch (err) {
      setPhotoError(getErrorMessage(err, '대표 이미지 설정에 실패했습니다.'));
      return false;
    } finally {
      setApplyingFinalImage(false);
    }
  }

  async function goToIngredientsStep() {
    if (!(await applyFinalImageIfNeeded())) return;
    setStep('ingredients');
  }

  async function handleFinish() {
    if (!selectedRecipe) return;
    setSaving(true);
    setError(null);
    try {
      for (const ingredientId of selectedIngredientIds) {
        const ingredient = ingredientsById.get(ingredientId);
        if (ingredient?.owned) {
          await saveIngredient({ ...ingredient, owned: false });
        }
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, '저장 중 오류가 발생했습니다.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        {step === 'recipe' && (
          <>
            <h2>+ 기록 추가</h2>
            <p className="text-muted">어떤 레시피를 만들었나요?</p>
            <div className="row pill-input-row">
              <Search size={16} strokeWidth={2.75} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="레시피 이름 검색" />
            </div>
            {filtered.length === 0 && <p className="empty-hint">레시피가 없어요.</p>}
            <div style={{ marginTop: 8 }}>
              {filtered.map((recipe) => (
                <RecipeListItem
                  key={recipe.id}
                  recipe={recipe}
                  tagNames={resolveRecipeTagNames(recipe, tags)}
                  onClick={() => pickRecipe(recipe)}
                />
              ))}
            </div>
            <button className="btn" style={{ marginTop: 12, width: '100%' }} onClick={onClose}>
              취소
            </button>
          </>
        )}

        {step === 'date' && selectedRecipe && (
          <>
            <h2>언제 만들었나요?</h2>
            <p className="text-muted">{selectedRecipe.name}</p>
            <div className="field">
              <label>날짜</label>
              <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />
            </div>
            {error && <p style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</p>}
            <div className="row" style={{ gap: 6, marginTop: 16 }}>
              <button className="btn" onClick={() => setStep('recipe')} disabled={saving}>
                ← 뒤로
              </button>
              <button className="btn primary" onClick={handleSaveLog} disabled={saving}>
                {saving ? '저장하는 중...' : '다음'}
              </button>
            </div>
          </>
        )}

        {step === 'photo' && selectedRecipe && (
          <>
            <h2>만든 모습을 사진으로 남겨볼까요?</h2>
            <p className="text-muted">(선택 사항)</p>

            {uploadedImageUrl ? (
              <img
                src={uploadedImageUrl}
                alt="만든 요리"
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
                {photoUploading ? '업로드 중...' : '📷 사진 올리기'}
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
              <>
                <label className="row" style={{ marginTop: 8 }}>
                  <span>이 사진을 레시피 대표 이미지로 설정</span>
                  <input
                    type="checkbox"
                    checked={setAsFinalImage}
                    onChange={(e) => setSetAsFinalImage(e.target.checked)}
                  />
                </label>
                {currentFinalImageUrl && (
                  <div className="row" style={{ marginTop: 4, gap: 8, alignItems: 'center' }}>
                    <span className="text-muted" style={{ fontSize: 12 }}>
                      지금 대표 사진
                    </span>
                    <img
                      src={currentFinalImageUrl}
                      alt="지금 대표 사진"
                      style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 'var(--radius-sm)' }}
                    />
                  </div>
                )}
                <p className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                  아니어도 "우리집에서 만든 모습" 갤러리에는 남아요.
                </p>
              </>
            )}

            <div className="row" style={{ gap: 6, marginTop: 16 }}>
              <button className="btn" onClick={goToIngredientsStep} disabled={applyingFinalImage || photoUploading}>
                건너뛰기
              </button>
              <button
                className="btn primary"
                onClick={goToIngredientsStep}
                disabled={applyingFinalImage || photoUploading}
              >
                {applyingFinalImage ? '저장 중...' : '다음'}
              </button>
            </div>
          </>
        )}

        {step === 'ingredients' && selectedRecipe && (
          <>
            <h2>재료 정리</h2>
            <p className="text-muted">이 재료들 다 썼어요? 쓴 재료만 체크해주세요. (선택 사항)</p>

            {uniqueIngredientIds.length === 0 && (
              <div className="empty-hint">이 레시피에 등록된 재료가 없어요.</div>
            )}
            {uniqueIngredientIds.map((id) => {
              const ingredient = ingredientsById.get(id);
              const item = selectedRecipe.ingredients.find((i) => i.ingredientId === id);
              return (
                <label className="row" key={id} style={{ padding: '6px 0' }}>
                  <span>
                    {ingredient?.name ?? '(삭제된 재료)'}
                    {item && (
                      <span className="text-muted" style={{ marginLeft: 6 }}>
                        {item.amount}
                        {item.unit}
                      </span>
                    )}
                  </span>
                  <input
                    type="checkbox"
                    checked={selectedIngredientIds.has(id)}
                    onChange={() =>
                      setSelectedIngredientIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      })
                    }
                  />
                </label>
              );
            })}

            {error && <p style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</p>}

            <div className="row" style={{ gap: 6, marginTop: 16 }}>
              <button className="btn" onClick={handleFinish} disabled={saving}>
                건너뛰고 완료
              </button>
              <button className="btn primary" onClick={handleFinish} disabled={saving}>
                {saving ? '저장하는 중...' : '완료'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
