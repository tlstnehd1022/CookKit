import { useEffect, useState } from 'react';
import { RecipesPage } from './RecipesPage';
import { RecipeDetailPage } from './RecipeDetailPage';
import { RecipeEditor } from './RecipeEditor';
import { TagManager } from './TagManager';
import { DiscoverRecipesPage } from './DiscoverRecipesPage';
import { PublicRecipeDetailPage } from './PublicRecipeDetailPage';
import { CookingHistoryPage } from './CookingHistoryPage';
import { MultiCookSelectPage } from './MultiCookSelectPage';
import { MultiCookPreviewPage } from './MultiCookPreviewPage';
import { MultiCookModePage } from './MultiCookModePage';
import { MultiCookLogModal } from './MultiCookLogModal';
import type { PublicRecipeEntry } from '../../data/publicRecipes';
import {
  useCategories,
  useIngredients,
  useIngredientsById,
  useRecipes,
  useTags,
  makeId,
  getCurrentHouseholdId,
} from '../../data/store';
import { useSession } from '../../data/session';
import { useHousehold } from '../../data/household';
import { useDiscoverTabRequested, clearDiscoverTabRequest } from '../../data/discoverTabRequest';
import { copyImage, isStorageImagePath } from '../../data/imageStore';
import { getErrorMessage } from '../../lib/errorMessage';
import { logCooking } from '../../data/cookingLog';
import type { OrderedStepRef } from '../../lib/multiCookOrdering';
import type { CookingLogStepTiming, Recipe, RecipeIngredient, RecipeStep } from '../../data/types';

type View =
  | { screen: 'list' }
  | { screen: 'detail'; recipeId: string; autoCook?: boolean; initialServings?: number }
  | { screen: 'edit'; recipeId?: string }
  | { screen: 'discover-detail'; entry: PublicRecipeEntry; ingredientNameById: Map<string, string> }
  | { screen: 'cooking-history' }
  | { screen: 'multi-cook-select' }
  | { screen: 'multi-cook-preview'; recipes: Recipe[] }
  | { screen: 'multi-cook-mode'; recipes: Recipe[]; order: OrderedStepRef[] };

type ListMode = 'mine' | 'discover';

export function RecipesFeature() {
  const [view, setView] = useState<View>({ screen: 'list' });
  const [listMode, setListMode] = useState<ListMode>('mine');
  const [showTagManager, setShowTagManager] = useState(false);
  const [copying, setCopying] = useState(false);
  // 복합 요리 완료 흐름 — MultiCookModePage를 벗어나 목록으로 돌아간 뒤에도 MultiCookLogModal이
  // 필요로 하는 정보라 view state와 별개로 들고 있는다(RecipeDetailPage의 pendingStepTimings와
  // 같은 이유).
  const [multiCookRecipes, setMultiCookRecipes] = useState<Recipe[]>([]);
  const [multiCookStepTimings, setMultiCookStepTimings] = useState<CookingLogStepTiming[]>([]);
  const [showMultiCookLogModal, setShowMultiCookLogModal] = useState(false);

  const { user } = useSession();
  const { household } = useHousehold();
  const { ingredients, saveIngredient } = useIngredients();
  const ingredientsById = useIngredientsById();
  const { categories } = useCategories();
  const { tags, saveTag } = useTags();
  const { saveRecipe } = useRecipes();
  const householdId = getCurrentHouseholdId();

  const discoverRequested = useDiscoverTabRequested();
  useEffect(() => {
    if (!discoverRequested) return;
    setListMode('discover');
    setView({ screen: 'list' });
    clearDiscoverTabRequest();
  }, [discoverRequested]);

  /**
   * 복합 요리 완료 확인 — 선택한 레시피 각각에 대해 별도로 CookingLog를 남긴다(하나로 합치지
   * 않음, isMultiRecipe:true). 재료 차감은 ingredientId 기준으로 한 번만(중복 재료 이중 차감
   * 방지 — MultiCookLogModal이 이미 병합해서 보여준 목록을 그대로 씀).
   */
  async function handleConfirmMultiCooking(selectedIngredientIds: string[], memo: string) {
    if (!user || !householdId) throw new Error('로그인이 필요합니다.');
    for (const recipe of multiCookRecipes) {
      const stepTimings = multiCookStepTimings.filter((t) => t.recipeId === recipe.id);
      await logCooking({
        recipeId: recipe.id,
        householdId,
        userId: user.id,
        // 복합 요리 흐름엔 아직 레시피별 인분 조절 UI가 없어 레시피 원본 기준(servingsBase)을
        // 그대로 기록한다 — B-6 이후 필요해지면 확장할 여지.
        servings: recipe.servingsBase,
        memo,
        stepTimings,
        isMultiRecipe: true,
      });
    }
    for (const ingredientId of selectedIngredientIds) {
      const ingredient = ingredientsById.get(ingredientId);
      if (ingredient?.owned) {
        await saveIngredient({ ...ingredient, owned: false });
      }
    }
    setShowMultiCookLogModal(false);
    setMultiCookRecipes([]);
    setMultiCookStepTimings([]);
  }

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
          autoStartCookingMode={view.autoCook}
          initialServings={view.initialServings}
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
          onConfirm={(selectedRecipes) => {
            // 하나만 골랐으면 복합 요리 준비 화면을 거칠 필요 없이 그 레시피의 요리 모드로 바로
            // 들어간다(레시피 상세의 "요리 시작하기"와 같은 경로 — autoStartCookingMode). 상세
            // 화면을 거치지 않는 진입이라 가구 기본 인원을 쓴다(B-5 우선순위 3번).
            if (selectedRecipes.length === 1) {
              setView({
                screen: 'detail',
                recipeId: selectedRecipes[0].id,
                autoCook: true,
                initialServings: household?.defaultServings ?? 2,
              });
            } else {
              setView({ screen: 'multi-cook-preview', recipes: selectedRecipes });
            }
          }}
        />
      )}
      {view.screen === 'multi-cook-preview' && (
        <MultiCookPreviewPage
          recipes={view.recipes}
          onCancel={() => setView({ screen: 'list' })}
          onReselect={() => setView({ screen: 'multi-cook-select' })}
          onStart={(order) => setView({ screen: 'multi-cook-mode', recipes: view.recipes, order })}
        />
      )}
      {view.screen === 'multi-cook-mode' && (
        <MultiCookModePage
          recipes={view.recipes}
          order={view.order}
          onExit={() => setView({ screen: 'list' })}
          onFinish={(stepTimings) => {
            setMultiCookRecipes(view.recipes);
            setMultiCookStepTimings(stepTimings);
            setView({ screen: 'list' });
            setShowMultiCookLogModal(true);
          }}
        />
      )}
      {showMultiCookLogModal && (
        <MultiCookLogModal
          recipes={multiCookRecipes}
          ingredientsById={ingredientsById}
          onClose={() => {
            setShowMultiCookLogModal(false);
            setMultiCookRecipes([]);
            setMultiCookStepTimings([]);
          }}
          onConfirm={handleConfirmMultiCooking}
        />
      )}
      {showTagManager && <TagManager onClose={() => setShowTagManager(false)} />}
    </div>
  );
}
