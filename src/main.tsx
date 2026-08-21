import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import { setActiveTab, type Tab } from './data/activeTab'
import { setHighlightIngredientIds } from './data/highlightIngredients'
import { requestSharedRecipe } from './data/sharedRecipeRequest'
import { extractYoutubeVideoId } from './lib/youtubeTranscript'

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
// 로 열린다 — 유튜브 링크가 섞여 있으면 바로 변환 파이프라인으로, 아니면 대화 입력창에 미리
// 채워넣도록 신호만 세팅하고 실제 화면 전환은 RecipesFeature.tsx가 담당한다.
if (window.location.pathname === '/share-recipe') {
  const shareParams = new URLSearchParams(window.location.search)
  const sharedTitle = shareParams.get('title')?.trim() ?? ''
  const sharedText = shareParams.get('text')?.trim() ?? ''
  const sharedUrl = shareParams.get('url')?.trim() ?? ''
  const youtubeId = extractYoutubeVideoId(`${sharedUrl} ${sharedText}`)
  if (youtubeId) {
    requestSharedRecipe({ youtubeUrl: `https://www.youtube.com/watch?v=${youtubeId}` })
  } else {
    const chatText = [sharedTitle, sharedText, sharedUrl].filter((v, i, arr) => v && arr.indexOf(v) === i).join('\n')
    if (chatText) requestSharedRecipe({ chatText })
  }
  window.history.replaceState({}, '', '/')
}

// theme/App은 동적 import로 불러온다 — 정적 import였다면 supabaseClient.ts 같은 곳에서
// 모듈 최상단에 던지는 에러(예: 환경변수 누락)가 React가 마운트되기도 전에 터져서 완전히
// 빈 화면만 남았다(디버깅 불가). 동적 import는 실패해도 Promise가 reject될 뿐이라
// catch에서 최소한의 에러 화면을 띄울 수 있다.
async function bootstrap() {
  try {
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
    // 앱 부트스트랩 자체가 실패한 상황(예: 환경변수 누락)이라 index.css의 --danger 변수가
    // 제대로 로드됐다고 보장할 수 없어 의도적으로 하드코딩한다(새 팔레트 danger 값과 맞춰둠).
    root.render(
      <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', color: '#a8382a', lineHeight: 1.6 }}>
        <h1 style={{ fontSize: 18 }}>앱을 시작할 수 없습니다</h1>
        <p style={{ whiteSpace: 'pre-wrap' }}>{message}</p>
      </div>,
    )
  }
}

bootstrap()
