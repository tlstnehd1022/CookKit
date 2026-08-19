import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // push/notificationclick을 직접 다뤄야 해서(유통기한 알림) 자동 생성(generateSW) 대신
      // 커스텀 서비스워커 소스(src/sw.ts)를 쓴다 — 빌드 시 self.__WB_MANIFEST 자리에 프리캐시
      // 목록이 주입됨.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      // 자동 주입 등록 스크립트 대신 main.tsx에서 직접 registerSW()를 호출한다 — 주기적으로
      // registration.update()를 불러 새 배포를 감지하기 위해 registration 객체가 필요해서.
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
      },
      // 아이콘은 아직 임시(scripts/generate-pwa-icons.mjs로 생성한 단색 원형) — 나중에 실제
      // 로고로 교체할 것.
      manifest: {
        name: 'CookKit',
        short_name: 'CookKit',
        description: '알러지 있는 가족/친구와 함께 요리하는 레시피·재료 관리 앱',
        start_url: '/',
        display: 'standalone',
        background_color: '#f5ead8',
        theme_color: '#c67139',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
})
