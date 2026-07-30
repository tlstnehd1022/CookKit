-- ============================================================================
-- 0015_youtube_api_key_provider.sql — user_api_keys에 'youtube' provider 허용
-- ============================================================================
-- 배경: 0014에서 Anthropic/Gemini 키만 Vault로 옮기고 YouTube Data API 키(영상 제목/설명란
-- 조회용, 선택 사항)는 범위 밖으로 뒀었는데, 이것도 같은 방식으로 서버 저장하기로 함.
-- user_api_keys.provider의 체크 제약을 'youtube'까지 허용하도록 재생성한다(테이블 생성 시
-- Postgres 기본 명명 규칙에 따른 제약 이름 user_api_keys_provider_check 사용).
alter table public.user_api_keys drop constraint user_api_keys_provider_check;
alter table public.user_api_keys
  add constraint user_api_keys_provider_check check (provider in ('anthropic', 'gemini', 'youtube'));

-- save_user_api_key 내부에도 같은 값 목록으로 방어적 검증을 하고 있어서 같이 갱신
create or replace function public.save_user_api_key(p_user_id uuid, p_provider text, p_secret text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_secret_id uuid;
begin
  if p_provider not in ('anthropic', 'gemini', 'youtube') then
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
