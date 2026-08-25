// ============================================================================
// scripts/compress-existing-images.ts
// ============================================================================
// recipe-images 버킷에 기존에 압축 없이 올라간 파일들(직접 업로드/AI 생성 이미지가
// resizeImageForUpload를 거치지 않고 저장되던 시절의 파일들, 최대 29MB까지 확인됨)을
// 일괄 재압축하는 1회성 스크립트. 앞으로 올라가는 이미지는 src/features/recipes/
// RecipeEditor.tsx 등에서 이미 resizeImageForUpload/resizeDataUrlForUpload를 거치도록
// 고쳤으니, 이 스크립트는 "이미 저장돼 있던" 파일만 대상으로 한다.
//
// 기준: 최대 변 1600px, JPEG 품질 0.82(브라우저 쪽 resizeImageForUpload와 동일한 기준).
// 이미 JPEG이고 가로/세로 둘 다 1600px 이하면 건너뛴다. 그 외(더 크거나 PNG 등)는
// sharp로 리사이즈+재인코딩해서 같은 경로에 upsert로 덮어쓴다.
//
// ⚠️ 되돌리기 어려운 작업(원본 파일을 같은 경로에 덮어씀) — 실행 전 원본 손실을 감수할
// 수 있는지 확인할 것.
//
// 실행 방법:
//   node --env-file=.env --experimental-strip-types scripts/compress-existing-images.ts
//
// 재실행 안전(idempotent): 이미 기준을 만족하는 파일은 매번 건너뛰므로 여러 번 돌려도
// 안전하다. 실패한 파일은 건너뛰고 계속 진행하며, 실패 목록은 마지막에 요약된다.
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const BUCKET = 'recipe-images';
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 82;

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY를 .env에 설정하세요.');
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface StorageFile {
  path: string;
  size: number;
}

async function listAllFiles(prefix: string): Promise<StorageFile[]> {
  let all: StorageFile[] = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
      limit,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const item of data) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) {
        all = all.concat(await listAllFiles(fullPath));
      } else {
        all.push({ path: fullPath, size: item.metadata?.size ?? 0 });
      }
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return all;
}

async function main() {
  console.log(`[${BUCKET}] 파일 목록 조회 중...`);
  const files = await listAllFiles('');
  console.log(`총 ${files.length}개 파일 발견`);

  let skipped = 0;
  let recompressed = 0;
  let totalBefore = 0;
  let totalAfter = 0;
  const failures: { path: string; reason: string }[] = [];

  for (const [i, file] of files.entries()) {
    try {
      const { data: blob, error: downloadError } = await supabase.storage.from(BUCKET).download(file.path);
      if (downloadError || !blob) throw downloadError ?? new Error('다운로드 실패');
      const original = Buffer.from(await blob.arrayBuffer());

      const metadata = await sharp(original).metadata();
      const maxSide = Math.max(metadata.width ?? 0, metadata.height ?? 0);
      const alreadyCompressed = metadata.format === 'jpeg' && maxSide > 0 && maxSide <= MAX_DIMENSION;

      if (alreadyCompressed) {
        skipped += 1;
        continue;
      }

      const resized = await sharp(original)
        .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY })
        .toBuffer();

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(file.path, resized, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;

      recompressed += 1;
      totalBefore += original.byteLength;
      totalAfter += resized.byteLength;
      console.log(
        `[${i + 1}/${files.length}] ${file.path}: ${(original.byteLength / 1024).toFixed(0)}KB → ${(resized.byteLength / 1024).toFixed(0)}KB`,
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      failures.push({ path: file.path, reason });
      console.error(`[실패] ${file.path}: ${reason}`);
    }
  }

  console.log('\n=== 완료 ===');
  console.log(`전체: ${files.length}개, 건너뜀(이미 기준 이하): ${skipped}개, 재압축: ${recompressed}개, 실패: ${failures.length}개`);
  console.log(
    `재압축 대상 용량: ${(totalBefore / 1024 / 1024).toFixed(1)}MB → ${(totalAfter / 1024 / 1024).toFixed(1)}MB (${(((totalBefore - totalAfter) / Math.max(totalBefore, 1)) * 100).toFixed(0)}% 감소)`,
  );
  if (failures.length > 0) {
    console.log('\n--- 실패 목록 ---');
    for (const f of failures) console.log(`${f.path}: ${f.reason}`);
  }
}

main();
