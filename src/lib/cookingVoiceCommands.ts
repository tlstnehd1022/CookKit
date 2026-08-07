// 요리 모드(1개 레시피/여러 레시피)가 공유하는 음성 관련 순수 유틸 — SpeechRecognition 최소 타입,
// iOS PWA 감지, 시간 포맷, 명령어 문구/매칭. CookingModePage.tsx와 MultiCookModePage.tsx 둘 다 이
// 파일을 참조해서 같은 명령어 세트/포맷을 공유한다.

// SpeechRecognition은 표준 lib.dom.d.ts에 타입이 없는 비표준 API(Chrome/Safari가
// webkitSpeechRecognition으로 구현)라 여기서 필요한 부분만 최소로 선언해서 쓴다.
export interface MinimalSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}
export type SpeechRecognitionCtor = new () => MinimalSpeechRecognition;

export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** iOS Safari는 PWA로 설치된(standalone) 상태에서 SpeechRecognition이 동작하지 않는 알려진
 * 문제가 있음 — pushNotifications.ts의 iOS 감지와 같은 방식(UA + standalone 여부). 이 경우
 * 화면 탭 버튼이 유일한 조작 수단이 되므로 항상 노출돼야 한다. */
export function isIosStandalonePwa(): boolean {
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!isIos) return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

export function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatSpokenDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}초`;
  if (seconds === 0) return `${minutes}분`;
  return `${minutes}분 ${seconds}초`;
}

export function stripSpaces(text: string): string {
  return text.replace(/\s+/g, '');
}

export type Command = 'next' | 'prev' | 'startTimer' | 'stopTimer' | 'resetTimer' | 'remaining' | 'stop';

// 요리 중엔 주변이 시끄럽거나 가족과 대화하다가 "다음"/"완료"/"시작" 같은 흔한 단어가 우연히
// 섞여 들어갈 수 있어서, 짧은 한 단어가 아니라 2어절 이상의 조합으로만 명령을 인식한다(오작동
// 방지). 같은 의도의 다양한 표현은 넓게 받아준다. 매칭은 완전 일치가 아니라 포함 여부이고,
// 공백 유무 차이(STT가 "다음단계"/"다음 단계"를 다르게 뱉을 수 있음)를 흡수하기 위해 공백을
// 지운 뒤 비교한다.
export const COMMAND_PHRASES: Record<Command, string[]> = {
  stop: ['요리 끝', '그만할래', '요리 종료'],
  remaining: ['얼마나 남았', '몇 분 남았', '시간 얼마나'],
  resetTimer: ['타이머 초기화', '타이머 리셋'],
  stopTimer: ['타이머 멈춰', '타이머 정지', '잠깐 멈춰'],
  startTimer: ['타이머 시작', '타이머 켜', '시간 재', '타이머 다시', '이어서'],
  next: ['다음 단계', '다음으로', '넘어가', '다음 거'],
  prev: ['이전 단계', '뒤로 가', '앞으로 돌아가'],
};
export const COMMAND_ORDER: Command[] = ['stop', 'remaining', 'resetTimer', 'stopTimer', 'startTimer', 'next', 'prev'];

/** 요리 모드 화면에 참고용으로 보여주는 명령어 예시 — COMMAND_PHRASES의 대표 문구 하나씩. */
export const COMMAND_EXAMPLES = [
  '다음 단계',
  '이전 단계',
  '타이머 시작',
  '타이머 다시',
  '타이머 멈춰',
  '타이머 초기화',
  '얼마나 남았어',
  '요리 종료',
];

export function matchCommand(text: string): Command | null {
  const normalized = stripSpaces(text);
  for (const command of COMMAND_ORDER) {
    if (COMMAND_PHRASES[command].some((phrase) => normalized.includes(stripSpaces(phrase)))) return command;
  }
  return null;
}

/**
 * 복합 요리(여러 레시피 동시 진행)에서 "스프 타이머 멈춰"처럼 레시피 이름이 같이 들리면 그
 * 레시피를 대상으로 판단한다. 레시피 이름 전체를 다 말하긴 번거로우니, 이름의 마지막 2글자
 * (한국 요리 이름은 보통 "-스프"/"-파스타"/"-스테이크"처럼 종류를 나타내는 말로 끝나는 경우가
 * 많음)와 공백으로 나눈 각 단어(2글자 이상)도 키워드로 인정한다. 정확히 하나의 레시피만
 * 걸리면 그 레시피, 여러 개거나 하나도 없으면 null(호출부가 "현재 단계 레시피"로 기본 처리).
 */
export function detectTargetRecipeId(text: string, recipes: { id: string; name: string }[]): string | null {
  const normalized = stripSpaces(text);
  const matched = recipes.filter((recipe) => {
    const name = recipe.name.trim();
    const keywords = new Set<string>([name]);
    for (const word of name.split(/\s+/)) {
      if (word.length >= 2) keywords.add(word);
    }
    if (name.length >= 2) keywords.add(name.slice(-2));
    return Array.from(keywords).some((keyword) => normalized.includes(stripSpaces(keyword)));
  });
  return matched.length === 1 ? matched[0].id : null;
}
