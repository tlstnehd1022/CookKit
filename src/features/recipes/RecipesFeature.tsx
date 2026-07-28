import { useState } from 'react';
import { RecipesPage } from './RecipesPage';
import { RecipeDetailPage } from './RecipeDetailPage';
import { RecipeEditor } from './RecipeEditor';
import { TagManager } from './TagManager';
import { DiscoverRecipesPage } from './DiscoverRecipesPage';
import { PublicRecipeDetailPage } from './PublicRecipeDetailPage';
import type { PublicRecipeEntry } from '../../data/publicRecipes';

type View =
  | { screen: 'list' }
  | { screen: 'detail'; recipeId: string }
  | { screen: 'edit'; recipeId?: string }
  | { screen: 'discover-detail'; entry: PublicRecipeEntry; ingredientNameById: Map<string, string> };

type ListMode = 'mine' | 'discover';

export function RecipesFeature() {
  const [view, setView] = useState<View>({ screen: 'list' });
  const [listMode, setListMode] = useState<ListMode>('mine');
  const [showTagManager, setShowTagManager] = useState(false);

  return (
    <div>
      {view.screen === 'list' && (
        <div className="chip-row" style={{ marginBottom: 12 }}>
          <button
            className={`chip selectable ${listMode === 'mine' ? 'active' : ''}`}
            onClick={() => setListMode('mine')}
          >
            내 레시피
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
        />
      )}
      {showTagManager && <TagManager onClose={() => setShowTagManager(false)} />}
    </div>
  );
}
