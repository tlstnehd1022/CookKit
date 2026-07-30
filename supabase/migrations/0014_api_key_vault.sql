-- ============================================================================
-- 0014_api_key_vault.sql — API 키(Anthropic/Gemini) Supabase Vault 암호화 저장 (Phase 4)
-- ============================================================================
-- 배경: 지금까지 Anthropic/Gemini API 키를 브라우저 localStorage에 평문으로 저장하고
-- 있었음(개인용 앱 전제로 감수했던 위험). 이제 Vault로 암호화 저장하고, 실제 AI 호출도
-- 브라우저에서 직접 하지 않고 서버리스 함수(api/ai-*.ts)를 거치도록 바꾼다 — 이 마이그레이션은
-- 그 저장소 부분(Vault 테이블 + 접근 함수)만 다룬다.
--
-- Vault 확장 확인: Supabase 대시보드 > Database > Extensions에서 "supabase_vault" 검색.
-- 최신 프로젝트는 기본 활성화되어 있어야 하고(비활성화면 여기서 직접 켜도 됨), 아래 문장은
-- 이미 활성화돼 있으면 아무 일도 하지 않으므로 여러 번 실행해도 안전함.
create extension if not exists supabase_vault;

-- vault.secrets / vault.decrypted_secrets는 PostgREST에 노출되는 스키마가 아니라서
-- supabase-js로 직접 조회/수정이 불가능하다(anon/service_role 키 어느 쪽으로도). 그래서
-- public 스키마에 SECURITY DEFINER 래퍼 함수를 두고, 그 함수의 실행 권한도 service_role
-- 에게만 부여한다(anon/authenticated는 revoke) — 이 두 함수는 오직 서버리스 함수(Vercel
-- 환경변수로만 존재하는 SUPABASE_SERVICE_ROLE_KEY를 쓰는 api/save-api-key.ts,
-- api/get-api-key.ts, api/ai-*.ts)만 호출할 수 있고, 브라우저에서는 절대 접근할 수 없다.

-- user_api_keys — 실제 키 값은 담지 않고, vault.secrets를 가리키는 참조(secret_id)만 저장.
-- household가 아니라 user 단위(각자 자기 키를 씀).
create table public.user_api_keys (
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('anthropic', 'gemini')),
  secret_id uuid not null references vault.secrets(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

-- RLS는 켜두되 anon/authenticated용 정책은 하나도 만들지 않는다 — "본인 키만 조회/저장 가능"은
-- RLS가 아니라 서버리스 함수가 요청자의 로그인 세션(JWT)을 검증해서 그 user_id로만 동작하게
-- 하는 방식으로 보장한다(아래 함수들이 어차피 service_role 전용이라 RLS로 열어봐도 클라이언트가
-- 이 경로로는 접근할 수 없고, 실제 키 값은 vault 쪽에 있어 이 테이블 자체엔 민감정보가 없음 —
-- provider/secret_id/시간 정도라 RLS 정책을 별도로 만들 실익이 적다고 판단).
alter table public.user_api_keys enable row level security;

-- ---- SECURITY DEFINER 래퍼 함수 (service_role 전용) ------------------------------------

-- 저장: 이미 그 (user, provider) 키가 있으면 같은 vault secret을 그대로 갱신(vault.update_secret),
-- 없으면 새 secret을 만들고 참조를 insert.
create or replace function public.save_user_api_key(p_user_id uuid, p_provider text, p_secret text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_secret_id uuid;
begin
  if p_provider not in ('anthropic', 'gemini') then
    raise exception 'invalid provider: %', p_provider;
  end if;

  select secret_id into existing_secret_id
  from public.user_api_keys
  where user_id = p_user_id and provider = p_provider;

  if existing_secret_id is not null then
    perform vault.update_secret(existing_secret_id, p_secret);
    update public.user_api_keys
      set updated_at = now()
      where user_id = p_user_id and provider = p_provider;
  else
    existing_secret_id := vault.create_secret(p_secret, p_user_id::text || ':' || p_provider);
    insert into public.user_api_keys (user_id, provider, secret_id)
    values (p_user_id, p_provider, existing_secret_id);
  end if;
end;
$$;

-- 조회: 복호화된 키 전체를 반환한다(마스킹은 이 함수를 호출하는 api/get-api-key.ts에서 처리 —
-- DB 함수 결과는 항상 평문 전체이고, 클라이언트로 나가기 직전에만 마스킹됨에 주의).
create or replace function public.get_user_api_key(p_user_id uuid, p_provider text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  result text;
begin
  select vs.decrypted_secret into result
  from public.user_api_keys k
  join vault.decrypted_secrets vs on vs.id = k.secret_id
  where k.user_id = p_user_id and k.provider = p_provider;
  return result;
end;
$$;

revoke execute on function public.save_user_api_key(uuid, text, text) from public;
revoke execute on function public.save_user_api_key(uuid, text, text) from anon;
revoke execute on function public.save_user_api_key(uuid, text, text) from authenticated;
grant execute on function public.save_user_api_key(uuid, text, text) to service_role;

revoke execute on function public.get_user_api_key(uuid, text) from public;
revoke execute on function public.get_user_api_key(uuid, text) from anon;
revoke execute on function public.get_user_api_key(uuid, text) from authenticated;
grant execute on function public.get_user_api_key(uuid, text) to service_role;
