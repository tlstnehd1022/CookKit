import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
// 타입 전용 import는 컴파일 시 완전히 지워져 런타임 청크를 만들지 않으므로(빌드 산출물에
// 아무 흔적도 안 남음) 정적으로 둬도 아래 "동적 import만" 원칙과 어긋나지 않는다.
import type { Tab } from './data/activeTab'

// PWA(standalone)로 계속 켜둔 채 쓰면 브라우저가 새 배포를 확인할 "페이지 이동"이 거의 안
// 일어나서, registerType:'autoUpdate'만으로는 실제로 갱신될 일이 드물다(사용자가 수동으로
// 새로고침/재설치해야 했던 이유). registration.update()를 직접 주기적으로 + 앱을 다시 열
// 때(visibilitychange) 호출해 새 버전을 감지시킨다 — 감지되면 autoUpdate가 알아서 적용하고
// 새로고침한다.
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

registerSW({
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    setInterval(() => registration.update(), UPDATE_CHECK_INTERVAL_MS)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update()
    })
  },
})

const root = createRoot(document.getElementById('root')!)

/**
 * 이 파일의 모든 기능 로직(딥링크 파싱, 뒤로가기 히스토리 초기화, 공유하기 파싱, theme/App)을
 * 전부 동적 import + 이 try/catch 안에서 실행한다 — 정적 import는 모듈 로드 자체가 실패하면
 * (예: 서비스 워커가 배포 중간 상태로 일부만 갱신돼서 새 청크 해시를 못 찾는 경우 — PWA를
 * 계속 켜둔 채 쓰는 모바일에서만 재현되고, 매번 새로 받는 PC 브라우저 탭에서는 재현 안 되는
 * 전형적인 패턴) React가 마운트되기도 전에 이 파일 전체 평가가 실패해서 완전히 빈 화면만
 * 남고 콘솔 밖에서는 원인도 알 수 없다. 동적 import는 실패해도 Promise가 reject될 뿐이라
 * catch에서 최소한의 에러 화면을 띄울 수 있다 — 새 기능을 추가할 때마다 이 파일 최상단에
 * 정적 import를 늘리지 말고 이 함수 안에서 동적으로 불러올 것.
 */
async function bootstrap() {
  try {
    const [
      { setActiveTab },
      { setHighlightIngredientIds },
      { requestSharedRecipe },
      { extractYoutubeVideoId },
      { extractInstagramPostId },
      { initNavigationHistory },
    ] = await Promise.all([
      import('./data/activeTab'),
      import('./data/highlightIngredients'),
      import('./data/sharedRecipeRequest'),
      import('./lib/youtubeTranscript'),
      import('./lib/instagramTranscript'),
      import('./lib/navigationHistory'),
    ])

    // 브라우저/기기 뒤로가기 버튼을 앱 화면 전환과 맞물리게 하는 popstate 리스너 — 한 번만 등록.
    initNavigationHistory()

    // 유통기한 알림 클릭 시(src/sw.ts의 notificationclick) 이미 열려있는 창은 postMessage로,
    // 새로 연 창은 ?tab=/?highlight= 쿼리스트링으로 어떤 탭을 열고 어떤 재료를 강조할지 알려준다 —
    // 이 앱은 라우터가 없는 탭 기반 SPA라 URL 자체로 화면을 구분하지 않으므로, 시작 시 한 번
    // 읽어서 전역 store에 반영한다(activeTab.ts/highlightIngredients.ts).
    const VALID_TABS: Tab[] = ['home', 'recipes', 'shopping', 'ingredients']
    function isTab(value: string | null): value is Tab {
      return Boolean(value) && VALID_TABS.includes(value as Tab)
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        const data = event.data as { type?: string; tab?: string; ingredientIds?: string[] } | undefined
        if (data?.type !== 'cookkit-navigate') return
        if (isTab(data.tab ?? null)) setActiveTab(data.tab as Tab)
        if (data.ingredientIds && data.ingredientIds.length > 0) setHighlightIngredientIds(data.ingredientIds)
      })
    }

    const searchParams = new URLSearchParams(window.location.search)
    const initialTab = searchParams.get('tab')
    const initialHighlight = searchParams.get('highlight')
    if (isTab(initialTab)) setActiveTab(initialTab)
    if (initialHighlight) setHighlightIngredientIds(initialHighlight.split(',').filter(Boolean))
    if (initialTab || initialHighlight) {
      window.history.replaceState({}, '', window.location.pathname)
    }

    // 안드로이드 "공유하기"(vite.config.ts의 share_target)로 들어오면 /share-recipe?title=&text=&url=
    // 로 열린다 — 유튜브/인스타그램 링크가 섞여 있으면 바로 변환 파이프라인으로, 아니면 대화
    // 입력창에 미리 채워넣도록 신호만 세팅하고 실제 화면 전환은 RecipesFeature.tsx가 담당한다.
    if (window.location.pathname === '/share-recipe') {
      const shareParams = new URLSearchParams(window.location.search)
      const sharedTitle = shareParams.get('title')?.trim() ?? ''
      const sharedText = shareParams.get('text')?.trim() ?? ''
      const sharedUrl = shareParams.get('url')?.trim() ?? ''
      const combined = `${sharedUrl} ${sharedText}`
      const youtubeId = extractYoutubeVideoId(combined)
      const instagramId = extractInstagramPostId(combined)
      if (youtubeId) {
        requestSharedRecipe({ linkUrl: `https://www.youtube.com/watch?v=${youtubeId}` })
      } else if (instagramId) {
        requestSharedRecipe({ linkUrl: `https://www.instagram.com/reel/${instagramId}/` })
      } else {
        const chatText = [sharedTitle, sharedText, sharedUrl]
          .filter((v, i, arr) => v && arr.indexOf(v) === i)
          .join('\n')
        if (chatText) requestSharedRecipe({ chatText })
      }
      window.history.replaceState({}, '', '/')
    }

    // theme/App은 동적 import로 불러온다 — 정적 import였다면 supabaseClient.ts 같은 곳에서
    // 모듈 최상단에 던지는 에러(예: 환경변수 누락)가 React가 마운트되기도 전에 터져서 완전히
    // 빈 화면만 남았다(디버깅 불가).
    await import('./data/theme')
    const { default: App } = await import('./App.tsx')
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  } catch (err) {
    console.error('앱을 시작하지 못했습니다:', err)
    const message = err instanceof Error ? err.message : String(err)
    // 앱 부트스트랩 자체가 실패한 상황(예: 환경변수 누락, 스테일 서비스 워커로 인한 청크
    // 로드 실패)이라 index.css의 --danger 변수가 제대로 로드됐다고 보장할 수 없어 의도적으로
    // 하드코딩한다(새 팔레트 danger 값과 맞춰둠).
    root.render(
      <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', color: '#a8382a', lineHeight: 1.6 }}>
        <h1 style={{ fontSize: 18 }}>앱을 시작할 수 없습니다</h1>
        <p style={{ whiteSpace: 'pre-wrap' }}>{message}</p>
        <p style={{ marginTop: 12, fontSize: 14 }}>
          새로고침해도 계속 이 화면이 뜨면, 브라우저/PWA의 저장된 데이터를 지우고 다시 열어보세요.
        </p>
      </div>,
    )
  }
}

bootstrap()
