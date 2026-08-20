import { useEffect, useMemo, useRef, useState } from 'react';
import { useStoredImage } from '../../data/imageStore';
import { useAutoStartTimer, useAutoStartVoice, useAnnouncementTone } from '../../data/cookingModeSettings';
import {
  phraseStepPrefix,
  phraseTimerAutoStart,
  phraseTimerAvailable,
  phraseLastStep,
  phraseFinished,
  phraseTimerStart,
  phraseTimerPause,
  phraseNoActiveTimer,
  phraseTimerReset,
  phraseTimerRemaining,
  phraseTimerDone,
  phraseAskRepeat,
  type AnnouncementTone,
} from '../../lib/cookingAnnouncements';
import { fetchTodayCookingCount } from '../../data/cookingLog';
import { scaleAmount } from '../../data/computed';
import { findStepIngredients } from '../../lib/stepIngredientMatch';
import { useWakeLock } from './useWakeLock';
import { useVoiceAssistant } from './useVoiceAssistant';
import { ConfirmDialog } from './ConfirmDialog';
import { COMMAND_EXAMPLES, formatCountdown, matchCommand, type Command } from '../../lib/cookingVoiceCommands';
import type { CookingLogStepTiming, Ingredient, Recipe, RecipeStep } from '../../data/types';

function buildStepAnnouncement(
  tone: AnnouncementTone,
  step: RecipeStep,
  index: number,
  total: number,
  autoStarting: boolean,
): string {
  const parts = [phraseStepPrefix(tone, index), step.title, step.content];
  if (step.timerSeconds) {
    parts.push(
      autoStarting ? phraseTimerAutoStart(tone, step.timerSeconds) : phraseTimerAvailable(tone, step.timerSeconds),
    );
  }
  if (index === total - 1) parts.push(phraseLastStep(tone));
  return parts.join(' ');
}

/**
 * "🍳 요리 시작하기"로 들어오는 전체화면 핸즈프리 요리 안내 모드(레시피 1개). 폰을 세워두고 보는
 * 용도라 큰 글씨/버튼 위주로 단순하게 디자인함(기존 디자인 시스템 색상/톤은 그대로, 레이아웃만
 * 이 화면 전용 `.cooking-mode-*` 클래스 사용, D 단계에서 시안 반영). TTS/STT 인프라는
 * useVoiceAssistant, 화면 꺼짐 방지는 useWakeLock을 공유(MultiCookModePage와 공통) — 명령어
 * 해석과 타이머 처리는 이 화면 전용 로직이다.
 *
 * 음성은 "가능한 환경에서 더 편하게" 쓰는 보조 수단이고, 화면 탭(◀이전/다음▶/타이머/종료)은
 * "모든 환경에서 항상 가능한" 기본 수단이다 — iOS Safari는 PWA로 설치된 상태에서 음성 인식
 * 자체가 애플 제약으로 동작하지 않는 알려진 문제가 있어서, 그 경우 화면 탭만 유일한 수단이
 * 된다. 그래서 탭 버튼은 음성 지원 여부와 무관하게 항상 노출된다.
 */
