import { extractYoutubeVideoId } from './youtubeTranscript.js';
import { extractInstagramPostId } from './instagramTranscript.js';

export type LinkPlatform = 'youtube' | 'instagram';

/** "링크로 만들기" 탭에 입력된(또는 공유하기로 받은) URL이 어느 플랫폼인지 감지한다 — 화면
 * 문구/아이콘 전환과 어느 변환 API를 호출할지 분기하는 데 쓴다. */
export function detectLinkPlatform(url: string): LinkPlatform | null {
  if (extractYoutubeVideoId(url)) return 'youtube';
  if (extractInstagramPostId(url)) return 'instagram';
  return null;
}
