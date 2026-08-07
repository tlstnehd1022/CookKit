-- ============================================================================
-- 0020_avatars_storage.sql — 프로필 사진 직접 업로드용 Storage 버킷 + RLS
-- ============================================================================
-- 배경: 구글 로그인 시 자동으로 채워지는 프로필 사진(profiles.avatar_url)과 별개로, 사용자가
-- 갤러리에서 사진을 직접 업로드해 프로필 사진으로 쓸 수 있게 한다. 작성자 표시("OO님의 레시피")
-- 아이콘이 다른 household/공개 레시피 화면에서도 보여야 하므로(recipe-images처럼 household 단위
-- 비공개가 아니라) 공개 버킷으로 만든다. 경로 규칙: {user_id}/avatar.jpg — 사용자당 파일 하나만
-- 유지하고 재업로드 시 upsert로 덮어쓴다.
--
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 한 번 실행.
-- 버킷/정책이 이미 있으면 건너뛰므로 여러 번 실행해도 안전함.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- upload(..., { upsert: true })로 같은 경로에 다시 올릴 때는 update 정책도 필요함
drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
