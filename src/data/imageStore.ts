import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

// 조리 단계/완성 사진은 household 구성원끼리 기기가 달라도 같이 봐야 해서(household 공유
// 데이터) Supabase Storage에 저장한다(예전 IndexedDB는 기기 로컬 저장소라 공유가 안 됐음).
// RecipeStep.imageId / Recipe.finalImageId는 이 Storage 버킷 안의 경로(문자열)를 가리킨다.
const BUCKET = 'recipe-images';
// 화면이 열려있는 동안 충분한 정도로만 유효한 signed URL(비공개 버킷이라 공개 URL 대신 필요).
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export type ImageKind = 'step' | 'final';

/** 새 이미지를 저장할 Storage 경로를 만든다: household_id/recipe_id/step_또는_final/파일명 */
export function buildImagePath(householdId: string, recipeId: string, kind: ImageKind): string {
  return `${householdId}/${recipeId}/${kind}/${crypto.randomUUID()}`;
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
    if (!imageId) {
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
