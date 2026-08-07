import { useState } from 'react';
import { RecipesPage } from './RecipesPage';
import { RecipeDetailPage } from './RecipeDetailPage';
import { RecipeEditor } from './RecipeEditor';
import { TagManager } from './TagManager';
import { DiscoverRecipesPage } from './DiscoverRecipesPage';
import { PublicRecipeDetailPage } from './PublicRecipeDetailPage';
import { CookingHistoryPage } from './CookingHistoryPage';
import { MultiCookSelectPage } from './MultiCookSelectPage';
import { MultiCookPreviewPage } from './MultiCookPreviewPage';
import type { PublicRecipeEntry } from '../../data/publicRecipes';
import { useCategories, useIngredients, useRecipes, useTags, makeId, getCurrentHouseholdId } from '../../data/store';
import { useSession } from '../../data/session';
import { copyImage, isStorageImagePath } from '../../data/imageStore';
import { getErrorMessage } from '../../lib/errorMessage';
import type { Recipe, RecipeIngredient, RecipeStep } from '../../data/types';

type View =
  | { screen: 'list' }
  | { screen: 'detail'; recipeId: string }
  | { screen: 'edit'; recipeId?: string }
  | { screen: 'discover-detail'; entry: PublicRecipeEntry; ingredientNameById: Map<string, string> }
  | { screen: 'cooking-history' }
  | { screen: 'multi-cook-select' }
  | { screen: 'multi-cook-preview'; recipes: Recipe[] };

type ListMode = 'mine' | 'discover';

