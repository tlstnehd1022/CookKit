import { formatSpokenDuration } from './cookingVoiceCommands';

/** 요리 모드 음성 안내의 말투 — 레시피 자체의 제목/본문 텍스트는 그대로 두고(사용자가 쓴 내용),
 * 앱이 붙이는 부가 안내 문구(타이머, 단계 전환, 완료 등)만 톤을 바꾼다. */
export type AnnouncementTone = 'formal' | 'friendly';

/** 복합 요리(MultiCookModePage)는 타이머가 여러 개 동시에 돌 수 있어 "어느 레시피의 타이머인지"를
 * 문구 앞에 붙인다(recipeName) — 단일 요리 모드에서는 생략(undefined). */
function timerSubject(recipeName?: string): string {
  return recipeName ? `${recipeName} 타이머` : '타이머';
}

export function phraseStepPrefix(tone: AnnouncementTone, index: number): string {
  return tone === 'friendly' ? `자, ${index + 1}번째예요.` : `${index + 1}단계입니다.`;
}

export function phraseMultiStepPrefix(tone: AnnouncementTone, recipeName: string): string {
  return tone === 'friendly' ? `${recipeName}, 이거 볼까요?` : `${recipeName}입니다.`;
}

export function phraseLastStep(tone: AnnouncementTone): string {
  return tone === 'friendly' ? '이제 마지막이에요!' : '마지막 단계입니다.';
}

export function phraseTimerAutoStart(tone: AnnouncementTone, seconds: number): string {
  const duration = formatSpokenDuration(seconds);
  return tone === 'friendly'
    ? `${duration} 타이머 바로 켜드릴게요.`
    : `이 단계는 ${duration} 타이머가 자동으로 시작됩니다.`;
}

export function phraseTimerAvailable(tone: AnnouncementTone, seconds: number): string {
  const duration = formatSpokenDuration(seconds);
  return tone === 'friendly' ? `${duration} 타이머가 있어요.` : `이 단계는 ${duration} 타이머가 있습니다.`;
}

export function phraseFinished(tone: AnnouncementTone): string {
  return tone === 'friendly' ? '다 됐어요! 잘했어요!' : '요리를 완성했습니다. 수고하셨습니다.';
}

export function phraseMultiFinished(tone: AnnouncementTone): string {
  return tone === 'friendly' ? '다 됐어요! 오늘도 잘했어요!' : '모든 레시피를 완성했습니다. 수고하셨습니다.';
}

export function phraseTimerStart(tone: AnnouncementTone, isResume: boolean, recipeName?: string): string {
  const subject = timerSubject(recipeName);
  if (isResume) return tone === 'friendly' ? `${subject} 다시 시작할게요!` : `${subject}를 다시 시작합니다.`;
  return tone === 'friendly' ? `${subject} 시작할게요!` : `${subject}를 시작합니다.`;
}

export function phraseTimerPause(tone: AnnouncementTone, recipeName?: string): string {
  const subject = timerSubject(recipeName);
  return tone === 'friendly' ? `${subject} 잠깐 멈췄어요.` : `${subject}를 멈췄습니다.`;
}

export function phraseTimerReset(tone: AnnouncementTone, recipeName?: string): string {
  const subject = timerSubject(recipeName);
  return tone === 'friendly' ? `${subject} 처음부터 다시 잴게요.` : `${subject}를 초기화했습니다.`;
}

export function phraseTimerRemaining(tone: AnnouncementTone, seconds: number, recipeName?: string): string {
  const subject = timerSubject(recipeName);
  const duration = formatSpokenDuration(seconds);
  return tone === 'friendly' ? `${subject} ${duration} 남았어요!` : `${subject} ${duration} 남았습니다.`;
}

export function phraseTimerDone(tone: AnnouncementTone, recipeName?: string): string {
  const subject = timerSubject(recipeName);
  return tone === 'friendly' ? `땡! ${subject} 끝났어요.` : `${subject}가 끝났습니다.`;
}

export function phraseNoActiveTimer(tone: AnnouncementTone): string {
  return tone === 'friendly' ? '지금은 도는 타이머가 없어요.' : '지금 실행 중인 타이머가 없습니다.';
}

export function phraseNoStartableTimer(tone: AnnouncementTone): string {
  return tone === 'friendly' ? '지금은 시작할 타이머가 없어요.' : '지금 시작할 수 있는 타이머가 없습니다.';
}

export function phraseNoResettableTimer(tone: AnnouncementTone): string {
  return tone === 'friendly' ? '초기화할 타이머가 없어요.' : '초기화할 타이머가 없습니다.';
}

export function phraseAskRepeat(tone: AnnouncementTone): string {
  return tone === 'friendly' ? '어? 다시 한 번 말해줄래요?' : '다시 말씀해 주시겠습니까?';
}
