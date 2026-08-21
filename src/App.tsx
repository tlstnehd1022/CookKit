import { useEffect, useState } from 'react';
import { House, BookOpen, Refrigerator, ShoppingCart } from 'lucide-react';
import { ShoppingListPage } from './features/shopping-list/ShoppingListPage';
import { RecipesFeature } from './features/recipes/RecipesFeature';
import { IngredientsPage } from './features/ingredients/IngredientsPage';
import { HomePage } from './features/home/HomePage';
import { LoginPage } from './features/auth/LoginPage';
import { HouseholdOnboarding } from './features/auth/HouseholdOnboarding';
import { useSession } from './data/session';
import { useHousehold } from './data/household';
import { initializeDataLayer, resetDataLayer, useDataLayerLoading } from './data/store';
import {
  initializeShoppingSelection,
  resetShoppingSelection,
  useShoppingNeededCount,
} from './data/shoppingSelection';
import { initializeShoppingExtraItems, resetShoppingExtraItems } from './data/shoppingExtraItems';
import { initializeNotifications, resetNotifications } from './data/notifications';
import { useImageGenerationCompletionMessage, useImageGenerationStatus } from './data/imageGenerationStatus';
import { useChatLoading } from './data/chatLoadingStatus';
import { useYoutubeConversionStatus } from './data/youtubeConversionStatus';
import { useInfoToast } from './data/infoToast';
import { setActiveTab, useActiveTab, type Tab } from './data/activeTab';
import { useOnlineStatus } from './data/useOnlineStatus';
import { useUndoToast, triggerUndo } from './data/undoToast';

/** 대화 응답 대기/유튜브 변환/이미지 생성 로딩을 같은 시각적 패턴(상단 고정 배너 + 하단
 * 프로그레스 바)으로 통일해 보여준다 — progress를 모르면(대화 응답처럼) 무한 로딩 애니메이션,
 * 알면(유튜브 단계/이미지 생성 개수) 실제 진행률을 보여준다. */
function LoadingBanner({ message, progress }: { message: string; progress?: number }) {
  return (
    <div className="top-banner loading">
      {message}
      <div className="top-banner-progress">
        <div
          className={`top-banner-progress-bar ${progress == null ? 'indeterminate' : ''}`}
          style={progress != null ? { width: `${Math.round(progress * 100)}%` } : undefined}
        />
      </div>
    </div>
  );
}

const TABS: { id: Tab; label: string; icon: typeof House }[] = [
  { id: 'home', label: '홈', icon: House },
  { id: 'recipes', label: '레시피', icon: BookOpen },
  { id: 'ingredients', label: '냉장고', icon: Refrigerator },
  { id: 'shopping', label: '장보기', icon: ShoppingCart },
];

function App() {
  const { user, loaded } = useSession();
  const { household, loading: householdLoading, refresh: refreshHousehold } = useHousehold();
  const dataLoading = useDataLayerLoading();
  const tab = useActiveTab();
  const imageGenStatus = useImageGenerationStatus();
  const imageGenCompletionMessage = useImageGenerationCompletionMessage();
  const chatLoading = useChatLoading();
  const youtubeConversionStatus = useYoutubeConversionStatus();
  const infoToast = useInfoToast();
  const [dataLoadError, setDataLoadError] = useState<string | null>(null);
  const shoppingNeededCount = useShoppingNeededCount();
  const isOnline = useOnlineStatus();
  const undoToast = useUndoToast();

  useEffect(() => {
    if (!user) {
      resetDataLayer();
      resetShoppingSelection();
      resetShoppingExtraItems();
      resetNotifications();
      return;
    }
    initializeNotifications(user.id);
    if (household) {
      setDataLoadError(null);
      initializeDataLayer(household.id, user.id).catch((err) => {
        console.error('데이터 초기화 실패:', err);
        setDataLoadError('데이터를 불러오지 못했어요. 새로고침해주세요.');
      });
      initializeShoppingSelection(household.id);
      initializeShoppingExtraItems(household.id);
    }
  }, [user, household]);

  if (!loaded) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p className="text-muted">불러오는 중...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  if (householdLoading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p className="text-muted">불러오는 중...</p>
      </div>
    );
  }

  if (!household) {
    return <HouseholdOnboarding onDone={refreshHousehold} />;
  }

  if (dataLoadError) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p className="text-muted">{dataLoadError}</p>
      </div>
    );
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
      {!isOnline && (
        <div className="top-banner">📴 오프라인 상태예요. 변경사항이 저장되지 않을 수 있어요.</div>
      )}
      {chatLoading && <LoadingBanner message="💬 답변 준비 중..." />}
      {youtubeConversionStatus.active && (
        <LoadingBanner
          message={youtubeConversionStatus.stage === 'extracting' ? '🎬 자막 추출 중...' : '🎬 레시피 분석 중...'}
          progress={youtubeConversionStatus.stage === 'extracting' ? 0.4 : 0.85}
        />
      )}
      {imageGenStatus.active && (
        <LoadingBanner
          message={`🖼 "${imageGenStatus.recipeName}" 이미지 생성 중... (${imageGenStatus.done}/${imageGenStatus.total})`}
          progress={imageGenStatus.total > 0 ? imageGenStatus.done / imageGenStatus.total : undefined}
        />
      )}
      <main className="app-main">
        {/* 탭 전환 시 조건부 렌더링(마운트/언마운트)이 아니라 hidden 속성으로 숨기기만 한다.
            언마운트하면 레시피 탭의 대화형 AI 채팅/편집 폼 진행 상태, 진행 중인 이미지 생성
            요청 등이 다른 탭에 갔다 왔을 때 전부 날아가버림(useState는 마운트 중인 인스턴스에만
            붙어있고, 언마운트된 컴포넌트로의 setState는 조용히 무시됨) — 그래서 4개 탭을 항상
            같이 마운트해두고 안 보이는 탭만 hidden으로 화면에서만 감춘다. 각 탭은 이미 로드된
            공유 store를 구독만 하므로(추가 네트워크 요청 없음) 동시에 마운트해둬도 비용이 거의
            없다. */}
        <div hidden={tab !== 'home'}>
          <HomePage />
        </div>
        <div hidden={tab !== 'recipes'}>
          <RecipesFeature />
        </div>
        <div hidden={tab !== 'shopping'}>
          <ShoppingListPage />
        </div>
        <div hidden={tab !== 'ingredients'}>
          <IngredientsPage />
        </div>
      </main>
      <nav className="app-nav">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setActiveTab(t.id)}>
              <span className="icon">
                <Icon size={22} strokeWidth={2.75} />
                {t.id === 'shopping' && shoppingNeededCount > 0 && (
                  <span className="app-nav-badge">{shoppingNeededCount > 99 ? '99+' : shoppingNeededCount}</span>
                )}
              </span>
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>
      {imageGenCompletionMessage && <div className="toast">{imageGenCompletionMessage}</div>}
      {infoToast && <div className="toast">{infoToast}</div>}
      {undoToast && (
        <div className="toast toast-undo">
          <span>{undoToast.message}</span>
          <button type="button" onClick={() => triggerUndo()}>
            실행 취소
          </button>
        </div>
      )}
    </>
  );
}

export default App;
