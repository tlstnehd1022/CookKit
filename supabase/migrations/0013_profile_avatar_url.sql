-- ============================================================================
-- 0013_profile_avatar_url.sql — 프로필 사진(avatar_url) 저장
-- ============================================================================
-- 구글 로그인 시 raw_user_meta_data에 이미 avatar_url(프로필 사진 URL)이 들어있어서,
-- display_name과 같은 방식으로 profiles에 옮겨 저장해두고 작성자 표시 옆에 작은 아이콘으로
-- 보여준다. 실제 이미지 바이트를 우리 쪽에 다운로드/저장하지 않고 구글이 제공하는 URL을
-- 그대로 참조만 한다(프로필 사진은 조리 단계 이미지와 달리 "우리가 소유해야 하는 자산"이
-- 아니라 그냥 구글 계정의 부가 정보 표시일 뿐이라, 다른 이미지들과 달리 Storage에 복사해둘
-- 필요가 없다고 판단).
-- ============================================================================

alter table public.profiles add column if not exists avatar_url text;

-- 새 계정 생성 시 avatar_url도 같이 채우도록 트리거 갱신(가입 시점 스냅샷 — 이후 구글 쪽
-- 사진이 바뀌어도 자동 갱신되지는 않음, display_name과 동일한 한계).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );
  return new;
end;
$$;

-- 이미 가입된 계정들도 지금 auth.users에 남아있는 구글 메타데이터로 한 번 채워준다
-- (avatar_url이 비어있는 행만 대상 — 이미 값이 있으면 건드리지 않음, 여러 번 실행해도 안전).
update public.profiles p
set avatar_url = coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture')
from auth.users u
where p.id = u.id
  and p.avatar_url is null
  and coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture') is not null;
