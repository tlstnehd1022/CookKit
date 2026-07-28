-- ============================================================================
-- 0008_public_recipe_images_storage.sql — 공개 레시피 이미지 복사를 위한 Storage RLS 보완
-- ============================================================================
-- 배경: "내 레시피로 복사하기"는 원본의 조리 단계 이미지/완성 사진을 실제로 다운로드해서
-- 내 household 경로에 다시 업로드해야 함(참조만 유지하면 원본이 삭제/비공개로 바뀔 때 같이
-- 깨지므로 — CLAUDE.md 요구사항). 그런데 recipe-images 버킷의 기존 RLS(0006)는 "같은
-- household 멤버만" 읽기 허용이라, 다른 household의 공개 레시피 이미지는 (레시피 자체는
-- 공개로 보여도) 다운로드가 막혀 있었음. 이 마이그레이션은 "공개 레시피가 참조하는 이미지는
-- 다운로드(SELECT)만 추가로 허용"한다(업로드/삭제는 여전히 household 멤버 전용).
--
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 한 번 실행.
-- ============================================================================

drop policy if exists "recipe_images_select_via_public_recipe" on storage.objects;
create policy "recipe_images_select_via_public_recipe" on storage.objects
  for select using (
    bucket_id = 'recipe-images'
    and exists (
      select 1 from public.recipes r
      where r.id = ((storage.foldername(name))[2])::uuid
        and r.is_public = true
    )
  );
