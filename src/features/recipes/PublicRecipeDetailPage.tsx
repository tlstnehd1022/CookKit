import { DIFFICULTY_LABEL } from '../../lib/recipeDifficulty';
import { useStoredImage } from '../../data/imageStore';
import type { PublicRecipeEntry } from '../../data/publicRecipes';

/** 다른 household의 공개 레시피 상세 — 조회 전용(재료/조리순서/난이도/작성자 표시). "내 레시피로
 * 복사하기" 버튼과 실제 복사 로직은 onCopy prop으로 상위(RecipesFeature)에서 주입한다. */
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
  const { recipe, tagNames, authorName, alreadyCopied } = entry;
  const coverImageId = recipe.finalImageId ?? recipe.steps.find((step) => step.imageId)?.imageId;
  const coverImageUrl = useStoredImage(coverImageId);

  return (
    <div>
      <div className="row">
        <button className="btn small" onClick={onBack}>
          ← 둘러보기
        </button>
      </div>

      <h1 style={{ marginTop: 12 }}>{recipe.name}</h1>
      <p className="text-muted" style={{ marginTop: -8, marginBottom: 8 }}>{authorName}님의 레시피</p>
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
