import { useState } from 'react';
import { ShoppingListPage } from './features/shopping-list/ShoppingListPage';
import { RecipesFeature } from './features/recipes/RecipesFeature';
import { IngredientsPage } from './features/ingredients/IngredientsPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { LoginPage } from './features/auth/LoginPage';
import { HouseholdOnboarding } from './features/auth/HouseholdOnboarding';
import { useSession } from './data/session';
import { useHousehold } from './data/household';

type Tab = 'recipes' | 'shopping' | 'ingredients' | 'settings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'recipes', label: '레시피', icon: '📖' },
  { id: 'shopping', label: '장보기', icon: '🛒' },
  { id: 'ingredients', label: '재료', icon: '🧺' },
  { id: 'settings', label: '설정', icon: '⚙️' },
];

function App() {
  const { user, loaded } = useSession();
  const { household, loading: householdLoading, refresh: refreshHousehold } = useHousehold();
  const [tab, setTab] = useState<Tab>('recipes');

  if (!loaded) {
    return null;
  }

  if (!user) {
    return <LoginPage />;
  }

  if (householdLoading) {
    return null;
  }

  if (!household) {
    return <HouseholdOnboarding onDone={refreshHousehold} />;
  }

  return (
    <>
      <main className="app-main">
        {tab === 'recipes' && <RecipesFeature />}
        {tab === 'shopping' && <ShoppingListPage />}
        {tab === 'ingredients' && <IngredientsPage />}
        {tab === 'settings' && <SettingsPage />}
      </main>
      <nav className="app-nav">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            <span className="icon">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}

export default App;
