import { useState } from 'react';
import { RecipesPage } from './RecipesPage';
import { RecipeDetailPage } from './RecipeDetailPage';
import { RecipeEditor } from './RecipeEditor';
import { TagManager } from './TagManager';

type View =
  | { screen: 'list' }
  | { screen: 'detail'; recipeId: string }
  | { screen: 'edit'; recipeId?: string };

export function RecipesFeature() {
  const [view, setView] = useState<View>({ screen: 'list' });
  const [showTagManager, setShowTagManager] = useState(false);

  return (
    <div>
      {view.screen === 'list' && (
        <RecipesPage
          onSelectRecipe={(id) => setView({ screen: 'detail', recipeId: id })}
          onAddRecipe={() => setView({ screen: 'edit' })}
          onManageTags={() => setShowTagManager(true)}
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
      {showTagManager && <TagManager onClose={() => setShowTagManager(false)} />}
    </div>
  );
}
