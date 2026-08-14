import { useEffect, useLayoutEffect, useState } from 'react';
import { markOnboardingTourSeen } from '../../data/onboardingTour';

interface TourStep {
  /** HomePage 요소에 달아둔 data-tour 속성 값 */
  target: string;
  title: string;
  description: string;
}

// 순서는 명세의 홈 화면 요소 등장 순서 그대로. 일부 대상(오늘의 추천 카드/"있는 재료로
// 만들기" 버튼/유통기한 섹션)은 데이터가 없으면 애초에 렌더링되지 않으므로, 아래 컴포넌트가
// 대상을 못 찾으면 자동으로 다음 단계로 건너뛴다 — 신규 가구는 레시피/재료가 거의 없는
// 상태로 이 투어를 처음 보게 되므로 이 스킵 동작이 필수적이다.
const STEPS: TourStep[] = [
  { target: 'search', title: '검색', description: '레시피나 재료를 검색해보세요.' },
  { target: 'pantry', title: '냉장고 재료', description: '지금 냉장고에 있는 재료예요. 탭하면 냉장고 탭으로 이동해요.' },
  { target: 'recommend', title: '오늘의 추천', description: '보유 재료로 만들 수 있는 레시피를 추천해요.' },
  { target: 'quick-start', title: '바로 요리 시작하기', description: '레시피를 정하지 않아도 여기서 바로 시작할 수 있어요.' },
  { target: 'week', title: '이번 주 일정', description: '요일별로 뭐 해먹을지 미리 정해둘 수 있어요.' },
  { target: 'expiring', title: '유통기한 임박', description: '유통기한이 얼마 안 남은 재료를 알려드려요.' },
  { target: 'profile', title: '프로필', description: '여기서 설정, 알림, 가구 관리를 할 수 있어요.' },
];

const TOOLTIP_WIDTH = 280;
const MARGIN = 16;
const HIGHLIGHT_PADDING = 8;

function findTarget(target: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
}

/**
 * 홈 화면 요소를 순서대로 하이라이트하며 설명하는 첫 사용 투어. 새 라이브러리 없이 자체
 * 구현 — 반투명 스크림 위에 대상 요소 크기만큼 뚫린 것처럼 보이는 박스(box-shadow 트릭)와
 * 그 옆에 위치시키는 말풍선으로 구성된다.
 */
export function OnboardingTour({ onFinish }: { onFinish: () => void }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  // 투어 도중 데이터가 바뀔 일은 거의 없어 "몇 단계 중 몇 번째"용 전체 개수는 시작 시점에
  // 한 번만 계산한다(매 단계마다 다시 세면 건너뛴 단계 때문에 숫자가 계속 흔들려 보임).
  const [visibleStepIndices] = useState(() => STEPS.map((_, i) => i).filter((i) => findTarget(STEPS[i].target)));

  const step = stepIndex < STEPS.length ? STEPS[stepIndex] : null;

  function finish() {
    markOnboardingTourSeen();
    onFinish();
  }

  function next() {
    setStepIndex((i) => i + 1);
  }

  // 대상 요소가 화면에 없는 단계(조건부 렌더 섹션)는 자동으로 다음 단계로 건너뛴다.
  useEffect(() => {
    if (stepIndex >= STEPS.length) {
      finish();
      return;
    }
    if (!findTarget(STEPS[stepIndex].target)) {
      setStepIndex((i) => i + 1);
    }
  }, [stepIndex]);

  // 단계가 바뀌면 대상 요소로 스크롤하고(화면 밖에 있을 수 있음) 위치를 측정한다.
  // useLayoutEffect로 페인트 전에 측정해 하이라이트가 이전 위치에서 잠깐 보이는 걸 막는다.
  useLayoutEffect(() => {
    if (!step) return;
    const el = findTarget(step.target);
    if (!el) return; // 위 effect가 다음 단계로 넘겨줌
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const measure = () => setRect(el.getBoundingClientRect());
    measure();
    // smooth scroll 완료 이벤트가 표준에 없어 애니메이션이 끝났을 시점을 근사해 한 번 더 잰다.
    const timer = window.setTimeout(measure, 350);
    return () => window.clearTimeout(timer);
  }, [step]);

  // 스크롤/리사이즈 중에도 하이라이트가 대상과 어긋나지 않게 계속 재측정한다.
  useEffect(() => {
    if (!step) return;
    function measure() {
      const el = step && findTarget(step.target);
      if (el) setRect(el.getBoundingClientRect());
    }
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step]);

  if (!step || !rect) return null;

  const highlightStyle = {
    top: rect.top - HIGHLIGHT_PADDING,
    left: rect.left - HIGHLIGHT_PADDING,
    width: rect.width + HIGHLIGHT_PADDING * 2,
    height: rect.height + HIGHLIGHT_PADDING * 2,
  };

  const spaceBelow = window.innerHeight - rect.bottom;
  const placeBelow = spaceBelow > 180 || rect.top < 180;
  const idealLeft = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
  const maxLeft = Math.max(MARGIN, window.innerWidth - TOOLTIP_WIDTH - MARGIN);
  const left = Math.min(Math.max(idealLeft, MARGIN), maxLeft);
  const tooltipStyle = placeBelow
    ? { left, top: rect.bottom + 12 }
    : { left, bottom: window.innerHeight - rect.top + 12 };

  const position = visibleStepIndices.indexOf(stepIndex) + 1;
  const total = visibleStepIndices.length;
  const isLast = stepIndex === visibleStepIndices[visibleStepIndices.length - 1];

  return (
    <div className="tour-overlay" onClick={finish}>
      <div className="tour-highlight" style={highlightStyle} />
      <div className="tour-tooltip" style={tooltipStyle} onClick={(e) => e.stopPropagation()}>
        <p className="tour-tooltip-title">{step.title}</p>
        <p className="tour-tooltip-desc">{step.description}</p>
        <div className="tour-tooltip-actions">
          <span className="tour-step-count">
            {position}/{total}
          </span>
          <div className="chip-row" style={{ marginTop: 0 }}>
            <button type="button" className="btn small" onClick={finish}>
              건너뛰기
            </button>
            <button type="button" className="btn small primary" onClick={next}>
              {isLast ? '완료' : '다음'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
