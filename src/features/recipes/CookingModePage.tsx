import { useEffect, useRef, useState } from 'react';
import { useStoredImage } from '../../data/imageStore';
import { useAutoStartTimer } from '../../data/cookingModeSettings';
import type { CookingLogStepTiming, Recipe, RecipeStep } from '../../data/types';

// SpeechRecognition은 표준 lib.dom.d.ts에 타입이 없는 비표준 API(Chrome/Safari가
// webkitSpeechRecognition으로 구현)라 여기서 필요한 부분만 최소로 선언해서 쓴다.
interface MinimalSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => MinimalSpeechRecognition;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** iOS Safari는 PWA로 설치된(standalone) 상태에서 SpeechRecognition이 동작하지 않는 알려진
 * 문제가 있음 — pushNotifications.ts의 iOS 감지와 같은 방식(UA + standalone 여부). 이 경우
 * 화면 탭 버튼(◀이전/다음▶/타이머/종료)이 유일한 조작 수단이 되므로 항상 노출돼야 한다. */
function isIosStandalonePwa(): boolean {
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!isIos) return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatSpokenDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}초`;
  if (seconds === 0) return `${minutes}분`;
  return `${minutes}분 ${seconds}초`;
}

function buildStepAnnouncement(step: RecipeStep, index: number, total: number, autoStarting: boolean): string {
  const parts = [`${index + 1}단계.`, step.title, step.content];
  if (step.timerSeconds) {
    parts.push(
      autoStarting
        ? `이 단계는 ${formatSpokenDuration(step.timerSeconds)} 타이머가 자동으로 시작돼요.`
        : `이 단계는 ${formatSpokenDuration(step.timerSeconds)} 타이머가 있어요.`,
    );
  }
  if (index === total - 1) parts.push('마지막 단계예요.');
  return parts.join(' ');
}

type Command = 'next' | 'prev' | 'startTimer' | 'stopTimer' | 'resetTimer' | 'remaining' | 'stop';

// 요리 중엔 주변이 시끄럽거나 가족과 대화하다가 "다음"/"완료"/"시작" 같은 흔한 단어가 우연히
// 섞여 들어갈 수 있어서, 짧은 한 단어가 아니라 2어절 이상의 조합으로만 명령을 인식한다(오작동
// 방지). 같은 의도의 다양한 표현은 넓게 받아준다. 매칭은 완전 일치가 아니라 포함 여부이고,
// 공백 유무 차이(STT가 "다음단계"/"다음 단계"를 다르게 뱉을 수 있음)를 흡수하기 위해 공백을
// 지운 뒤 비교한다.
const COMMAND_PHRASES: Record<Command, string[]> = {
  stop: ['요리 끝', '그만할래', '요리 종료'],
  remaining: ['얼마나 남았', '몇 분 남았', '시간 얼마나'],
  resetTimer: ['타이머 초기화', '타이머 리셋'],
  stopTimer: ['타이머 멈춰', '타이머 정지', '잠깐 멈춰'],
  startTimer: ['타이머 시작', '타이머 켜', '시간 재', '타이머 다시', '이어서'],
  next: ['다음 단계', '다음으로', '넘어가', '다음 거'],
  prev: ['이전 단계', '뒤로 가', '앞으로 돌아가'],
};
const COMMAND_ORDER: Command[] = ['stop', 'remaining', 'resetTimer', 'stopTimer', 'startTimer', 'next', 'prev'];

/** 요리 모드 화면에 참고용으로 보여주는 명령어 예시 — COMMAND_PHRASES의 대표 문구 하나씩. */
const COMMAND_EXAMPLES = [
  '다음 단계',
  '이전 단계',
  '타이머 시작',
  '타이머 다시',
  '타이머 멈춰',
  '타이머 초기화',
  '얼마나 남았어',
  '요리 종료',
];

function stripSpaces(text: string): string {
  return text.replace(/\s+/g, '');
}

function matchCommand(text: string): Command | null {
  const normalized = stripSpaces(text);
  for (const command of COMMAND_ORDER) {
    if (COMMAND_PHRASES[command].some((phrase) => normalized.includes(stripSpaces(phrase)))) return command;
  }
  return null;
}

/**
 * "🍳 요리 시작하기"로 들어오는 전체화면 핸즈프리 요리 안내 모드. 폰을 세워두고 보는 용도라
 * 큰 글씨/버튼 위주로 단순하게 디자인함(기존 디자인 시스템 색상/톤은 그대로, 레이아웃만 이 화면
 * 전용 `.cooking-mode-*` 클래스 사용).
 *
 * 음성은 "가능한 환경에서 더 편하게" 쓰는 보조 수단이고, 화면 탭(◀이전/다음▶/타이머/종료)은
 * "모든 환경에서 항상 가능한" 기본 수단이다 — iOS Safari는 PWA로 설치된 상태에서 음성 인식
 * 자체가 애플 제약으로 동작하지 않는 알려진 문제가 있어서, 그 경우 화면 탭만 유일한 수단이
 * 된다. 그래서 탭 버튼은 음성 지원 여부와 무관하게 항상 노출된다.
 *
 * 마이크는 처음 켤 때만 탭이 필요하고(브라우저 정책상 사용자 제스처 필요) 이후에는 명령마다
 * 다시 누를 필요 없이 계속 듣는다(요리 중 손을 안 대는 게 컨셉).
 */
export function CookingModePage({
  recipe,
  onExit,
  onFinish,
}: {
  recipe: Recipe;
  onExit: () => void;
  onFinish: (stepTimings: CookingLogStepTiming[]) => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [timerRemaining, setTimerRemaining] = useState<number | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [listening, setListening] = useState(false);
  const [lastHeard, setLastHeard] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const recognitionRef = useRef<MinimalSpeechRecognition | null>(null);
  // 손을 아예 안 대는 게 컨셉이라 마이크는 한 번 켜면 명령마다 다시 누를 필요 없이 계속 듣는다
  // (keepListeningRef). 음성 안내가 나오는 동안은 마이크를 잠깐 꺼서(pausedForSpeechRef) 스피커
  // 소리를 자기 마이크가 듣고 "타이머 시작"/"다음" 같은 명령으로 착각해 스스로 재실행하는 걸 막는다.
  const keepListeningRef = useRef(false);
  const pausedForSpeechRef = useRef(false);
  // 현재 단계의 준비/조리 시간 측정 draft — 타이머가 실제로 "처음" 시작된 시점(timerStartedAt)을
  // 기준으로 진입~시작을 prep, 시작~이탈(활성 시간만, 일시정지 제외)을 cook으로 나눈다.
  // cookElapsedSeconds는 카운트다운 tick에서만 증가시켜서 일시정지 구간이 섞이지 않게 한다.
  const timingDraftRef = useRef<{
    stepIndex: number;
    plannedSeconds: number;
    enteredAt: number;
    timerStartedAt: number | null;
    cookElapsedSeconds: number;
  } | null>(null);
  const sessionTimingsRef = useRef<CookingLogStepTiming[]>([]);

  const autoStartTimer = useAutoStartTimer();
  const steps = recipe.steps;
  const currentStep = steps[stepIndex] as RecipeStep | undefined;
  const isLastStep = stepIndex === steps.length - 1;
  const imageUrl = useStoredImage(currentStep?.imageId);

  const micCtor = getSpeechRecognitionCtor();
  const micBlockedByIos = isIosStandalonePwa();
  const micSupported = Boolean(micCtor) && !micBlockedByIos;

  // 화면이 자동으로 꺼지지 않게 유지 — 지원 안 되는 브라우저는 조용히 무시. 탭 전환 등으로
  // 브라우저가 자동 해제한 경우 다시 화면이 보이면 재요청한다(Wake Lock 표준 동작).
  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null;
    async function acquire() {
      try {
        if ('wakeLock' in navigator) {
          sentinel = await navigator.wakeLock.request('screen');
        }
      } catch {
        // 지원 안 되거나 요청 실패해도 기능 저하 없이 계속 진행
      }
    }
    acquire();
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') acquire();
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      sentinel?.release().catch(() => {});
    };
  }, []);

  // 단계가 바뀔 때마다 TTS로 안내하고, 이전 단계의 타이머 상태는 초기화한다. "타이머 자동 시작"이
  // 켜져 있고 이 단계에 타이머가 있으면 안내 문구에 자동 시작을 언급하고 바로 시작한다(별도
  // announce 호출을 또 하면 speechSynthesis.cancel()이 앞선 안내를 끊어버리므로 한 번에 합침).
  // 토글은 다음 단계부터 적용되며, 지금 보고 있는 단계에는 소급 적용하지 않는다(deps에 stepIndex만).
  useEffect(() => {
    if (!currentStep) return;
    timingDraftRef.current = {
      stepIndex,
      plannedSeconds: currentStep.timerSeconds ?? 0,
      enteredAt: Date.now(),
      timerStartedAt: null,
      cookElapsedSeconds: 0,
    };
    const shouldAutoStart = autoStartTimer && Boolean(currentStep.timerSeconds);
    announce(buildStepAnnouncement(currentStep, stepIndex, steps.length, shouldAutoStart));
    if (shouldAutoStart) {
      setTimerRemaining(currentStep.timerSeconds!);
      setTimerRunning(true);
      timingDraftRef.current.timerStartedAt = Date.now();
    } else {
      setTimerRemaining(null);
      setTimerRunning(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  // 타이머 카운트다운 — tick마다 draft.cookElapsedSeconds도 같이 늘려서, 일시정지된 구간은
  // (이 tick 자체가 안 돌므로) 조리 시간 측정에 안 섞이게 한다.
  useEffect(() => {
    if (!timerRunning || timerRemaining === null) return;
    if (timerRemaining <= 0) {
      setTimerRunning(false);
      setTimerRemaining(null);
      announce('타이머가 끝났어요.');
      return;
    }
    const timeout = setTimeout(() => {
      setTimerRemaining((r) => (r ?? 0) - 1);
      if (timingDraftRef.current) timingDraftRef.current.cookElapsedSeconds += 1;
    }, 1000);
    return () => clearTimeout(timeout);
  }, [timerRunning, timerRemaining]);

  useEffect(() => {
    if (finished) announce('요리를 완성했어요! 수고하셨어요.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  useEffect(() => {
    return () => {
      keepListeningRef.current = false;
      window.speechSynthesis?.cancel();
      recognitionRef.current?.stop();
    };
  }, []);

  /** TTS 안내 — 마이크가 계속 듣는 중이면(keepListeningRef) 말하는 동안만 잠깐 멈췄다가
   * 말이 끝나면 자동으로 다시 듣기 시작한다(자기 목소리를 스스로 명령으로 착각하는 것 방지). */
  function announce(text: string) {
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    if (keepListeningRef.current) {
      pausedForSpeechRef.current = true;
      recognitionRef.current?.stop();
      utterance.onend = () => {
        pausedForSpeechRef.current = false;
        if (keepListeningRef.current) recognitionRef.current?.start();
      };
    }
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  /** 지금 단계를 떠나기 직전 준비/조리 시간을 확정해서 세션 기록에 남긴다("다음 단계"는 무조건
   * 현재 타이머를 정지하고 넘어가므로 여기서 한 번만 계산하면 됨). 뒤로 가기(goPrev)는 호출하지
   * 않음 — 그 단계는 아직 안 끝난 것으로 보고, 나중에 다시 진입하면 draft가 새로 초기화된다. */
  function finalizeCurrentStepTiming() {
    const draft = timingDraftRef.current;
    if (!draft) return;
    const hadTimer = draft.timerStartedAt !== null;
    sessionTimingsRef.current.push({
      recipeId: recipe.id,
      stepIndex: draft.stepIndex,
      plannedSeconds: draft.plannedSeconds,
      prepSeconds: hadTimer ? Math.round((draft.timerStartedAt! - draft.enteredAt) / 1000) : 0,
      cookSeconds: hadTimer ? draft.cookElapsedSeconds : Math.round((Date.now() - draft.enteredAt) / 1000),
      hadTimer,
    });
    timingDraftRef.current = null;
  }

  function goNext() {
    finalizeCurrentStepTiming();
    if (isLastStep) {
      setFinished(true);
      return;
    }
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  function goPrev() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  function startTimer() {
    if (!currentStep?.timerSeconds) return;
    const isResume = timerRemaining !== null;
    if (!isResume) {
      setTimerRemaining(currentStep.timerSeconds);
      if (timingDraftRef.current) timingDraftRef.current.timerStartedAt = Date.now();
    }
    setTimerRunning(true);
    announce(isResume ? '타이머를 다시 시작할게요.' : '타이머를 시작할게요.');
  }

  function pauseTimer() {
    if (timerRunning) {
      setTimerRunning(false);
      announce('타이머를 멈췄어요.');
    } else {
      announce('지금 실행 중인 타이머가 없어요.');
    }
  }

  /** 진행 중이던 시간을 버리고 처음(시작 전) 상태로 되돌린다 — 다음 "타이머 시작"은 이어서
   * 재개하지 않고 전체 시간부터 새로 센다(startTimer의 isResume 분기 참고). 측정 draft도 같이
   * 초기화해서 이번에 재는 조리 시간에 초기화 이전 구간이 섞이지 않게 한다. */
  function resetTimer() {
    if (!currentStep?.timerSeconds) return;
    setTimerRunning(false);
    setTimerRemaining(null);
    if (timingDraftRef.current) {
      timingDraftRef.current.timerStartedAt = null;
      timingDraftRef.current.cookElapsedSeconds = 0;
    }
    announce('타이머를 초기화했어요.');
  }

  function announceRemaining() {
    if (timerRunning && timerRemaining !== null) {
      announce(`${formatSpokenDuration(timerRemaining)} 남았어요.`);
    } else {
      announce('지금 실행 중인 타이머가 없어요.');
    }
  }

  function confirmExit() {
    if (confirm('요리 모드를 종료할까요?')) onExit();
  }

  function handleCommand(command: Command) {
    if (command === 'next') goNext();
    else if (command === 'prev') goPrev();
    else if (command === 'startTimer') startTimer();
    else if (command === 'stopTimer') pauseTimer();
    else if (command === 'resetTimer') resetTimer();
    else if (command === 'remaining') announceRemaining();
    else if (command === 'stop') confirmExit();
  }

  /** 한 번 켜면(첫 실행은 브라우저 정책상 사용자 탭이 필요) 계속 듣는다 — 명령을 말할 때마다
   * 다시 누를 필요 없음. 인식이 한 번 끝나면(onend) keepListeningRef가 true인 한 자동으로
   * 다시 시작해서 계속 대기 상태를 유지한다. */
  function startRecognition() {
    if (!micCtor) return;
    const recognition = new micCtor();
    recognition.lang = 'ko-KR';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      setLastHeard(transcript);
      const command = matchCommand(transcript);
      if (command) handleCommand(command);
      else announce('다시 말씀해주시겠어요?');
    };
    recognition.onerror = () => {
      // 권한 거부 등은 onend가 뒤이어 호출되므로 재시작 여부는 onend에서 최종 판단한다.
    };
    recognition.onend = () => {
      if (pausedForSpeechRef.current) return; // TTS가 재시작을 담당(announce의 utterance.onend)
      if (keepListeningRef.current) {
        setTimeout(() => {
          if (keepListeningRef.current && !pausedForSpeechRef.current) recognitionRef.current?.start();
        }, 250);
      } else {
        setListening(false);
      }
    };
    recognitionRef.current = recognition;
    recognition.start();
  }

  function toggleListening() {
    if (!micCtor) return;
    if (keepListeningRef.current) {
      keepListeningRef.current = false;
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    keepListeningRef.current = true;
    setListening(true);
    startRecognition();
  }

  if (!currentStep) {
    return (
      <div className="cooking-mode-overlay">
        <p>이 레시피에는 조리 단계가 없어요.</p>
        <button className="btn" onClick={onExit}>
          닫기
        </button>
      </div>
    );
  }

  return (
    <div className="cooking-mode-overlay">
      <div className="row">
        <span className="cooking-mode-progress">
          {finished ? '완료' : `${stepIndex + 1}/${steps.length}단계`}
        </span>
        <button className="btn small" onClick={confirmExit}>
          ✕ 종료
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {finished ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginTop: 24 }}>
            <h1 className="cooking-mode-title">🎉 요리 완료!</h1>
            <p className="cooking-mode-content">수고하셨어요!</p>
            <button className="btn primary cooking-mode-timer-btn" onClick={() => onFinish(sessionTimingsRef.current)}>
              🍳 오늘 만들었어요
            </button>
            <button className="btn" onClick={confirmExit}>
              나중에 기록할게요
            </button>
          </div>
        ) : (
          <>
            {imageUrl && <img src={imageUrl} alt={currentStep.title} className="cooking-mode-image" />}
            <h1 className="cooking-mode-title">{currentStep.title}</h1>
            <p className="cooking-mode-content">{currentStep.content}</p>

            {currentStep.timerSeconds != null && (
              <div style={{ textAlign: 'center' }}>
                {timerRemaining !== null ? (
                  <>
                    <div className="cooking-mode-timer">{formatCountdown(timerRemaining)}</div>
                    <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
                      <button className="btn small" onClick={timerRunning ? pauseTimer : startTimer}>
                        {timerRunning ? '⏸ 멈춤' : '▶ 다시 시작'}
                      </button>
                      <button className="btn small" onClick={resetTimer}>
                        ↺ 초기화
                      </button>
                    </div>
                  </>
                ) : (
                  <button className="btn cooking-mode-timer-btn" onClick={startTimer}>
                    ⏱ 타이머 시작 ({formatCountdown(currentStep.timerSeconds)})
                  </button>
                )}
              </div>
            )}

            {micSupported && (
              <div className="card" style={{ marginTop: 16 }}>
                <p className="text-muted" style={{ fontSize: 12, marginBottom: 4 }}>
                  🎙️ 음성 명령어 예시 (설정 → 요리 모드에서 타이머 자동 시작도 켤 수 있어요)
                </p>
                <p className="text-muted" style={{ fontSize: 12 }}>
                  {COMMAND_EXAMPLES.map((phrase) => `"${phrase}"`).join(' · ')}
                </p>
              </div>
            )}

            {micBlockedByIos && (
              <p className="text-muted" style={{ textAlign: 'center', marginTop: 16 }}>
                이 화면은 Safari 브라우저에서 직접 열면 음성 명령을 쓸 수 있어요.
              </p>
            )}
            {!micSupported && !micBlockedByIos && (
              <p className="text-muted" style={{ textAlign: 'center', marginTop: 16 }}>
                이 기기에서는 음성 명령이 지원되지 않아요. 화면을 탭해서 진행해주세요.
              </p>
            )}
            {micSupported && (
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <button
                  className={`cooking-mode-mic ${listening ? 'listening' : ''}`}
                  onClick={toggleListening}
                  aria-label="음성 명령"
                >
                  🎤
                </button>
                <p className="text-muted" style={{ marginTop: 6 }}>
                  {listening ? '계속 듣고 있어요 · 눌러서 끄기' : '눌러서 음성 명령 켜기'}
                </p>
                {lastHeard && (
                  <p className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                    들은 말: "{lastHeard}"
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {!finished && (
        <div className="cooking-mode-nav">
          <button className="btn" onClick={goPrev} disabled={stepIndex === 0}>
            ◀ 이전
          </button>
          <button className="btn primary" onClick={goNext}>
            {isLastStep ? '완료 ▶' : '다음 ▶'}
          </button>
        </div>
      )}
    </div>
  );
}