export function RecipesFeature() {
  const [view, setView] = useState<View>({ screen: 'list' });
  const [listMode, setListMode] = useState<ListMode>('mine');
  const [showTagManager, setShowTagManager] = useState(false);
  const [copying, setCopying] = useState(false);

  const { user } = useSession();
  const { ingredients, saveIngredient } = useIngredients();
  const { categories } = useCategories();
  const { tags, saveTag } = useTags();
  const { saveRecipe } = useRecipes();
  const householdId = getCurrentHouseholdId();

  /**
   * "내 레시피로 복사하기" — 재료/태그는 이름으로 매칭해서 있으면 재사용, 없으면 새로
   * 만든다(AI 반영 로직 createIngredientFromAi/resolveOrCreateTag와 같은 패턴 — 한 번에
   * 하나씩 순차 처리해서 같은 이름을 중복 생성하지 않도록 함). 이미지는 참조만 옮기지 않고
   * 실제로 다운로드해서 내 household 경로에 새로 저장한다(원본이 나중에 삭제/비공개로
   * 바뀌어도 복사본은 안전하게 유지되어야 하므로).
   */
  async function handleCopyPublicRecipe(entry: PublicRecipeEntry, ingredientNameById: Map<string, string>) {
    if (!user || !householdId) return;
    setCopying(true);
    try {
      const newRecipeId = makeId();

      const ingredientCache = new Map(ingredients.map((i) => [i.name.trim(), i.id]));
      const newRecipeIngredients: RecipeIngredient[] = [];
      for (const item of entry.recipe.ingredients) {
        const sourceName = ingredientNameById.get(item.ingredientId)?.trim();
        if (!sourceName) continue; // 이름을 못 찾은(권한 밖 등) 재료는 안전하게 건너뜀
        let ingredientId = ingredientCache.get(sourceName);
        if (!ingredientId) {
          const id = makeId();
          const categoryId = categories.find((c) => c.name === '기타')?.id ?? categories[0]?.id ?? '';
          await saveIngredient({
            id,
            name: sourceName,
            categoryId,
            defaultBuyUnit: '1개',
            allergens: [],
            owned: false,
          });
          ingredientId = id;
          ingredientCache.set(sourceName, id);
        }
        newRecipeIngredients.push({ ingredientId, amount: item.amount, unit: item.unit });
      }

      const tagCache = new Map(tags.map((t) => [t.name, t.id]));
      const newTagIds: string[] = [];
      for (const name of entry.tagNames) {
        let tagId = tagCache.get(name);
        if (!tagId) {
          const id = makeId();
          await saveTag({ id, name, type: 'style' });
          tagId = id;
          tagCache.set(name, id);
        }
        newTagIds.push(tagId);
      }

      const newSteps: RecipeStep[] = [];
      for (const step of entry.recipe.steps) {
        let newImageId: string | undefined;
        if (isStorageImagePath(step.imageId)) {
          newImageId = await copyImage(step.imageId, householdId, newRecipeId, 'step');
        }
        newSteps.push({ ...step, imageId: newImageId });
      }
      let newFinalImageId: string | undefined;
      if (isStorageImagePath(entry.recipe.finalImageId)) {
        newFinalImageId = await copyImage(entry.recipe.finalImageId, householdId, newRecipeId, 'final');
      }

      const newRecipe: Recipe = {
        id: newRecipeId,
        name: entry.recipe.name,
        servingsBase: entry.recipe.servingsBase,
        tagIds: newTagIds,
        ingredients: newRecipeIngredients,
        steps: newSteps,
        difficulty: entry.recipe.difficulty,
        difficultyReason: entry.recipe.difficultyReason,
        estimatedMinutes: entry.recipe.estimatedMinutes,
        finalImageId: newFinalImageId,
        sourceRecipeId: entry.recipe.id,
        visibility: 'household',
      };
      await saveRecipe(newRecipe);

      if (confirm('내 레시피로 추가됐어요, 편집 화면으로 이동할까요?')) {
        setView({ screen: 'edit', recipeId: newRecipeId });
      } else {
        setListMode('mine');
        setView({ screen: 'list' });
      }
    } catch (err) {
      console.error('레시피 복사 실패:', err);
      alert(getErrorMessage(err, '복사 중 오류가 발생했습니다.'));
    } finally {
      setCopying(false);
    }
  }

  return (
    <div>
      {view.screen === 'list' && (
        <div className="chip-row" style={{ marginBottom: 12 }}>
          <button
            className={`chip selectable ${listMode === 'mine' ? 'active' : ''}`}
            onClick={() => setListMode('mine')}
          >
            우리집 레시피
          </button>
          <button
            className={`chip selectable ${listMode === 'discover' ? 'active' : ''}`}
            onClick={() => setListMode('discover')}
          >
            🔎 둘러보기
          </button>
        </div>
      )}

      {view.screen === 'list' && listMode === 'mine' && (
        <RecipesPage
          onSelectRecipe={(id) => setView({ screen: 'detail', recipeId: id })}
          onAddRecipe={() => setView({ screen: 'edit' })}
          onManageTags={() => setShowTagManager(true)}
          onOpenCookingHistory={() => setView({ screen: 'cooking-history' })}
          onOpenMultiCook={() => setView({ screen: 'multi-cook-select' })}
        />
      )}
      {view.screen === 'list' && listMode === 'discover' && (
        <DiscoverRecipesPage
          onSelectEntry={(entry, ingredientNameById) =>
            setView({ screen: 'discover-detail', entry, ingredientNameById })
          }
        />
      )}
      {view.screen === 'detail' && (
        <RecipeDetailPage
          recipeId={view.recipeId}
          onBack={() => setView({ screen: 'list' })}
          onEdit={() => setView({ screen: 'edit', recipeId: view.recipeId })}
        />
      )}
      {view.screen === 'edit' && (
        <RecipeEditor
          recipeId={view.recipeId}
          onDone={() =>
            setView(view.recipeId ? { screen: 'detail', recipeId: view.recipeId } : { screen: 'list' })
          }
        />
      )}
      {view.screen === 'discover-detail' && (
        <PublicRecipeDetailPage
          entry={view.entry}
          ingredientNameById={view.ingredientNameById}
          onBack={() => setView({ screen: 'list' })}
          onCopy={() => handleCopyPublicRecipe(view.entry, view.ingredientNameById)}
          copying={copying}
        />
      )}
      {view.screen === 'cooking-history' && householdId && (
        <CookingHistoryPage householdId={householdId} onBack={() => setView({ screen: 'list' })} />
      )}
      {view.screen === 'multi-cook-select' && (
        <MultiCookSelectPage
          onCancel={() => setView({ screen: 'list' })}
          onConfirm={(selectedRecipes) => setView({ screen: 'multi-cook-preview', recipes: selectedRecipes })}
        />
      )}
      {view.screen === 'multi-cook-preview' && (
        <MultiCookPreviewPage
          recipes={view.recipes}
          onCancel={() => setView({ screen: 'list' })}
          onReselect={() => setView({ screen: 'multi-cook-select' })}
          onStart={() => {
            // B-5(진행 화면)는 다음 단계에서 연결 — 지금은 순서 미리보기까지만.
            alert('진행 화면(여러 타이머 동시 진행)은 다음 단계에서 연결할 예정이에요. 순서는 여기까지 확인할 수 있어요!');
          }}
        />
      )}
      {showTagManager && <TagManager onClose={() => setShowTagManager(false)} />}
    </div>
  );
}
