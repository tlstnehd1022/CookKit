-- ============================================================================
-- 0006_recipe_images_storage.sql — 조리 단계/완성 사진용 Storage 버킷 + RLS
-- ============================================================================
-- 배경: 조리 단계별 이미지/완성 사진을 기기 로컬 IndexedDB에 저장하던 걸 Supabase Storage로
-- 옮긴다(household 구성원끼리 다른 기기에서도 같은 이미지를 볼 수 있어야 하는데, IndexedDB는
-- 기기 로컬 저장소라 공유가 안 됐음). 경로 규칙: {household_id}/{recipe_id}/{step|final}/{파일명}
-- — 이 중 household_id만 RLS에서 검사한다(스펙: "같은 household 멤버 조회 가능, 업로드/삭제는
-- household 멤버 누구나" — 레시피 자체는 user 소유지만 사진은 household 단위로 공유).
--
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 한 번 실행.
-- 버킷/정책이 이미 있으면 건너뛰므로 여러 번 실행해도 안전함.
-- ============================================================================

-- 비공개 버킷(공개 URL로 누구나 접근 불가 — RLS로 household 멤버만 허용, signed URL로 조회)
insert into storage.buckets (id, name, public)
values ('recipe-images', 'recipe-images', false)
on conflict (id) do nothing;

drop policy if exists "recipe_images_select_household_member" on storage.objects;
create policy "recipe_images_select_household_member" on storage.objects
  for select using (
    bucket_id = 'recipe-images'
    and public.is_household_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "recipe_images_insert_household_member" on storage.objects;
create policy "recipe_images_insert_household_member" on storage.objects
  for insert with check (
    bucket_id = 'recipe-images'
    and public.is_household_member(((storage.foldername(name))[1])::uuid)
  );

-- upload(..., { upsert: true })로 같은 경로에 다시 생성(재생성)할 때는 update 정책도 필요함
drop policy if exists "recipe_images_update_household_member" on storage.objects;
create policy "recipe_images_update_household_member" on storage.objects
  for update using (
    bucket_id = 'recipe-images'
    and public.is_household_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "recipe_images_delete_household_member" on storage.objects;
create policy "recipe_images_delete_household_member" on storage.objects
  for delete using (
    bucket_id = 'recipe-images'
    and public.is_household_member(((storage.foldername(name))[1])::uuid)
  );
