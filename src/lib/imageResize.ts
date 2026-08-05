// 영수증 사진(모바일 카메라 촬영본)은 수 MB에 달할 수 있어, AI 호출 전에 적당한 크기로 줄여서
// 보낸다 — 글자만 읽으면 되는 용도라 인식 정확도에 큰 영향 없이 전송량/응답 시간을 줄일 수 있고,
// 서버리스 함수의 요청 본문 크기 제한도 여유 있게 피할 수 있다.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

export interface ResizedImage {
  /** data: 접두사를 뗀 순수 base64 데이터 — Gemini inlineData.data에 그대로 전달 */
  base64: string;
  mimeType: string;
  /** 화면 미리보기 표시용 */
  dataUrl: string;
}

export function resizeImageForUpload(file: File): Promise<ResizedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('파일을 읽지 못했습니다.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'));
      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('이미지를 처리할 수 없습니다.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        const base64 = dataUrl.split(',')[1] ?? '';
        resolve({ base64, mimeType: 'image/jpeg', dataUrl });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
