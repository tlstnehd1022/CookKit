import { useEffect } from 'react';
import { ShoppingListPage } from './features/shopping-list/ShoppingListPage';
import { RecipesFeature } from './features/recipes/RecipesFeature';
import { IngredientsPage } from './features/ingredients/IngredientsPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { LoginPage } from './features/auth/LoginPage';
import { HouseholdOnboarding } from './features/auth/HouseholdOnboarding';
import { useSession } from './data/session';
import { useHousehold } from './data/household';
import { initializeDataLayer, resetDataLayer, useDataLayerLoading } from './data/store';
import { initializeShoppingSelection, resetShoppingSelection } from './data/shoppingSelection';
import { useImageGenerationCompletionMessage, useImageGenerationStatus } from './data/imageGenerationStatus';
import { setActiveTab, useActiveTab, type Tab } from './data/activeTab';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'recipes', label: '레시피', icon: '📖' },
  { id: 'shopping', label: '장보기', icon: '🛒' },
  { id: 'ingredients', label: '냉장고', icon: '🧊' },
  { id: 'settings', label: '설정', icon: '⚙️' },
];

function App() {
  const { user, loaded } = useSession();
  const { household, loading: householdLoading, refresh: refreshHousehold } = useHousehold();
  const dataLoading = useDataLayerLoading();
  const tab = useActiveTab();
  const imageGenStatus = useImageGenerationStatus();
  const imageGenCompletionMessage = useImageGenerationCompletionMessage();

  useEffect(() => {
    if (!user) {
      resetDataLayer();
      resetShoppingSelection();
      return;
    }
    if (household) {
      initializeDataLayer(household.id, user.id);
      initializeShoppingSelection(household.id);
    }
  }, [user, household]);

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

  if (dataLoading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p className="text-muted">불러오는 중...</p>
      </div>
    );
  }

  return (
    <>
      {imageGenStatus.active && (
        <div className="image-gen-banner">
          🖼 "{imageGenStatus.recipeName}" 이미지 생성 중... ({imageGenStatus.done}/{imageGenStatus.total})
        </div>
      )}
      <main className="app-main">
        {/* 탭 전환 시 조건부 렌더링(마운트/언마운트)이 아니라 hidden 속성으로 숨기기만 한다.
            언마운트하면 레시피 탭의 대화형 AI 채팅/편집 폼 진행 상태, 진행 중인 이미지 생성
            요청 등이 다른 탭에 갔다 왔을 때 전부 날아가버림(useState는 마운트 중인 인스턴스에만
            붙어있고, 언마운트된 컴포넌트로의 setState는 조용히 무시됨) — 그래서 4개 탭을 항상
            같이 마운트해두고 안 보이는 탭만 hidden으로 화면에서만 감춘다. 각 탭은 이미 로드된
            공유 store를 구독만 하므로(추가 네트워크 요청 없음) 동시에 마운트해둬도 비용이 거의
            없다. */}
        <div hidden={tab !== 'recipes'}>
          <RecipesFeature />
        </div>
        <div hidden={tab !== 'shopping'}>
          <ShoppingListPage />
        </div>
        <div hidden={tab !== 'ingredients'}>
          <IngredientsPage />
        </div>
        <div hidden={tab !== 'settings'}>
          <SettingsPage />
        </div>
      </main>
      <nav className="app-nav">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setActiveTab(t.id)}>
            <span className="icon">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      {imageGenCompletionMessage && <div className="toast">{imageGenCompletionMessage}</div>}
    </>
  );
}

export default App;
