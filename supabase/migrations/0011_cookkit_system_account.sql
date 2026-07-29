-- ============================================================================
-- 0011_cookkit_system_account.sql — 시드 레시피 소유용 "cookkit-system" 계정 생성
-- ============================================================================
-- 배경: 유튜브 요리 영상들을 일괄 변환해서 공개(visibility='public') 레시피로 미리 심어두는
-- 작업(scripts/seed-recipes-from-youtube.ts, 별도 세션에서 준비 중) 때문에, recipes.user_id가
-- 가리킬 "누군가의" 계정이 필요함 — recipes 테이블은 반드시 user_id를 가져야 하고(not null,
-- household_id 컬럼은 없음, "DB 전환(Supabase)" 항목 참고), 실사용자 계정 대신 이 시드
-- 레시피들만 전담으로 소유하는 시스템 계정을 하나 둔다.
--
-- ⚠️ 이 계정은 auth.users에 직접 SQL로 insert하는 방식이다 — Supabase가 공식 문서화한 방법은
-- Admin API(`supabase.auth.admin.createUser()`, service_role 키 필요)이고, auth.users는
-- GoTrue(Auth 서버)가 내부적으로 관리하는 스키마라 직접 insert는 비공식적인 방법이다. 다만
-- 이 계정은 실제로 로그인할 일이 없는(비밀번호를 아무도 모르는 랜덤값으로 설정) 순수 "레시피
-- 소유자 자리" 용도라 이 정도 리스크는 감수 가능하다고 판단 — 더 안전하게 하려면 Node
-- 스크립트에서 Admin API로 만드는 방법으로 바꿀 것.
--
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 한 번 실행.
-- 이미 있으면 건너뛰므로 여러 번 실행해도 안전함(idempotent).
-- ============================================================================

-- 다른 실제 계정과 충돌할 일이 없도록 고정 UUID + .internal 이메일(라우팅 불가 예약 TLD) 사용.
-- 시드 스크립트가 이 id를 하드코딩해서 바로 쓸 수 있게 랜덤 생성 대신 고정값으로 둠.
do $$
declare
  system_user_id uuid := '00000000-0000-0000-0000-000000000001';
begin
  if exists (select 1 from auth.users where id = system_user_id) then
    raise notice 'cookkit-system 계정이 이미 있습니다(id=%) - 건너뜁니다.', system_user_id;
    return;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    system_user_id,
    'authenticated',
    'authenticated',
    'system@cookkit.internal',
    -- 아무도 모르는 랜덤 비밀번호로 채워둠 — 이 계정으로 로그인하는 경로는 앱에 없음(순수
    -- 레시피 소유자 자리 용도).
    crypt(encode(gen_random_bytes(24), 'hex'), gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"CookKit"}'::jsonb,
    now(), now(), '', '', '', ''
  );
  -- public.profiles 행은 handle_new_user() 트리거가 자동으로 만들어줌
  -- (display_name = raw_user_meta_data->>'full_name' = 'CookKit').

  raise notice 'cookkit-system 계정 생성 완료: id=%', system_user_id;
end $$;
