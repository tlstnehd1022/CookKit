import { useEffect, useMemo, useState } from 'react';
import { useRecipes, useTags, useIngredients } from '../../data/store';
import { useSession } from '../../data/session';
import { useHousehold } from '../../data/household';
import { useProfile } from '../../data/profile';
import { fetchLikeInfo, type LikeInfo } from '../../data/recipeLikes';
import { getErrorMessage } from '../../lib/errorMessage';
import { UserProfilePage, type PublicUserSummary } from './DiscoverRecipesPage';
import { resolveRecipeTagNames } from './RecipesPage';
import type { PublicRecipeEntry } from '../../data/publicRecipes';

/** 프로필 바텀시트 "👀 내 공개 프로필 보기"로 진입하는 화면 — 다른 사람이 "사용자" 탭에서
 * 나를 검색해 들어왔을 때 정확히 같은 화면(UserProfilePage)을, 새 쿼리 없이 이미 household
 * store에 로드된 내 데이터에서 직접 골라 재구성해서 보여준다(visibility='public'인 것만 —
 * household/private 레시피는 다른 사람에게 안 보이므로 여기서도 제외). tagTypeByName은
 * "보는 사람 기준" 원칙상 내 태그 목록 그대로 쓰면 되고(내가 곧 보는 사람이자 소유자), 좋아요
 * 수만 실제 조회가 필요해 그 부분만 useEffect로 가져온다. */
export function MyPublicProfilePage({ onSelectEntry, onBack }: { onSelectEntry: (entry: PublicRecipeEntry, ingredientNameById: Map<string, string>) => void; onBack: () => void }) {
  const { user } = useSession();
  const { household } = useHousehold();
  const { profile } = useProfile();
  const { recipes } = useRecipes();
  const { tags } = useTags();
  const { ingredients } = useIngredients();

  const [likeInfoById, setLikeInfoById] = useState<Map<string, LikeInfo>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const publicRecipes = useMemo(() => recipes.filter((r) => r.visibility === 'public'), [recipes]);

  useEffect(() => {
    if (!user || publicRecipes.length === 0) {
      setLikeInfoById(new Map());
      return;
    }
    let cancelled = false;
    fetchLikeInfo(
      publicRecipes.map((r) => r.id),
      user.id,
    )
      .then((result) => {
        if (!cancelled) setLikeInfoById(result);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, '좋아요 정보를 불러오지 못했습니다.'));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicRecipes.map((r) => r.id).join(','), user?.id]);

  const ingredientNameById = useMemo(() => new Map(ingredients.map((i) => [i.id, i.name])), [ingredients]);
  const tagTypeByName = useMemo(() => new Map(tags.map((tag) => [tag.name, tag.type])), [tags]);

  const entries = useMemo<PublicRecipeEntry[]>(
    () =>
      publicRecipes.map((recipe) => ({
        recipe,
        tagNames: resolveRecipeTagNames(recipe, tags),
        authorUserId: user?.id ?? '',
        authorName: profile?.displayName || '나',
        authorAvatarUrl: profile?.avatarUrl ?? undefined,
        authorHouseholdName: household?.name,
        alreadyCopied: false,
      })),
    [publicRecipes, tags, user?.id, profile?.displayName, profile?.avatarUrl, household?.name],
  );

  const totalLikes = useMemo(
    () => entries.reduce((sum, entry) => sum + (likeInfoById.get(entry.recipe.id)?.likeCount ?? 0), 0),
    [entries, likeInfoById],
  );

  const summary: PublicUserSummary = {
    userId: user?.id ?? '',
    name: profile?.displayName || '나',
    avatarUrl: profile?.avatarUrl ?? undefined,
    householdName: household?.name,
    recipeCount: entries.length,
    lastRecipeAt: 0,
    totalLikes,
  };

  if (entries.length === 0) {
    return (
      <div>
        <button type="button" className="btn small" style={{ marginBottom: 12 }} onClick={onBack}>
          ← 뒤로
        </button>
        <p className="text-muted" style={{ marginBottom: 12 }}>
          👀 다른 사람에게 이렇게 보여요 — 실제로 다른 사람이 "사용자" 탭에서 나를 찾아 들어오면
          보게 될 화면과 똑같아요.
        </p>
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        <div className="empty-hint">
          아직 공개한 레시피가 없어요. 레시피 편집에서 공개 범위를 바꿀 수 있어요.
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="text-muted" style={{ marginBottom: 12 }}>
        👀 다른 사람에게 이렇게 보여요 — 실제로 다른 사람이 "사용자" 탭에서 나를 찾아 들어오면
        보게 될 화면과 똑같아요.
      </p>
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      <UserProfilePage
        user={summary}
        entries={entries}
        ingredientNameById={ingredientNameById}
        likeInfoById={likeInfoById}
        tagTypeByName={tagTypeByName}
        onSelectEntry={onSelectEntry}
        onBack={onBack}
      />
    </div>
  );
}
