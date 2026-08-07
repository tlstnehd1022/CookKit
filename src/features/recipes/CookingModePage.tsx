import { useEffect, useRef, useState } from 'react';
import { useStoredImage } from '../../data/imageStore';
import type { Recipe, RecipeStep } from '../../data/types';

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
 * 문제가 있음 — pushNotifications.ts의 iOS 감지와 같은 방식(UA + standalone 여부). */
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

function speak(text: string) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ko-KR';
  window.speechSynthesis.speak(utterance);
}

function buildStepAnnouncement(step: RecipeStep, index: number, total: number): string {
  const parts = [`${index + 1}단계.`, step.title, step.content];
  if (step.timerSeconds) parts.push(`이 단계는 ${formatSpokenDuration(step.timerSeconds)} 타이머가 있어요.`);
  if (index === total - 1) parts.push('마지막 단계예요.');
  return parts.join(' ');
}

type Command = 'next' | 'prev' | 'startTimer' | 'remaining' | 'stop';

function matchCommand(text: string): Command | null {
  if (text.includes('그만') || text.includes('종료')) return 'stop';
  if (text.includes('몇 분') || text.includes('얼마나')) return 'remaining';
  if (text.includes('타이머') && text.includes('시작')) return 'startTimer';
  if (text.includes('완료') || text.includes('끝났')) return 'next';
  if (text.includes('다음')) return 'next';
  if (text.includes('이전')) return 'prev';
  return null;
}

/**
 * "🍳 요리 시작하기"로 들어오는 전체화면 핸즈프리 요리 안내 모드. 폰을 세워두고 보는 용도라
 * 큰 글씨/버튼 위주로 단순하게 디자인함(기존 디자인 시스템 색상/톤은 그대로, 레이아웃만 이 화면
 * 전용 `.cooking-mode-*` 클래스 사용). TTS는 항상 켜져 있고, STT는 지원 여부에 따라 선택적으로
 * 노출되며 화면 탭 버튼은 항상 함께 제공된다(음성이 유일한 조작 수단이 되지 않도록).
 */
export function CookingModePage({ recipe, onExit }: { recipe: Recipe; onExit: () => void }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [timerRemaining, setTimerRemaining] = useState<number | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<MinimalSpeechRecognition | null>(null);

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

  // 단계가 바뀔 때마다 TTS로 안내하고, 이전 단계의 타이머 상태는 초기화한다.
  useEffect(() => {
    if (!currentStep) return;
    speak(buildStepAnnouncement(currentStep, stepIndex, steps.length));
    setTimerRemaining(null);
    setTimerRunning(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  // 타이머 카운트다운
  useEffect(() => {
    if (!timerRunning || timerRemaining === null) return;
    if (timerRemaining <= 0) {
      setTimerRunning(false);
      speak('타이머가 끝났어요.');
      return;
    }
    const timeout = setTimeout(() => setTimerRemaining((r) => (r ?? 0) - 1), 1000);
    return () => clearTimeout(timeout);
  }, [timerRunning, timerRemaining]);

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
      recognitionRef.current?.stop();
    };
  }, []);

  function goNext() {
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  function goPrev() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  function startTimer() {
    if (!currentStep?.timerSeconds) return;
    setTimerRemaining(currentStep.timerSeconds);
    setTimerRunning(true);
    speak('타이머를 시작할게요.');
  }

  function announceRemaining() {
    if (timerRunning && timerRemaining !== null) {
      speak(`${formatSpokenDuration(timerRemaining)} 남았어요.`);
    } else {
      speak('지금 실행 중인 타이머가 없어요.');
    }
  }

  function confirmExit() {
    if (confirm('요리 모드를 종료할까요?')) onExit();
  }

  function handleCommand(command: Command) {
    if (command === 'next') goNext();
    else if (command === 'prev') goPrev();
    else if (command === 'startTimer') startTimer();
    else if (command === 'remaining') announceRemaining();
    else if (command === 'stop') confirmExit();
  }

  function toggleListening() {
    if (!micCtor) return;
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new micCtor();
    recognition.lang = 'ko-KR';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      const command = matchCommand(transcript);
      if (command) handleCommand(command);
      else speak('다시 말씀해주시겠어요?');
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
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
          {stepIndex + 1}/{steps.length}단계
        </span>
        <button className="btn small" onClick={confirmExit}>
          ✕ 종료
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {imageUrl && <img src={imageUrl} alt={currentStep.title} className="cooking-mode-image" />}
        <h1 className="cooking-mode-title">{currentStep.title}</h1>
        <p className="cooking-mode-content">{currentStep.content}</p>

        {currentStep.timerSeconds != null && (
          <div style={{ textAlign: 'center' }}>
            {timerRemaining !== null ? (
              <div className="cooking-mode-timer">{formatCountdown(timerRemaining)}</div>
            ) : (
              <button className="btn cooking-mode-timer-btn" onClick={startTimer}>
                ⏱ 타이머 시작 ({formatCountdown(currentStep.timerSeconds)})
              </button>
            )}
          </div>
        )}

        {micBlockedByIos && (
          <p className="text-muted" style={{ textAlign: 'center', marginTop: 16 }}>
            이 화면은 Safari 브라우저에서 직접 열면 음성 명령을 쓸 수 있어요.
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
              {listening ? '듣고 있어요...' : '눌러서 말하기'}
            </p>
          </div>
        )}
      </div>

      <div className="cooking-mode-nav">
        <button className="btn" onClick={goPrev} disabled={stepIndex === 0}>
          ◀ 이전
        </button>
        {!isLastStep && (
          <button className="btn primary" onClick={goNext}>
            다음 ▶
          </button>
        )}
      </div>
    </div>
  );
}
