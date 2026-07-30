import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useSession } from './session';
import { getErrorMessage } from '../lib/errorMessage';

// 웹 푸시 구독 공개키 — 공개해도 안전한 값이라(구독 암호화용, 비밀키는 서버에만) VITE_ 접두사로
// 클라이언트 번들에 노출한다. VAPID 키 쌍 생성 방법은 CLAUDE.md "웹 푸시 알림" 항목 참고.
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export function isPushSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
}

/** iOS Safari는 "홈 화면에 추가"(standalone) 상태가 아니면 웹 푸시 자체가 동작하지 않는다 —
 * 설정 화면에서 이 경우 안내 문구를 보여주기 위한 감지 함수. */
export function isIosNotInstalled(): boolean {
  if (typeof navigator === 'undefined') return false;
  const isIos =
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIos) return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  const isStandalone = nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  return !isStandalone;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

/**
 * 설정 화면의 "유통기한 알림 받기" 토글이 쓰는 훅 — 브라우저 Notification/Push API로 구독하고,
 * 구독 정보(endpoint+공개키, 비밀값 아님)를 Supabase에 저장한다(RLS로 본인 것만 관리, Vault
 * 불필요). 실제 발송은 api/check-expiring-ingredients.ts(Vercel Cron)가 서버에서 처리.
 */
export function useNotificationSettings() {
  const { user } = useSession();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const refresh = useCallback(async () => {
    if (!user || !isPushSupported()) {
      setEnabled(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setEnabled(Boolean(subscription));
    } catch {
      setEnabled(false);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function enable() {
    if (!user) throw new Error('로그인이 필요합니다.');
    if (!isPushSupported()) throw new Error('이 브라우저는 푸시 알림을 지원하지 않아요.');
    if (!VAPID_PUBLIC_KEY) throw new Error('알림 설정(VAPID 공개키)이 아직 준비되지 않았어요.');

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('알림 권한이 허용되지 않았어요.');

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        // TS lib.dom의 BufferSource 타입이 ArrayBuffer/SharedArrayBuffer를 엄격히 구분해서
        // Uint8Array 그대로는 타입이 안 맞음(런타임에는 문제없는 유효한 ArrayBufferView) — 캐스팅.
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }

    const { error: dbError } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: user.id,
        endpoint: subscription.endpoint,
        subscription_data: subscription.toJSON(),
      },
      { onConflict: 'user_id,endpoint' },
    );
    if (dbError) throw dbError;
    setEnabled(true);
  }

  async function disable() {
    if (!user) return;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await supabase.from('push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', subscription.endpoint);
      await subscription.unsubscribe();
    }
    setEnabled(false);
  }

  async function toggle(next: boolean) {
    setError(null);
    try {
      if (next) await enable();
      else await disable();
    } catch (err) {
      setError(getErrorMessage(err, '알림 설정 중 오류가 발생했습니다.'));
    }
  }

  return { enabled, loading, error, toggle, supported: isPushSupported() };
}
