import { useEffect, useState } from 'react';
import { DIFFICULTY_LABEL } from '../../lib/recipeDifficulty';
import { useStoredImage } from '../../data/imageStore';
import { fetchLikeInfo, toggleLike, type LikeInfo } from '../../data/recipeLikes';
import { createRecipeLikedNotification, deleteRecipeLikedNotification } from '../../data/notifications';
import { useSession } from '../../data/session';
import { getErrorMessage } from '../../lib/errorMessage';
import { formatPublicRecipeOwnerLabel, type PublicRecipeEntry } from '../../data/publicRecipes';

/** 다른 household의 공개 레시피 상세 — 조회 전용(재료/조리순서/난이도/작성자 표시) + 좋아요.
 * "내 레시피로 복사하기" 버튼과 실제 복사 로직은 onCopy prop으로 상위(RecipesFeature)에서 주입한다. */
export function PublicRecipeDetailPage({
  entry,
  ingredientNameById,
  onBack,
  onCopy,
  copying,
}: {
  entry: PublicRecipeEntry;
  ingredientNameById: Map<string, string>;
  onBack: () => void;
  onCopy?: () => void;
  copying?: boolean;
}) {
  const { recipe, tagNames, alreadyCopied } = entry;
  const coverImageId = recipe.finalImageId ?? recipe.steps.find((step) => step.imageId)?.imageId;
  const coverImageUrl = useStoredImage(coverImageId);
  const { user } = useSession();
  const [likeInfo, setLikeInfo] = useState<LikeInfo>({ likeCount: 0, likedByMe: false });
  const [likeBusy, setLikeBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchLikeInfo([recipe.id], user.id)
      .then((result) => {
        if (!cancelled) setLikeInfo(result.get(recipe.id) ?? { likeCount: 0, likedByMe: false });
      })
      .catch((err) => console.error('좋아요 정보 조회 실패:', getErrorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [recipe.id, user?.id]);

  async function handleToggleLike() {
    if (!user || likeBusy) return;
    setLikeBusy(true);
    const wasLiked = likeInfo.likedByMe;
    // 낙관적 업데이트 — 실패하면 아래 catch에서 되돌림
    setLikeInfo((prev) => ({
      likeCount: prev.likeCount + (wasLiked ? -1 : 1),
      likedByMe: !wasLiked,
    }));
    try {
      await toggleLike(recipe.id, user.id, wasLiked);
      // 알림 생성/삭제 실패는 좋아요 자체를 막을 정도는 아니라 별도로 감싸서 조용히 로그만 남김
      try {
        if (wasLiked) await deleteRecipeLikedNotification(recipe.id);
        else await createRecipeLikedNotification(recipe.id);
      } catch (notifyErr) {
        console.error('좋아요 알림 처리 실패:', getErrorMessage(notifyErr));
      }
    } catch (err) {
      console.error('좋아요 처리 실패:', getErrorMessage(err));
      setLikeInfo((prev) => ({ likeCount: prev.likeCount + (wasLiked ? 1 : -1), likedByMe: wasLiked }));
    } finally {
      setLikeBusy(false);
    }
  }

  return (
    <div>
      <div className="row">
        <button className="btn small" onClick={onBack}>
          ← 둘러보기
        </button>
        <button className={`btn small ${likeInfo.likedByMe ? 'primary' : ''}`} onClick={handleToggleLike} disabled={likeBusy}>
          {likeInfo.likedByMe ? '❤️' : '🤍'} {likeInfo.likeCount}
        </button>
      </div>

      <h1 style={{ marginTop: 12 }}>{recipe.name}</h1>
      <p
        className="text-muted"
        style={{ marginTop: -8, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}
      >
        {entry.authorAvatarUrl && (
          <img
            src={entry.authorAvatarUrl}
            alt=""
            style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }}
          />
        )}
        {formatPublicRecipeOwnerLabel(entry)}
      </p>
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

      {onCopy && (
        <button className="btn primary" style={{ width: '100%', marginBottom: 8 }} onClick={onCopy} disabled={copying}>
          {copying ? '복사하는 중...' : alreadyCopied ? '📋 다시 복사하기' : '📋 내 레시피로 복사하기'}
        </button>
      )}

      <div className="chip-row">
        {recipe.difficulty && <span className="chip">{DIFFICULTY_LABEL[recipe.difficulty]}</span>}
        {recipe.estimatedMinutes != null && recipe.estimatedMinutes > 0 && (
          <span className="chip">약 {recipe.estimatedMinutes}분</span>
        )}
        {tagNames.map((name) => (
          <span className="chip" key={name}>
            {name}
          </span>
        ))}
      </div>

      <div className="section-title">재료 ({recipe.servingsBase}인분 기준)</div>
      <div className="card">
        {recipe.ingredients.map((item, index) => (
          <div className="row" key={index} style={{ marginBottom: 6 }}>
            <span>{ingredientNameById.get(item.ingredientId) ?? '(알 수 없음)'}</span>
            <span className="text-muted">
              {item.amount} {item.unit}
            </span>
          </div>
        ))}
      </div>

      <div className="section-title">조리 순서</div>
      {recipe.steps.map((step, index) => (
        <PublicStepCard key={index} index={index + 1} step={step} />
      ))}
    </div>
  );
}

function PublicStepCard({
  index,
  step,
}: {
  index: number;
  step: { title: string; content: string; timerSeconds?: number; imageId?: string };
}) {
  const imageUrl = useStoredImage(step.imageId);
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
          <span className="text-muted">
            {Math.floor(step.timerSeconds / 60)}분 {step.timerSeconds % 60}초
          </span>
        )}
      </div>
      <p style={{ marginTop: 6 }}>{step.content}</p>
    </div>
  );
}
