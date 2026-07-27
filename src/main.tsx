import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const root = createRoot(document.getElementById('root')!)

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
    root.render(
      <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', color: '#b0342a', lineHeight: 1.6 }}>
        <h1 style={{ fontSize: 18 }}>앱을 시작할 수 없습니다</h1>
        <p style={{ whiteSpace: 'pre-wrap' }}>{message}</p>
      </div>,
    )
  }
}

bootstrap()
