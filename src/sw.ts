/// <reference lib="webworker" />
// 커스텀 서비스워커 소스 — vite-plugin-pwa(injectManifest 전략)가 빌드 시 self.__WB_MANIFEST
// 자리에 실제 프리캐시 목록을 채워 넣는다. push/notificationclick 이벤트를 직접 다뤄야 해서
// (유통기한 알림) 자동 생성 서비스워커(generateSW)로는 부족해 이 방식을 씀.
import { precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);

self.skipWaiting();

interface PushPayload {
  title?: string;
  body?: string;
  /** 알림 클릭 시 이동할 탭(App.tsx의 Tab 타입과 맞춤) — 기본 ingredients(유통기한 알림 용도) */
  tab?: string;
}

self.addEventListener('push', (event: PushEvent) => {
  let payload: PushPayload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    // JSON이 아니면 빈 페이로드로 계속 진행
  }
  const title = payload.title || 'CookKit';
  const options: NotificationOptions = {
    body: payload.body || '유통기한이 임박한 재료가 있어요.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { tab: payload.tab || 'ingredients' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// 알림을 누르면 이미 열려있는 창은 포커스만 주고(postMessage로 탭 전환 요청), 없으면 새 창을
// 연다(쿼리스트링으로 어떤 탭을 열지 전달 — main.tsx가 시작 시 한 번 읽어서 처리).
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const tab = (event.notification.data as { tab?: string } | undefined)?.tab || 'ingredients';

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        if ('focus' in client) {
          await (client as WindowClient).focus();
          client.postMessage({ type: 'cookkit-navigate', tab });
          return;
        }
      }
      await self.clients.openWindow(`/?tab=${encodeURIComponent(tab)}`);
    })(),
  );
});
