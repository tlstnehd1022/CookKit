import { useEffect, useMemo, useRef, useState } from 'react';
import { useStoredImage } from '../../data/imageStore';
import { useAutoStartTimer } from '../../data/cookingModeSettings';
import { useWakeLock } from './useWakeLock';
import { useVoiceAssistant } from './useVoiceAssistant';
import {
  COMMAND_EXAMPLES,
  detectTargetRecipeId,
  formatCountdown,
  formatSpokenDuration,
  matchCommand,
} from '../../lib/cookingVoiceCommands';
import type { OrderedStepRef } from '../../lib/multiCookOrdering';
import type { CookingLogStepTiming, Recipe } from '../../data/types';

interface RunningTimer {
  recipeId: string;
  recipeName: string;
  stepIndex: number;
  stepTitle: string;
  totalSeconds: number;
  remainingSeconds: number;
  elapsedSeconds: number;
  running: boolean;
}

function timerKey(t: { recipeId: string; stepIndex: number }): string {
  return `${t.recipeId}-${t.stepIndex}`;
}

function findTimerForStep(timers: RunningTimer[], recipeId: string, stepIndex: number): RunningTimer | undefined {
  return timers.find((t) => t.recipeId === recipeId && t.stepIndex === stepIndex);
}

/** 이름으로 지목된 레시피의 타이머 중 가장 최근에 추가된 것을 대상으로 삼는다(레시피 하나에 동시에
 * 여러 타이머가 도는 경우는 드물지만, 배치 알고리즘상 이론적으로 가능하므로 최신 것 우선). */
function findLatestTimerForRecipe(timers: RunningTimer[], recipeId: string): RunningTimer | undefined {
  for (let i = timers.length - 1; i >= 0; i--) {
    if (timers[i].recipeId === recipeId) return timers[i];
  }
  return undefined;
}

/**
 * 복합 요리(여러 레시피 동시 진행) 진행 화면 — CookingModePage와 같은 TTS/STT/Wake Lock
 * 인프라(useVoiceAssistant/useWakeLock)를 재사용하되, 여기서는 여러 타이머가 동시에 돌 수
 * 있다는 게 핵심 차이다. "다음/이전"은 미리 짜인 순서(order)만 이동할 뿐 다른 레시피의 타이머는
 * 건드리지 않는다 — 타이머는 각자 완료/일시정지/초기화될 때까지 독립적으로 진행된다. 음성
 * "타이머 시작"처럼 레시피 이름이 없으면 지금 보고 있는 단계의 타이머를 대상으로 하고, "스프
 * 타이머 멈춰"처럼 레시피 이름이 들리면 그 레시피의 타이머를 대상으로 한다
 * (detectTargetRecipeId).
 */
