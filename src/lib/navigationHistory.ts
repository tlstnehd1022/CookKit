// 브라우저/기기(안드로이드 PWA) 뒤로가기 버튼을 앱 안의 화면 전환(레시피 탭 목록→상세→편집,
// 홈의 로컬 push, 요리 모드, 프로필 바텀시트 등)과 맞물리게 하는 공용 유틸 — 이 앱은 라우터가
// 없는 store 기반 SPA라(activeTab.ts 등) history API를 직접 다룬다.
//
// 원칙: "더 깊은" 화면으로 들어갈 때 pushHistoryEntry(revert)로 history에 항목 하나를 쌓고,
// 그 화면을 벗어날 때(하드웨어 뒤로가기든 화면 자체의 "← 뒤로"/"취소" 버튼이든) 항상 goBack()을
// 통해서만 벗어난다 — 상태를 직접 바꾸면 history와 어긋나서 다음 하드웨어 뒤로가기가 엉뚱한
// 화면을 건드리게 된다. goBack()은 history.back()만 호출하고, 실제 상태 변경은 popstate가
// 발생했을 때 pushHistoryEntry에 등록해둔 콜백이 수행한다(먼저 상태를 바꾸면 이후 popstate와
// 어긋날 수 있어, 브라우저가 실제로 history 위치를 옮긴 뒤에 반응하는 순서를 지킨다).
//
// 알려진 범위 제한: 이 스택은 탭(홈/레시피/냉장고/장보기) 전체에 걸쳐 하나만 존재한다(탭 전환
// 자체는 요구사항대로 history에 안 쌓음). 한 탭에서 깊이 들어갔다가 뒤로 나오지 않고 다른
// 탭으로 건너뛰면 그 항목이 스택에 남아있을 수 있다 — 개인/가구용 앱 규모에서는 드물고 영향이
// 작은 경우라 별도 처리를 안 했다(완벽한 라우터가 필요하면 별도로 논의).

type BackHandler = () => void;

interface StackEntry {
  onBack: BackHandler;
}

const stack: StackEntry[] = [];
let initialized = false;

/** 화면이 "더 깊이" 들어갈 때 호출 — history에 항목 하나를 쌓고, 뒤로가기가 일어났을 때 실행할
 * 복귀 콜백을 등록한다. 콜백은 보통 이미 있는 onBack/onDone 로직(이 화면으로 들어오기 직전
 * 상태로 되돌리는 것)을 그대로 재사용하면 된다. */
export function pushHistoryEntry(onBack: BackHandler) {
  stack.push({ onBack });
  window.history.pushState({ cookkitDepth: stack.length }, '');
}

/** 화면을 자체 UI(뒤로가기/취소/완료 등)로 벗어날 때 반드시 이 함수를 통해서 벗어나야 한다.
 * 스택이 비어있으면(이 화면이 history에 안 쌓인 상태) 아무 것도 하지 않는다. */
export function goBack() {
  if (stack.length === 0) return;
  window.history.back();
}

/** 여러 단계를 한 번에 건너뛰어 나갈 때(예: 복합 요리 완료 → 목록, 선택/준비 화면들을 다
 * 건너뜀) — 실제 화면 전환은 호출부가 직접 처리하고, 여기서는 history 스택 깊이만 맞춰
 * 지운다(중간 단계의 복귀 콜백은 실행하지 않음 — 이미 호출부가 최종 목적지로 상태를 바꿨음). */
export function discardHistoryEntries(count: number) {
  const actual = Math.min(count, stack.length);
  if (actual <= 0) return;
  stack.length -= actual;
  window.history.go(-actual);
}

/** main.tsx가 부팅 시 한 번 호출한다(React 컴포넌트 effect가 아니라 모듈 최상단에서 — effect로
 * 두면 StrictMode 이중 실행으로 리스너가 두 번 등록될 수 있어서). popstate가 발생하면 실제
 * history 위치(state.cookkitDepth)에 맞을 때까지 스택을 pop하며 각 복귀 콜백을 실행한다 —
 * 하드웨어 뒤로가기를 연달아 누르거나 discardHistoryEntries로 여러 단계를 건너뛴 경우에도
 * 정확히 그 차이만큼만 처리된다. 스택이 이미 다 소비된 상태(0)에서 popstate가 발생하면(앱이
 * 쌓은 항목을 넘어선 뒤로가기) 아무것도 하지 않아 브라우저 기본 동작(PWA/앱 밖으로 나가기)이
 * 그대로 진행되게 둔다. */
export function initNavigationHistory() {
  if (initialized) return;
  initialized = true;
  window.addEventListener('popstate', (event) => {
    const targetDepth = (event.state as { cookkitDepth?: number } | null)?.cookkitDepth ?? 0;
    while (stack.length > targetDepth) {
      const entry = stack.pop();
      entry?.onBack();
    }
  });
}