export function CookingModePage({
  recipe,
  servings,
  ingredientsById,
  householdId,
  onExit,
  onFinish,
}: {
  recipe: Recipe;
  /** 이 요리 모드 세션의 인분 — 진입 경로별 우선순위(B-5)는 호출부(RecipeDetailPage)가 이미
   * 정해서 넘긴다: 식단에서 왔으면 그 MealPlan의 servings, 레시피 상세에서 왔으면 그 화면에서
   * 보고 있던 인분, 그 외엔 가구 기본 인원. "이 단계에서 쓰는 재료" 칩(D-2)도 이 값으로 수량을
   * 스케일링한다. */
  servings: number;
  /** D-2: "이 단계에서 쓰는 재료" 칩의 이름/수량 조회용 */
  ingredientsById: Map<string, Ingredient>;
  /** D-4: 완료 화면 "오늘 요리 n번째" 통계 조회용 — null이면 그 통계를 생략 */
  householdId: string | null;
  onExit: () => void;
  onFinish: (stepTimings: CookingLogStepTiming[]) => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [timerRemaining, setTimerRemaining] = useState<number | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [todayCookingCount, setTodayCookingCount] = useState<number | null>(null);
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
  const autoStartVoice = useAutoStartVoice();
  const tone = useAnnouncementTone();
  const steps = recipe.steps;
  const currentStep = steps[stepIndex] as RecipeStep | undefined;
  const isLastStep = stepIndex === steps.length - 1;
  const imageUrl = useStoredImage(currentStep?.imageId);

  // D-2: 이 단계 본문에 이름이 등장하는 재료만 뽑아 칩으로 보여준다(명시적 매핑 필드가 없어
  // 텍스트 매칭으로 판단 — stepIngredientMatch.ts 참고). 인분(servings) 기준으로 스케일링.
  const stepIngredients = useMemo(() => {
    if (!currentStep) return [];
    return findStepIngredients(currentStep, recipe.ingredients, ingredientsById);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, recipe.ingredients, ingredientsById]);

  useWakeLock();

  function handleTranscript(transcript: string, speak: (message: string) => void) {
    const command = matchCommand(transcript);
    if (command) handleCommand(command);
    else speak(phraseAskRepeat(tone));
  }

  const {
    micSupported,
    micBlockedByIos,
    listening,
    lastHeard,
    toggleListening,
    startListening,
    stopListening,
    speak,
  } = useVoiceAssistant({ onTranscript: handleTranscript });

  // "음성 인식 자동 시작"이 켜져 있으면 요리 모드에 들어오자마자 마이크를 켠다 — 첫 단계 안내
  // (아래 stepIndex effect)보다 먼저 실행돼야 keepListeningRef가 미리 true가 되어 speak()의
  // "말하는 동안 잠깐 듣기 중지" 로직이 첫 안내부터 정상 동작한다(effect는 선언 순서대로 실행됨).
  // 요리 모드를 나가면(언마운트) 자동으로 끈다.
  useEffect(() => {
    if (autoStartVoice && micSupported) startListening();
    return () => stopListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 완료 화면에 도달하면(요리를 마치면) 더 이상 명령을 들을 필요가 없어 마이크를 끈다.
  useEffect(() => {
    if (finished) stopListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  // 단계가 바뀔 때마다 TTS로 안내하고, 이전 단계의 타이머 상태는 초기화한다. "타이머 자동 시작"이
  // 켜져 있고 이 단계에 타이머가 있으면 안내 문구에 자동 시작을 언급하고 바로 시작한다(별도
  // speak 호출을 또 하면 speechSynthesis.cancel()이 앞선 안내를 끊어버리므로 한 번에 합침).
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
    speak(buildStepAnnouncement(tone, currentStep, stepIndex, steps.length, shouldAutoStart));
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
      speak(phraseTimerDone(tone));
      return;
    }
    const timeout = setTimeout(() => {
      setTimerRemaining((r) => (r ?? 0) - 1);
      if (timingDraftRef.current) timingDraftRef.current.cookElapsedSeconds += 1;
    }, 1000);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerRunning, timerRemaining]);

  useEffect(() => {
    if (!finished) return;
    speak(phraseFinished(tone));
    if (householdId) {
      // 이 세션의 기록은 아직 안 남았으니(onFinish 이후 CookingLogModal에서 확정) +1로 표시.
      fetchTodayCookingCount(householdId)
        .then((count) => setTodayCookingCount(count + 1))
        .catch((err) => console.error('오늘 요리 횟수 조회 실패:', err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

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
    speak(phraseTimerStart(tone, isResume));
  }

  function pauseTimer() {
    if (timerRunning) {
      setTimerRunning(false);
      speak(phraseTimerPause(tone));
    } else {
      speak(phraseNoActiveTimer(tone));
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
    speak(phraseTimerReset(tone));
  }

  function announceRemaining() {
    if (timerRunning && timerRemaining !== null) {
      speak(phraseTimerRemaining(tone, timerRemaining));
    } else {
      speak(phraseNoActiveTimer(tone));
    }
  }

  function confirmExit() {
    setShowExitConfirm(true);
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
      {!finished && (
        <>
          <div className="cooking-mode-header">
            <button className="cooking-mode-close" onClick={confirmExit} aria-label="요리 모드 종료">
              ✕
            </button>
            <div className="cooking-mode-progress-bar">
              <div
                className="cooking-mode-progress-fill"
                style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
              />
            </div>
            <span className="cooking-mode-progress-count">
              {stepIndex + 1} / {steps.length}
            </span>
          </div>
          <div className="cooking-mode-recipe-name">
            {recipe.name} · {servings}인분
            {servings !== recipe.servingsBase ? ` (원래 ${recipe.servingsBase}인분)` : ''}
          </div>
        </>
      )}

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {finished ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginTop: 24 }}>
            <div className="cooking-mode-done-illustration">
              <div className="cooking-mode-done-illustration-inner" />
            </div>
            <h1 className="cooking-mode-done-title">잘 만들었어요!</h1>
            {todayCookingCount != null && (
              <p className="text-muted" style={{ textAlign: 'center' }}>
                오늘 요리 {todayCookingCount}번째예요.
              </p>
            )}
            <button
              className="btn primary cooking-mode-timer-btn"
              style={{ marginTop: 8 }}
              onClick={() => onFinish(sessionTimingsRef.current)}
            >
              🍳 요리책에 기록하기
            </button>
            <button className="btn" onClick={confirmExit}>
              나중에 기록할게요
            </button>
          </div>
        ) : (
          <>
            {imageUrl && <img src={imageUrl} alt={currentStep.title} className="cooking-mode-image" />}
            <h2 className="cooking-mode-step-title">{currentStep.title}</h2>
            <p className="cooking-mode-content">{currentStep.content}</p>

            {currentStep.timerSeconds != null && (
              <div className="cooking-mode-timer-card">
                <span className="cooking-mode-timer-number">
                  {formatCountdown(timerRemaining ?? currentStep.timerSeconds)}
                </span>
                {timerRemaining !== null ? (
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn small" onClick={timerRunning ? pauseTimer : startTimer}>
                      {timerRunning ? '⏸ 멈춤' : '▶ 다시 시작'}
                    </button>
                    <button className="btn small" onClick={resetTimer}>
                      ↺ 초기화
                    </button>
                  </div>
                ) : (
                  <button className="btn primary" onClick={startTimer}>
                    타이머 시작
                  </button>
                )}
              </div>
            )}

            {stepIngredients.length > 0 && (
              <>
                <div className="cooking-mode-ingredients-title">이 단계에서 쓰는 재료</div>
                <div className="chip-row" style={{ justifyContent: 'center' }}>
                  {stepIngredients.map((item) => (
                    <span key={item.ingredientId} className="chip cooking-mode-ingredient-chip">
                      {ingredientsById.get(item.ingredientId)?.name}{' '}
                      {scaleAmount(item.amount, recipe.servingsBase, servings)}
                      {item.unit}
                    </span>
                  ))}
                </div>
              </>
            )}

            {currentStep.tip && (
              <div className="cooking-mode-tip-box">
                <div className="cooking-mode-tip-label">💡 팁</div>
                <div className="cooking-mode-tip-text">{currentStep.tip}</div>
              </div>
            )}

            {micSupported && (
              <div className="card" style={{ marginTop: 16 }}>
                <p className="text-muted" style={{ fontSize: 12, marginBottom: 6 }}>🎙️ 음성 명령어</p>
                <div className="chip-row">
                  {COMMAND_EXAMPLES.map((phrase) => (
                    <span key={phrase} className="chip">
                      {phrase}
                    </span>
                  ))}
                </div>
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

      {showExitConfirm && (
        <ConfirmDialog
          message="요리 모드를 종료할까요?"
          confirmLabel="종료"
          onConfirm={() => {
            setShowExitConfirm(false);
            onExit();
          }}
          onCancel={() => setShowExitConfirm(false)}
        />
      )}
    </div>
  );
}
