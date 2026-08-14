import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

// 조리 단계/완성 사진은 household 구성원끼리 기기가 달라도 같이 봐야 해서(household 공유
// 데이터) Supabase Storage에 저장한다(예전 IndexedDB는 기기 로컬 저장소라 공유가 안 됐음).
// RecipeStep.imageId / Recipe.finalImageId는 이 Storage 버킷 안의 경로(문자열)를 가리킨다.
const BUCKET = 'recipe-images';
// 화면이 열려있는 동안 충분한 정도로만 유효한 signed URL(비공개 버킷이라 공개 URL 대신 필요).
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export type ImageKind = 'step' | 'final' | 'log';

/** 새 이미지를 저장할 Storage 경로를 만든다: household_id/recipe_id/step_또는_final/파일명 */
export function buildImagePath(householdId: string, recipeId: string, kind: ImageKind): string {
  return `${householdId}/${recipeId}/${kind}/${crypto.randomUUID()}`;
}

/**
 * imageId가 지금 Storage 경로 형식(household_id/recipe_id/kind/파일명)인지 확인한다.
 * 이 마이그레이션 이전(IndexedDB 시절)에 저장된 imageId는 폴더 구조 없는 단일 UUID라 슬래시가
 * 없음 — 그런 값은 새 Storage에 실제로 존재하지 않으므로(마이그레이션 안 함) 재사용하면 안 되고,
 * "다시 생성"/재업로드 시 새 경로로 교체해야 한다(재사용하면 household_id 세그먼트가 없어서
 * household 단위 RLS 검사를 통과하지 못해 업로드 자체가 거부됨).
 */
export function isStorageImagePath(imageId?: string): imageId is string {
  return Boolean(imageId && imageId.includes('/'));
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mimeType = header.match(/data:(.*);base64/)?.[1] ?? 'image/png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

/** path(=imageId)가 가리키는 위치에 dataUrl(base64) 이미지를 업로드한다(같은 경로면 덮어씀 — 재생성용). */
export async function saveImage(path: string, dataUrl: string): Promise<void> {
  const blob = dataUrlToBlob(dataUrl);
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type,
    upsert: true,
  });
  if (error) throw error;
}

/**
 * 다른 household(공개 레시피)의 이미지를 실제로 다운로드해서 내 household 경로에 다시
 * 업로드한다(참조만 유지하면 원본이 나중에 삭제되거나 비공개로 바뀔 때 같이 깨지므로 —
 * "내 레시피로 복사하기"는 이미지까지 완전히 복사해야 함). 원본 경로는 recipe-images
 * 버킷의 `recipe_images_select_via_public_recipe` 정책(공개 레시피 참조 시 다운로드 허용)
 * 덕분에 다른 household 소유여도 읽을 수 있다.
 */
export async function copyImage(
  sourcePath: string,
  householdId: string,
  recipeId: string,
  kind: ImageKind,
): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).download(sourcePath);
  if (error) throw error;
  const newPath = buildImagePath(householdId, recipeId, kind);
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(newPath, data, {
    contentType: data.type || 'image/png',
    upsert: true,
  });
  if (uploadError) throw uploadError;
  return newPath;
}

/**
 * 외부 URL(예: 유튜브 썸네일 프록시 `/api/youtube-thumbnail`)에서 이미지를 받아와 내 household
 * 경로에 저장한다. 외부 URL을 그대로 imageId에 저장하지 않는 이유: 나중에 그 URL이 깨지거나
 * 바뀌면 이미지가 같이 사라지므로, 우리 Storage로 실제 복사해서 독립적으로 유지한다.
 */
export async function saveImageFromUrl(
  sourceUrl: string,
  householdId: string,
  recipeId: string,
  kind: ImageKind,
  headers?: HeadersInit,
): Promise<string> {
  const res = await fetch(sourceUrl, headers ? { headers } : undefined);
  if (!res.ok) throw new Error('이미지를 가져오지 못했습니다.');
  const blob = await res.blob();
  const newPath = buildImagePath(householdId, recipeId, kind);
  const { error } = await supabase.storage.from(BUCKET).upload(newPath, blob, {
    contentType: blob.type || 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
  return newPath;
}

async function getImageUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) {
    console.error('이미지 URL 생성 실패:', error.message);
    return null;
  }
  return data.signedUrl;
}

export async function deleteImage(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

/** imageId(=Storage 경로)가 가리키는 이미지를 signed URL로 비동기 로드(없거나 로딩 전이면 null). */
export function useStoredImage(imageId?: string): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isStorageImagePath(imageId)) {
      // imageId가 없거나 마이그레이션 이전의 낡은 형식(슬래시 없는 단일 UUID)이면 Storage에
      // 실제로 존재하지 않으므로 조회 시도 자체를 생략한다(불필요한 404 방지).
      setUrl(null);
      return;
    }
    let cancelled = false;
    setUrl(null);
    getImageUrl(imageId).then((result) => {
      if (!cancelled) setUrl(result);
    });
    return () => {
      cancelled = true;
    };
  }, [imageId]);

  return url;
}
