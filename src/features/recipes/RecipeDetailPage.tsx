import { useEffect, useState } from 'react';
import { useIngredients, useIngredientsById, useRecipes, useTags, getCurrentHouseholdId } from '../../data/store';
import { useShoppingSelection } from '../../data/shoppingSelection';
import { computeRecipeAllergens, scaleAmount } from '../../data/computed';
import { useStoredImage } from '../../data/imageStore';
import { DIFFICULTY_LABEL } from '../../lib/recipeDifficulty';
import { fetchLikeInfo } from '../../data/recipeLikes';
import {
  fetchCookingStats,
  fetchStepTimingAdjustments,
  logCooking,
  type CookingStats,
  type StepAdjustmentSuggestion,
} from '../../data/cookingLog';
import { useSession } from '../../data/session';
import { CookingLogModal } from './CookingLogModal';
import { CookingModePage } from './CookingModePage';
import { TimingAdjustmentModal } from './TimingAdjustmentModal';
import type { CookingLogStepTiming } from '../../data/types';

export function RecipeDetailPage({
  recipeId,
  onBack,
  onEdit,
}: {
  recipeId: string;
  onBack: () => void;
  onEdit: () => void;
}) {
  const { recipes, deleteRecipe, saveRecipe } = useRecipes();
  const { tags } = useTags();
  const ingredientsById = useIngredientsById();
  const { saveIngredient } = useIngredients();
  const { isSelected, toggle } = useShoppingSelection();
  const { user } = useSession();
  const householdId = getCurrentHouseholdId();
  const recipe = recipes.find((r) => r.id === recipeId);
  const [servings, setServings] = useState(recipe?.servingsBase ?? 1);
  const [showDifficultyReason, setShowDifficultyReason] = useState(false);
  const [likeCount, setLikeCount] = useState<number | null>(null);
  const [cookingStats, setCookingStats] = useState<CookingStats | null>(null);
  const [showCookingLogModal, setShowCookingLogModal] = useState(false);
  const [showCookingMode, setShowCookingMode] = useState(false);
  // 요리 모드를 거쳐 왔을 때만 채워짐(직접 "오늘 만들었어요"를 누르면 undefined) — 로그를 남길 때
  // 같이 저장해서 나중에 조정 제안(fetchStepTimingAdjustments) 계산에 쓰인다.
  const [pendingStepTimings, setPendingStepTimings] = useState<CookingLogStepTiming[] | undefined>(undefined);
  const [timingSuggestions, setTimingSuggestions] = useState<StepAdjustmentSuggestion[]>([]);
  const [showTimingAdjustment, setShowTimingAdjustment] = useState(false);
  // 대표 이미지 우선순위: 완성 사진 > 첫 조리 단계 이미지. recipe가 사라지는 경우(삭제 등)에도
  // 훅 호출 순서가 매 렌더 동일해야 해서 이 useStoredImage는 아래 조기 return보다 위에 둔다.
  const coverImageId = recipe?.finalImageId ?? recipe?.steps.find((step) => step.imageId)?.imageId;
  const coverImageUrl = useStoredImage(coverImageId);

  useEffect(() => {
    if (recipe) setServings(recipe.servingsBase);
  }, [recipe?.id]);

  // 공개된 내 레시피는 다른 사람이 얼마나 좋아했는지(좋아요 수) 조회 전용으로 보여준다 —
  // 내 레시피에 내가 좋아요를 누르는 건 의미가 없어서 토글 버튼은 안 두고 숫자만 표시.
  useEffect(() => {
    if (recipe?.visibility !== 'public' || !user) {
      setLikeCount(null);
      return;
    }
    let cancelled = false;
    fetchLikeInfo([recipe.id], user.id)
      .then((result) => {
        if (!cancelled) setLikeCount(result.get(recipe.id)?.likeCount ?? 0);
      })
      .catch((err) => console.error('좋아요 정보 조회 실패:', err));
    return () => {
      cancelled = true;
    };
  }, [recipe?.id, recipe?.visibility, user?.id]);

  // "이 레시피를 n번 만들었어요" 요약용 — 요리 기록 조회 화면은 따로 없이 이 최소한의 요약만 노출
  useEffect(() => {
    if (!recipe) {
      setCookingStats(null);
      return;
    }
    let cancelled = false;
    fetchCookingStats([recipe.id])
      .then((result) => {
        if (!cancelled) setCookingStats(result.get(recipe.id) ?? null);
      })
      .catch((err) => console.error('요리 기록 조회 실패:', err));
    return () => {
      cancelled = true;
    };
  }, [recipe?.id]);

  // "⏱ 조정 제안" 배지용 — 완료 화면에서 놓쳤거나 예전 기록으로 뒤늦게 조건을 만족한 경우를 위한
  // 보조 진입점. 완료 화면에서 이미 다뤘어도(적용/건너뛰기) 다시 불러오면 자연스럽게 없어지거나
  // (적용한 경우) 그대로 남아있을 수 있음(건너뛴 경우) — 둘 다 의도된 동작.
  useEffect(() => {
    if (!recipe) {
      setTimingSuggestions([]);
      return;
    }
    let cancelled = false;
    fetchStepTimingAdjustments(recipe)
      .then((result) => {
        if (!cancelled) setTimingSuggestions(result);
      })
      .catch((err) => console.error('시간 조정 제안 조회 실패:', err));
    return () => {
      cancelled = true;
    };
  }, [recipe?.id]);

  async function handleConfirmCooking(selectedIngredientIds: string[], memo: string) {
    if (!recipe || !user || !householdId) {
      throw new Error('로그인이 필요합니다.');
    }
    await logCooking({
      recipeId: recipe.id,
      householdId,
      userId: user.id,
      memo,
      stepTimings: pendingStepTimings,
    });
    // 체크된 재료만 보유 해제 — 이미 owned=false인 재료는 건드리지 않음
    for (const ingredientId of selectedIngredientIds) {
      const ingredient = ingredientsById.get(ingredientId);
      if (ingredient?.owned) {
        await saveIngredient({ ...ingredient, owned: false });
      }
    }
    const stats = await fetchCookingStats([recipe.id]);
    setCookingStats(stats.get(recipe.id) ?? null);
    // 모달은 곧바로 닫지 않고 "완료" 화면(사진 업로드 등)으로 스스로 전환됨 — 여기서는 닫지 않는다.

    // 요리 모드를 거쳐 실제 시간을 측정한 경우, 조정 제안이 있으면 계산해서 메인 화면의
    // "⏱ 조정 제안 있음" 칩으로 노출한다(완료 화면과 모달을 이중으로 띄우지 않기 위해 자동으로
    // 열지는 않음 — 완료 화면을 닫은 뒤 칩을 눌러 확인).
    if (pendingStepTimings && pendingStepTimings.length > 0) {
      const suggestions = await fetchStepTimingAdjustments(recipe);
      setTimingSuggestions(suggestions);
    }
    setPendingStepTimings(undefined);
  }

  async function handleSetFinalImageFromCookingLog(imageId: string) {
    if (!recipe) return;
    await saveRecipe({ ...recipe, finalImageId: imageId });
  }

  async function handleApplyTimingAdjustments(accepted: StepAdjustmentSuggestion[]) {
    if (!recipe || accepted.length === 0) {
      setShowTimingAdjustment(false);
      return;
    }
    const byStepIndex = new Map(accepted.map((s) => [s.stepIndex, s.suggestedSeconds]));
    await saveRecipe({
      ...recipe,
      steps: recipe.steps.map((step, index) =>
        byStepIndex.has(index) ? { ...step, timerSeconds: byStepIndex.get(index) } : step,
      ),
    });
    setShowTimingAdjustment(false);
    const remaining = await fetchStepTimingAdjustments(recipe);
    setTimingSuggestions(remaining);
  }

  if (!recipe) {
    return (
      <div>
        <button className="btn" onClick={onBack}>
          ← 목록으로
        </button>
        <div className="empty-hint">레시피를 찾을 수 없습니다.</div>
      </div>
    );
  }

  const recipeTags = tags.filter((tag) => recipe.tagIds.includes(tag.id));
  const recipeAllergens = computeRecipeAllergens(recipe, ingredientsById);

  return (
    <div>
      <div className="row">
        <button className="btn small" onClick={onBack}>
          ← 목록
        </button>
        <div className="chip-row" style={{ marginTop: 0 }}>
          <button className="btn small" onClick={onEdit}>
            수정
          </button>
          <button
            className="btn small danger"
            onClick={() => {
              if (confirm(`'${recipe.name}' 레시피를 삭제할까요?`)) {
                deleteRecipe(recipe.id);
                onBack();
              }
            }}
          >
            삭제
          </button>
        </div>
      </div>

      <h1 style={{ marginTop: 12 }}>{recipe.name}</h1>
      {recipe.authorName && (
        <p
          className="text-muted"
          style={{ marginTop: -8, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {recipe.authorAvatarUrl && (
            <img
              src={recipe.authorAvatarUrl}
              alt=""
              style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }}
            />
          )}
          {recipe.authorName}님의 레시피
        </p>
      )}
      {coverImageUrl && (
        <img
          src={coverImageUrl}
          alt={`${recipe.name} 완성 사진`}
          style={{
            width: '100%',
            aspectRatio: '4 / 3',
            objectFit: 'cover',
            borderRadius: 'var(--radius)',
            marginBottom: 10,
          }}
        />
      )}
      <button
        className={`btn ${isSelected(recipe.id) ? 'primary' : ''}`}
        style={{ width: '100%', marginBottom: 8 }}
        onClick={() => toggle(recipe.id)}
      >
        {isSelected(recipe.id) ? '🛒 장보기에 담김 (빼기)' : '🛒 장보기에 담기'}
      </button>
      <button
        className="btn primary"
        style={{ width: '100%', marginBottom: 8 }}
        onClick={() => {
          if (confirm('요리를 시작할까요?')) setShowCookingMode(true);
        }}
      >
        🍳 요리 시작하기
      </button>
      <button
        className="btn"
        style={{ width: '100%', marginBottom: 8 }}
        onClick={() => {
          setPendingStepTimings(undefined);
          setShowCookingLogModal(true);
        }}
      >
        🍳 오늘 만들었어요
      </button>
      {cookingStats && cookingStats.count > 0 && (
        <p className="text-muted" style={{ marginTop: -4, marginBottom: 8, fontSize: 13 }}>
          이 레시피를 {cookingStats.count}번 만들었어요
          {cookingStats.lastCookedAt &&
            ` · 마지막으로 만든 날짜: ${new Date(cookingStats.lastCookedAt).toLocaleDateString('ko-KR')}`}
        </p>
      )}
      {timingSuggestions.length > 0 && (
        <button
          className="chip selectable"
          style={{ marginBottom: 8 }}
          onClick={() => setShowTimingAdjustment(true)}
        >
          ⏱ 조정 제안 있음
        </button>
      )}
      <div className="chip-row">
        {likeCount != null && <span className="chip">❤️ {likeCount}</span>}
        {recipe.difficulty && <span className="chip">{DIFFICULTY_LABEL[recipe.difficulty]}</span>}
        {recipe.estimatedMinutes != null && recipe.estimatedMinutes > 0 && (
          <span className="chip">약 {recipe.estimatedMinutes}분</span>
        )}
        {recipe.difficultyReason && (
          <button
            className="chip selectable"
            title={recipe.difficultyReason}
            onClick={() => setShowDifficultyReason((v) => !v)}
          >
            ⓘ
          </button>
        )}
        {recipeTags.map((tag) => (
          <span className="chip" key={tag.id}>
            {tag.name}
          </span>
        ))}
        {recipeAllergens.map((allergen) => (
          <span className="chip allergen" key={allergen}>
            {allergen}
          </span>
        ))}
      </div>
      {showDifficultyReason && recipe.difficultyReason && (
        <p className="text-muted" style={{ marginTop: -6, marginBottom: 8 }}>
          {recipe.difficultyReason}
        </p>
      )}

      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="section-title" style={{ margin: 0 }}>
          재료 ({servings}인분 기준 재계산됨)
        </div>
        <div className="stepper">
          <button onClick={() => setServings((s) => Math.max(1, s - 1))}>−</button>
          <strong>{servings}인분</strong>
          <button onClick={() => setServings((s) => s + 1)}>+</button>
        </div>
      </div>
      <div className="card" style={{ marginTop: 10 }}>
        {recipe.ingredients.map((item, index) => {
          const ingredient = ingredientsById.get(item.ingredientId);
          const scaled = scaleAmount(item.amount, recipe.servingsBase, servings);
          return (
            <div className="row" key={index} style={{ marginBottom: 6 }}>
              <span>{ingredient?.name ?? '(삭제된 재료)'}</span>
              <span className="text-muted">
                {scaled} {item.unit}
              </span>
            </div>
          );
        })}
      </div>

      <div className="section-title">조리 순서</div>
      {recipe.steps.map((step, index) => (
        <StepCard key={index} index={index + 1} step={step} />
      ))}

      {showCookingLogModal && (
        <CookingLogModal
          recipe={recipe}
          ingredientsById={ingredientsById}
          householdId={householdId}
          onClose={() => setShowCookingLogModal(false)}
          onConfirm={handleConfirmCooking}
          onSetFinalImage={handleSetFinalImageFromCookingLog}
          onEditRecipe={() => {
            setShowCookingLogModal(false);
            onEdit();
          }}
        />
      )}
      {showCookingMode && (
        <CookingModePage
          recipe={recipe}
          onExit={() => setShowCookingMode(false)}
          onFinish={(stepTimings) => {
            setPendingStepTimings(stepTimings);
            setShowCookingMode(false);
            setShowCookingLogModal(true);
          }}
        />
      )}
      {showTimingAdjustment && (
        <TimingAdjustmentModal
          recipe={recipe}
          suggestions={timingSuggestions}
          onClose={() => setShowTimingAdjustment(false)}
          onApply={handleApplyTimingAdjustments}
        />
      )}
    </div>
  );
}

function StepCard({
  index,
  step,
}: {
  index: number;
  step: { title: string; content: string; timerSeconds?: number; imageId?: string };
}) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const imageUrl = useStoredImage(step.imageId);

  useEffect(() => {
    if (remaining === null) return;
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((r) => (r ?? 0) - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  return (
    <div className="card">
      {imageUrl && (
        <img
          src={imageUrl}
          alt={`${step.title} 이미지`}
          style={{
            width: '100%',
            aspectRatio: '4 / 3',
            objectFit: 'cover',
            borderRadius: 'var(--radius)',
            marginBottom: 10,
          }}
        />
      )}
      <div className="row">
        <strong>
          {index}. {step.title}
        </strong>
        {step.timerSeconds != null && (
          <button
            className="btn small"
            onClick={() => setRemaining(remaining === null ? step.timerSeconds! : null)}
          >
            {remaining === null ? `타이머 ${formatSeconds(step.timerSeconds)}` : formatSeconds(remaining)}
          </button>
        )}
      </div>
      <p style={{ marginTop: 6 }}>{step.content}</p>
    </div>
  );
}

function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
