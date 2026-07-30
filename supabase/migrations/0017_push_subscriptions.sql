-- ============================================================================
-- 0017_push_subscriptions.sql — 웹 푸시 구독 정보 저장(유통기한 알림용)
-- ============================================================================
-- 구독 정보(endpoint+공개키) 자체는 "이 기기로 푸시를 보내달라"는 정보일 뿐 별도로 암호화해서
-- 보호해야 하는 비밀값이 아니라서(Vault 없이) RLS만으로 본인 것만 관리하게 한다. 실제 발송
-- (web-push 라이브러리 + VAPID 비밀키)은 api/check-expiring-ingredients.ts가 service_role로
-- 모든 사용자의 구독을 읽어서 처리한다(RLS 우회, 서버에서만).
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  subscription_data jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select using (user_id = auth.uid());

create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert with check (user_id = auth.uid());

create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete using (user_id = auth.uid());