export function MultiCookModePage({
  recipes,
  order,
  onExit,
  onFinish,
}: {
  recipes: Recipe[];
  order: OrderedStepRef[];
  onExit: () => void;
  onFinish: (stepTimings: CookingLogStepTiming[]) => void;
}) {
  const [planIndex, setPlanIndex] = useState(0);
  const [timers, setTimers] = useState<RunningTimer[]>([]);
  const [finished, setFinished] = useState(false);
  const timersRef = useRef<RunningTimer[]>([]);
  const handledCompletionsRef = useRef<Set<string>>(new Set());
  const sessionTimingsRef = useRef<CookingLogStepTiming[]>([]);

  const autoStartTimer = useAutoStartTimer();
  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const isLastPlanStep = planIndex === order.length - 1;
  const currentRef = order[planIndex] as OrderedStepRef | undefined;
  const currentRecipe = currentRef ? recipeById.get(currentRef.recipeId) : undefined;
  const currentStep = currentRecipe && currentRef ? currentRecipe.steps[currentRef.stepIndex] : undefined;
  const currentTimer = currentRef ? findTimerForStep(timers, currentRef.recipeId, currentRef.stepIndex) : undefined;
  const imageUrl = useStoredImage(currentStep?.imageId);

  useWakeLock();

  useEffect(() => {
    timersRef.current = timers;
  }, [timers]);

  function handleTranscript(transcript: string, speak: (message: string) => void) {
    const command = matchCommand(transcript);
    if (!command) {
      speak('다시 말씀해주시겠어요?');
      return;
    }
    if (command === 'next') {
      goNext();
      return;
    }
    if (command === 'prev') {
      goPrev();
      return;
    }
    if (command === 'stop') {
      confirmExit();
      return;
    }
    const targetRecipeId = detectTargetRecipeId(transcript, recipes) ?? currentRef?.recipeId;
    if (!targetRecipeId) return;
    if (command === 'remaining') announceRemainingFor(targetRecipeId, speak);
    else if (command === 'startTimer') startOrResumeTimerFor(targetRecipeId, speak);
    else if (command === 'stopTimer') pauseTimerFor(targetRecipeId, speak);
    else if (command === 'resetTimer') resetTimerFor(targetRecipeId, speak);
  }

  const { micSupported, micBlockedByIos, listening, lastHeard, toggleListening, speak } = useVoiceAssistant({
    onTranscript: handleTranscript,
  });

  // 단계가 바뀔 때마다 안내 — 어느 레시피의 몇 단계인지 레시피 이름과 함께 말해준다(복합 요리의
  // 핵심 차이점). 이미 그 단계 타이머가 돌고 있으면(이전에 시작해둔 경우) 자동 시작 문구는
  // 생략한다. 토글은 다음 단계부터 적용(deps에 planIndex만).
  useEffect(() => {
    if (!currentRecipe || !currentStep || !currentRef) return;
    const alreadyHasTimer = Boolean(findTimerForStep(timersRef.current, currentRef.recipeId, currentRef.stepIndex));
    const shouldAutoStart = autoStartTimer && Boolean(currentStep.timerSeconds) && !alreadyHasTimer;
    const parts = [`${currentRecipe.name}.`, currentStep.title, currentStep.content];
    if (currentStep.timerSeconds && !alreadyHasTimer) {
      parts.push(
        shouldAutoStart
          ? `이 단계는 ${formatSpokenDuration(currentStep.timerSeconds)} 타이머가 자동으로 시작돼요.`
          : `이 단계는 ${formatSpokenDuration(currentStep.timerSeconds)} 타이머가 있어요.`,
      );
    }
    speak(parts.join(' '));
    if (shouldAutoStart) {
      setTimers((prev) => [
        ...prev,
        {
          recipeId: currentRef.recipeId,
          recipeName: currentRecipe.name,
          stepIndex: currentRef.stepIndex,
          stepTitle: currentStep.title,
          totalSeconds: currentStep.timerSeconds!,
          remainingSeconds: currentStep.timerSeconds!,
          elapsedSeconds: 0,
          running: true,
        },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planIndex]);

  // 타이머 카운트다운 — 여러 개가 동시에 돌 수 있어서 실행 중인 것들을 한 번에 1초씩 줄인다.
  useEffect(() => {
    if (!timers.some((t) => t.running)) return;
    const timeout = setTimeout(() => {
      setTimers((prev) =>
        prev.map((t) => {
          if (!t.running) return t;
          const remaining = t.remainingSeconds - 1;
          if (remaining <= 0) return { ...t, remainingSeconds: 0, elapsedSeconds: t.elapsedSeconds + 1, running: false };
          return { ...t, remainingSeconds: remaining, elapsedSeconds: t.elapsedSeconds + 1 };
        }),
      );
    }, 1000);
    return () => clearTimeout(timeout);
  }, [timers]);

  // 완료 감지는 setState 업데이트 함수 밖에서 처리한다(업데이트 함수는 순수해야 하는데 음성
  // 안내/기록 같은 부수효과를 안에서 하면 개발 모드 StrictMode의 이중 호출로 중복 실행될 수
  // 있음) — handledCompletionsRef로 이미 처리한 완료를 걸러 한 번만 반응한다. 타이머가 실제로
  // 완료된 단계만 stepTimings에 기록하고(prepSeconds는 0으로 단순화 — 여러 레시피를 오가는
  // 흐름이라 "이 단계 진입~타이머 시작" 구간이 단일 레시피 모드처럼 의미 있지 않음), 타이머가
  // 아예 없거나 시작하지 않은 단계는 기록하지 않는다. 어차피 isMultiRecipe=true 기록은 시간
  // 조정 제안 계산에서 통째로 제외되므로(fetchStepTimingAdjustments) 정밀도가 중요하지 않다.
  useEffect(() => {
    for (const t of timers) {
      const key = timerKey(t);
      if (t.remainingSeconds === 0 && !t.running && !handledCompletionsRef.current.has(key)) {
        handledCompletionsRef.current.add(key);
        speak(`${t.recipeName} 타이머가 끝났어요.`);
        sessionTimingsRef.current.push({
          recipeId: t.recipeId,
          stepIndex: t.stepIndex,
          plannedSeconds: t.totalSeconds,
          prepSeconds: 0,
          cookSeconds: t.elapsedSeconds,
          hadTimer: true,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timers]);

  useEffect(() => {
    if (finished) speak('모든 레시피를 완성했어요! 수고하셨어요.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  function goNext() {
    if (isLastPlanStep) {
      setFinished(true);
      return;
    }
    setPlanIndex((i) => Math.min(i + 1, order.length - 1));
  }

  function goPrev() {
    setPlanIndex((i) => Math.max(i - 1, 0));
  }

  function startOrResumeTimerFor(targetRecipeId: string, speak: (message: string) => void) {
    const existing = findLatestTimerForRecipe(timersRef.current, targetRecipeId);
    if (existing) {
      setTimers((prev) => prev.map((t) => (t === existing ? { ...t, running: true } : t)));
      speak(`${existing.recipeName} 타이머를 다시 시작할게요.`);
      return;
    }
    if (!currentRecipe || !currentStep || !currentRef || targetRecipeId !== currentRef.recipeId || !currentStep.timerSeconds) {
      speak('지금 시작할 수 있는 타이머가 없어요.');
      return;
    }
    setTimers((prev) => [
      ...prev,
      {
        recipeId: currentRef.recipeId,
        recipeName: currentRecipe.name,
        stepIndex: currentRef.stepIndex,
        stepTitle: currentStep.title,
        totalSeconds: currentStep.timerSeconds!,
        remainingSeconds: currentStep.timerSeconds!,
        elapsedSeconds: 0,
        running: true,
      },
    ]);
    speak('타이머를 시작할게요.');
  }

  function pauseTimerFor(targetRecipeId: string, speak: (message: string) => void) {
    const existing = findLatestTimerForRecipe(timersRef.current, targetRecipeId);
    if (!existing || !existing.running) {
      speak('지금 실행 중인 타이머가 없어요.');
      return;
    }
    setTimers((prev) => prev.map((t) => (t === existing ? { ...t, running: false } : t)));
    speak(`${existing.recipeName} 타이머를 멈췄어요.`);
  }

  function resetTimerFor(targetRecipeId: string, speak: (message: string) => void) {
    const existing = findLatestTimerForRecipe(timersRef.current, targetRecipeId);
    if (!existing) {
      speak('초기화할 타이머가 없어요.');
      return;
    }
    handledCompletionsRef.current.delete(timerKey(existing));
    setTimers((prev) =>
      prev.map((t) => (t === existing ? { ...t, remainingSeconds: t.totalSeconds, elapsedSeconds: 0, running: false } : t)),
    );
    speak(`${existing.recipeName} 타이머를 초기화했어요.`);
  }

  function announceRemainingFor(targetRecipeId: string, speak: (message: string) => void) {
    const existing = findLatestTimerForRecipe(timersRef.current, targetRecipeId);
    if (!existing || !existing.running) {
      speak('지금 실행 중인 타이머가 없어요.');
      return;
    }
    speak(`${existing.recipeName} 타이머 ${formatSpokenDuration(existing.remainingSeconds)} 남았어요.`);
  }

  function confirmExit() {
    if (confirm('요리 모드를 종료할까요?')) onExit();
  }

  const otherTimers = timers.filter(
    (t) => t.remainingSeconds > 0 && !(currentRef && t.recipeId === currentRef.recipeId && t.stepIndex === currentRef.stepIndex),
  );

  if (!currentRef || !currentRecipe || !currentStep) {
    return (
      <div className="cooking-mode-overlay">
        <p>진행할 단계가 없어요.</p>
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
          {finished ? '완료' : `${currentRef.stepIndex + 1}/${currentRecipe.steps.length}단계`}
        </span>
        <button className="btn small" onClick={confirmExit}>
          ✕ 종료
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {finished ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginTop: 24 }}>
            <h1 className="cooking-mode-title">🎉 모두 완료!</h1>
            <p className="cooking-mode-content">
              {recipes.map((r) => r.name).join(' · ')}
              <br />
              수고하셨어요!
            </p>
            <button className="btn primary cooking-mode-timer-btn" onClick={() => onFinish(sessionTimingsRef.current)}>
              🍳 오늘 만들었어요
            </button>
            <button className="btn" onClick={confirmExit}>
              나중에 기록할게요
            </button>
          </div>
        ) : (
          <>
            <p className="text-muted" style={{ textAlign: 'center', fontSize: 13 }}>
              🍽️ {currentRecipe.name} · 전체 {planIndex + 1}/{order.length}
            </p>
            {imageUrl && <img src={imageUrl} alt={currentStep.title} className="cooking-mode-image" />}
            <h1 className="cooking-mode-title">{currentStep.title}</h1>
            <p className="cooking-mode-content">{currentStep.content}</p>

            {currentStep.timerSeconds != null && (
              <div style={{ textAlign: 'center' }}>
                {currentTimer ? (
                  <>
                    <div className="cooking-mode-timer">{formatCountdown(currentTimer.remainingSeconds)}</div>
                    <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
                      <button
                        className="btn small"
                        onClick={() =>
                          currentTimer.running
                            ? pauseTimerFor(currentRef.recipeId, speak)
                            : startOrResumeTimerFor(currentRef.recipeId, speak)
                        }
                      >
                        {currentTimer.running ? '⏸ 멈춤' : '▶ 다시 시작'}
                      </button>
                      <button className="btn small" onClick={() => resetTimerFor(currentRef.recipeId, speak)}>
                        ↺ 초기화
                      </button>
                    </div>
                  </>
                ) : (
                  <button className="btn cooking-mode-timer-btn" onClick={() => startOrResumeTimerFor(currentRef.recipeId, speak)}>
                    ⏱ 타이머 시작 ({formatCountdown(currentStep.timerSeconds)})
                  </button>
                )}
              </div>
            )}

            {otherTimers.length > 0 && (
              <div className="card" style={{ marginTop: 16 }}>
                <p className="text-muted" style={{ fontSize: 12, marginBottom: 4 }}>
                  🔥 진행 중인 다른 타이머
                </p>
                {otherTimers.map((t) => (
                  <div className="row" key={timerKey(t)} style={{ padding: '2px 0' }}>
                    <span style={{ fontSize: 13 }}>
                      {t.recipeName} · {t.stepTitle}
                    </span>
                    <strong>{t.running ? formatCountdown(t.remainingSeconds) : `${formatCountdown(t.remainingSeconds)} (멈춤)`}</strong>
                  </div>
                ))}
              </div>
            )}

            {micSupported && (
              <div className="card" style={{ marginTop: 16 }}>
                <p className="text-muted" style={{ fontSize: 12, marginBottom: 4 }}>
                  🎙️ 음성 명령어 예시 (다른 레시피 타이머는 이름을 붙여서, 예: "스프 타이머 멈춰")
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
          <button className="btn" onClick={goPrev} disabled={planIndex === 0}>
            ◀ 이전
          </button>
          <button className="btn primary" onClick={goNext}>
            {isLastPlanStep ? '완료 ▶' : '다음 ▶'}
          </button>
        </div>
      )}
    </div>
  );
}
