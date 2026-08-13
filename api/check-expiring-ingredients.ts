import type { VercelRequest, VercelResponse } from '@vercel/node';
import webpush from 'web-push';
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js';
import { getExpirationInfo } from '../src/lib/expiration.js';

// Vercel Cron이 매일 1회 호출한다(vercel.json의 crons 항목). Vercel은 CRON_SECRET 환경변수가
// 설정돼 있으면 호출 시 Authorization: Bearer <CRON_SECRET> 헤더를 자동으로 실어 보내므로,
// 이 값으로 "진짜 Vercel Cron이 호출한 것"인지 검증해서 외부에서 아무나 이 엔드포인트를
// 두드려 알림을 마구 발송하지 못하게 막는다.
export const config = { maxDuration: 60 };

interface HouseholdIngredient {
  id: string;
  name: string;
  daysLeft: number;
}

const VAPID_SUBJECT = 'mailto:cookkit-app@example.com'; // 필요시 실제 연락처로 교체 가능

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const vapidPublicKey = process.env.VITE_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  if (!vapidPublicKey || !vapidPrivateKey) {
    res.status(500).json({ error: 'vapid_not_configured', message: 'VAPID 키가 설정되지 않았습니다.' });
    return;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, vapidPublicKey, vapidPrivateKey);

  const admin = getSupabaseAdmin();

  try {
    // 1) 보유 중(owned=true)이면서 유통기한이 등록된 재료를 가져와 클라이언트와 같은 기준
    // (src/lib/expiration.ts)으로 "임박(D-2 이내)/경과" 여부를 판단한다(로직 중복 없이 화면
    // 배지 기준과 항상 일치시킴). owned=false인 재료는 유통기한이 남아있어도 실제로 냉장고에
    // 없는 것이라 알림 대상에서 제외한다(A-3, getPantryAvailability와 같은 판단 기준).
    const { data: ingredients, error: ingredientsError } = await admin
      .from('ingredients')
      .select('id, household_id, name, expiration_date')
      .eq('owned', true)
      .not('expiration_date', 'is', null);
    if (ingredientsError) throw ingredientsError;

    const householdIngredients = new Map<string, HouseholdIngredient[]>();
    for (const row of ingredients ?? []) {
      const info = getExpirationInfo(row.expiration_date as string | null);
      if (!info || info.level === 'soon') continue; // 'urgent'|'expired'만 알림 대상
      const householdId = row.household_id as string;
      const list = householdIngredients.get(householdId) ?? [];
      list.push({ id: row.id as string, name: row.name as string, daysLeft: info.daysLeft });
      householdIngredients.set(householdId, list);
    }

    if (householdIngredients.size === 0) {
      res.status(200).json({ ok: true, notified: 0 });
      return;
    }

    // 2) 대상 household들의 구성원 + 구독 정보를 한 번에 가져온다.
    const householdIds = Array.from(householdIngredients.keys());
    const { data: members, error: membersError } = await admin
      .from('household_members')
      .select('household_id, user_id')
      .in('household_id', householdIds);
    if (membersError) throw membersError;

    const userIds = Array.from(new Set((members ?? []).map((m) => m.user_id as string)));
    if (userIds.length === 0) {
      res.status(200).json({ ok: true, notified: 0 });
      return;
    }

    const { data: subscriptions, error: subsError } = await admin
      .from('push_subscriptions')
      .select('id, user_id, endpoint, subscription_data')
      .in('user_id', userIds);
    if (subsError) throw subsError;

    let notified = 0;
    const staleSubscriptionIds: string[] = [];

    for (const member of members ?? []) {
      const householdId = member.household_id as string;
      const userId = member.user_id as string;
      const list = householdIngredients.get(householdId);
      if (!list || list.length === 0) continue;

      const userSubscriptions = (subscriptions ?? []).filter((s) => s.user_id === userId);
      if (userSubscriptions.length === 0) continue;

      const sorted = [...list].sort((a, b) => a.daysLeft - b.daysLeft);
      const namesPreview = sorted
        .slice(0, 3)
        .map((i) => i.name)
        .join(', ');
      const body =
        sorted.length > 3 ? `${namesPreview} 외 ${sorted.length - 3}개 재료를 확인해주세요.` : `${namesPreview}의 유통기한을 확인해주세요.`;

      const payload = JSON.stringify({
        title: '🥬 유통기한 임박 재료가 있어요',
        body,
        tab: 'ingredients',
        // 알림 클릭 시 이 재료들로 스크롤+하이라이트(src/sw.ts → main.tsx →
        // IngredientsPage.tsx) — 너무 길어지지 않게 상위 10개까지만 실어보냄
        ingredientIds: sorted.slice(0, 10).map((i) => i.id),
      });

      for (const sub of userSubscriptions) {
        try {
          await webpush.sendNotification(sub.subscription_data as webpush.PushSubscription, payload);
          notified += 1;
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            // 브라우저/기기에서 구독이 이미 해제된 경우 — 다음에 또 실패하지 않도록 정리
            staleSubscriptionIds.push(sub.id as string);
          } else {
            console.error('푸시 발송 실패:', getMessage(err));
          }
        }
      }
    }

    if (staleSubscriptionIds.length > 0) {
      await admin.from('push_subscriptions').delete().in('id', staleSubscriptionIds);
    }

    res.status(200).json({ ok: true, notified, staleRemoved: staleSubscriptionIds.length });
  } catch (err) {
    res.status(500).json({ error: 'unknown', message: getMessage(err) });
  }
}

function getMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message);
  return String(err);
}
