import { useEffect } from 'react';

/** 화면이 자동으로 꺼지지 않게 유지 — 지원 안 되는 브라우저는 조용히 무시. 탭 전환 등으로
 * 브라우저가 자동 해제한 경우 다시 화면이 보이면 재요청한다(Wake Lock 표준 동작). 요리
 * 모드(1개/여러 개 레시피) 화면이 떠 있는 동안 호출한다. */
export function useWakeLock() {
  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null;
    async function acquire() {
      try {
        if ('wakeLock' in navigator) {
          sentinel = await navigator.wakeLock.request('screen');
        }
      } catch {
        // 지원 안 되거나 요청 실패해도 기능 저하 없이 계속 진행
      }
    }
    acquire();
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') acquire();
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      sentinel?.release().catch(() => {});
    };
  }, []);
}
