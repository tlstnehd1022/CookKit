# 프로젝트: 요리 레시피 & 재료 관리 앱 (CookKit)

## 배경
- 밀가루·마늘 알러지가 있는 친구/가족과 함께 요리할 일이 많아서 시작한 개인 프로젝트
- 처음엔 Claude와 대화하며 알러지 없는 리조또 레시피를 짜고, 인분 조절 + 장보기 리스트 정리를 반복하다가
  "아예 앱으로 만들자"는 결론에 도달함
- 개발자: 회사에서 짬짬이 작업 중 (오늘은 회사 PC, 이후 집 PC에서 이어서 작업). Git으로 코드는 그대로 이어받지만
  Claude Code 대화 세션 자체는 기기별로 로컬 저장이라 이어지지 않음 → 이 파일이 맥락 전달용

## 진행 상황
- **Phase 1 완료**: React + Vite + TypeScript, localStorage 기반 repository 패턴으로 재료/레시피/장보기/설정(백업) 화면 구현 완료
- **2차 확장 완료**: 로그인 화면, 레시피 중심 네비게이션, 유튜브 링크 변환, 재료 카테고리 동적화
- **3차 확장 완료**: Google Gemini를 두 번째 AI 제공자로 추가(무료 쿼터 대안), 레시피 추가 화면 개선
  (재료 단위 선택형, 타이머 분/초 입력, 대화형 AI 레시피 편집 — 아래 "핵심 기능 요구사항"에 최신 상태 반영됨)
- **4차 확장 완료**: 유튜브 자막 자동 추출 — CORS 문제로 이 기능 하나만 예외적으로 최소 서버리스 함수를
  도입함(자세한 내용은 아래 "서버 도입(1호)" 항목과 "유튜브 자막 추출 관련 TODO" 참고)
- **5차 확장 완료**: 전체 디자인을 "따뜻한 아날로그 + Soft UI" 톤으로 통일 + 다크모드 토글, 재료별 개인
  선호 설정(선호 단위/방식), 조리 단계별 AI 이미지 생성(Gemini 전용, IndexedDB 저장 — 아래 "이미지 저장
  (IndexedDB)" 항목 참고)
- **6차 확장 진행 중 — Supabase(DB) 전환**: localStorage 단독 구조를 Supabase(Postgres + Auth)로
  옮기는 작업. **스키마 설계(Phase 1)/구글 로그인+가구 온보딩(Phase 2)/재료·레시피·장보기 데이터
  레이어 전환(Phase 3)까지 완료**, 실사용 테스트(로그인/가구 생성)도 확인함. 남은 건 API 키 암호화
  저장(Phase 4)뿐. 자세한 내용은 아래 "DB 전환(Supabase)" 항목 참고
- **7차 확장 완료 — 레시피 관리 화면 모바일 개편**: "가족들이 폰으로 오늘 뭐 해먹지 훑어보기 좋게"가
  목표. 2열 그리드 카드 뷰(기본) + 리스트 뷰 토글, 검색(이름+재료, 300ms 디바운스), 필터를 가로 스크롤
  한 줄로 통합(태그+알러지 제외+"🧺 보유 재료로 가능한 것만"), 정렬(최근 추가순/이름순), 빈 상태 처리.
  자세한 내용은 아래 "레시피 관리 화면(모바일 개편)" 항목 참고

## 기술 스택 / 아키텍처 결정
- **프론트엔드**: React + Vite + TypeScript, 탭 기반 네비게이션(별도 라우터 없음)
- **저장 방식**: 브라우저 localStorage. `src/data/repository.ts`의 `CrudRepository<T>` 인터페이스로 추상화되어 있어
  나중에 실제 DB(Supabase 등)로 전환 시 `src/data/localStorageAdapter.ts`만 다른 어댑터로 교체하면 됨
- **사용자/로그인**: 지금은 실제 인증 없이 고정 사용자(`수동`)로 버튼 클릭 로그인만 존재 (`src/data/session.ts`).
  나중에 실제 로그인(Supabase Auth 등)을 붙일 때는 `login()` 내부 구현만 교체.
  storage key는 `cookkit:{userId}:...` 형태로 이미 사용자 네임스페이스가 걸려 있음(`src/data/repos.ts`) —
  지금은 사용자가 하나뿐이라 동적 재키잉은 하지 않고 고정 접두사만 사용, 실제 다중 사용자 전환 시 이 부분만 일반화하면 됨
- **AI 연동(자연어/유튜브/대화 → 레시피 변환)**: 두 개 제공자를 설정 화면에서 선택 가능(`aiProvider: 'anthropic'|'gemini'`, 기본값 Gemini — 무료 쿼터 때문에 추천).
  - **Anthropic**: 브라우저에서 `@anthropic-ai/sdk`를 `dangerouslyAllowBrowser: true`로 직접 호출 (`src/lib/claudeClient.ts`)
  - **Gemini**: SDK 없이 REST 엔드포인트(`generativelanguage.googleapis.com`)를 fetch로 직접 호출 (`src/lib/geminiClient.ts`).
    유튜브 변환은 YouTube Data API(선택, 무료)로 제목/설명란만 가져오고, 자막은 공식 API로 못 가져오므로 사용자가 직접 붙여넣는 방식으로 보완
  - API 키들은 전부 설정 화면에서 사용자가 입력해 localStorage에 저장(개인용 앱 전제, 공개 배포 시 키 노출 위험 있음)
  - Gemini 모델명은 제공자가 자주 구세대 모델을 신규 키에 차단하므로(예: 2026-07-09부터 `gemini-2.5-flash` 차단),
    설정 화면에서 직접 모델 ID를 입력받게 되어 있음 — 오류 시 최신 모델 ID로 교체 필요
- **서버 도입(1호) — 유튜브 자막 추출용 Vercel Serverless Function**: 원칙적으로 클라이언트 단독 구조를
  유지하되, "유튜브 자막을 브라우저에서 직접 긁어오는 것"만은 예외로 최소 서버를 도입함. 이유: 자막
  추출에 쓰는 `youtube-transcript` 패키지는 유튜브의 비공식 엔드포인트에 직접 `fetch`하는데, 유튜브가
  CORS를 허용하지 않아 브라우저에서 실행하면 무조건 막힘(Node/서버 환경에서만 동작). 그래서 이 부분만
  `api/youtube-transcript.ts`(Vercel Serverless Function)로 분리해 서버에서 실행하고, 프론트는
  `/api/youtube-transcript?url=...`를 호출해 이미 추출된 자막 텍스트만 받아옴(`src/lib/youtubeTranscript.ts`).
  그 외 모든 기능(레시피/재료/장보기/AI 호출 자체)은 여전히 브라우저 단독 + localStorage.
  - 로컬 개발 시 `npm run dev`(순수 Vite)로는 `/api/*`가 안 뜸 — `npm run dev:full`(`vercel dev`)로 실행해야
    프론트+서버리스 함수가 같이 뜸. 배포는 GitHub 저장소를 Vercel 프로젝트에 연결해두면 push할 때마다
    자동 빌드/배포됨(이미 기기 간 코드 동기화를 GitHub로 하고 있어서 자연스럽게 이어짐)
  - 다중 사용자 등으로 "진짜" 백엔드를 붙이게 되면, 이 서버리스 함수가 있던 자리(`api/`)를 그대로 확장해도
    되고 별도 백엔드로 흡수해도 됨 — 지금은 이 기능 하나만을 위한 최소 범위로 한정함
- **이미지 저장(IndexedDB) — 조리 단계별 AI 이미지 생성용**: Gemini(`gemini-3.1-flash-image`, "Nano Banana"
  계열)로 조리 단계 이미지를 생성하는 기능은 Claude가 이미지 생성을 지원하지 않아 **Gemini 전용**임
  (`src/lib/geminiClient.ts`의 `generateStepImage`/`buildStepImagePrompt`). 레시피 편집 화면에서 단계별로
  "🎨 이미지 생성" 버튼을 눌러 온디맨드로만 생성함(저장 시 전체 자동 생성 안 함 — 속도/비용 고려).
  생성된 이미지(base64 데이터 URL, 수백KB~1MB대)는 `RecipeStep.imageId`로만 참조하고 실제 데이터는
  localStorage(5~10MB 한도)가 아닌 **IndexedDB**(`src/data/imageStore.ts`, DB명 `cookkit-images`)에 저장함.
  `useStoredImage(imageId)` 훅으로 비동기 로드. 스텝을 명시적으로 삭제/이미지 삭제할 때만 IndexedDB에서도
  같이 지우며, 그 외 경로(AI 적용으로 스텝 통째 교체, undo 등)로 고아 이미지가 남는 것까지는 처리하지
  않음(개인 사용 규모라 당장은 무시해도 되는 수준으로 판단, 필요해지면 정리 로직 추가할 것).
  - 이미지 생성 요청은 60초 타임아웃(`AbortController`)을 걸어둠 — 원래도 이미지 생성은 텍스트보다 느려서
    (수십 초 단위) 정상 범위이지만, 응답이 안 오고 무한 대기하는 상황은 막기 위함
  - 429(요청 제한)/503(`이미지 생성 모델이 현재 수요가 많습니다` 같은 일시적 과부하)는 흔히 발생하는
    일시적 오류라 지수 백오프(2초→4초)로 최대 3회까지 자동 재시도함(`generateStepImage`). 그 외 오류는
    바로 실패 처리. 배치 생성 중 실패한 단계는 어떤 에러였는지 화면과 콘솔에 그대로 표시됨
  - "🎨 이미지 생성"(AI, Gemini 전용) 옆에 "📁 사진 업로드" 버튼도 있어 사용자가 직접 찍은 사진으로 즉시
    교체 가능(AI 키 불필요, 어떤 AI 제공자를 쓰든 항상 노출). `FileReader.readAsDataURL`로 읽어서 동일하게
    IndexedDB에 저장 — AI 생성이든 업로드든 저장 경로는 같음
  - **일괄 생성**: "조리 순서" 섹션 제목 옆 "🖼 전체 이미지 생성" 버튼(Gemini 전용)으로 현재 폼의 모든
    단계 이미지를 한 번에 생성 가능. 이미 이미지가 있는 단계가 있으면 먼저 "기존 이미지도 다시 만들까요?"
    확인(아니오 선택 시 이미지 없는 단계만 대상), 이후 "시간이 조금 걸릴 수 있어요" 안내와 함께 진행
    여부 확인(`confirm()`). 내부적으로 7개씩 묶어 `Promise.all`로 병렬 처리하고 배치 사이는 순차 진행
    (Gemini 무료 티어 분당 요청 제한 고려), 대상이 7개 이상이면 "시간이 좀 더 걸릴 수 있다"는 문구 추가.
    진행 중에는 "이미지 생성 중... (n/총)" 진행률 표시
  - **채팅/유튜브로 레시피 반영 시에도 동일 플로우 제안**: `applyExtractedResult`(대화 "이대로 반영하기"와
    유튜브 "이대로 반영하기"가 공유하는 단일 함수)에서 반영 직후 Gemini 사용 중이면 "조리 단계 이미지도
    자동으로 생성할까요?" 확인 후 위와 같은 방식으로 전체 생성 진행(이 경우는 방금 막 채워진 새 단계라
    기존 이미지 개념이 없어 덮어쓰기 질문은 생략)
- **DB 전환(Supabase) — 진행 중**: localStorage 단독 구조를 다중 사용자가 가능한 진짜 백엔드로
  옮기는 작업. 배경: User-Household는 N:1(가족 여러 명이 하나의 household 공유), 재료(ingredients)는
  household 단위로 공유, 레시피(recipes)는 user 단위 소유(기본 비공개, `is_public`으로 전체공개 전환
  가능해서 다른 유저가 참조/복사 가능), 로그인은 **구글 소셜 로그인이 메인 + 이메일/비밀번호가 정식
  보조 수단**(`src/features/auth/LoginPage.tsx`). 이메일 로그인은 개발 편의용이 아니라 정식 기능 —
  구글 계정이 없거나 네트워크 제약으로 구글 접속이 막힌 환경(예: 특정 회사 네트워크)에서도 로그인할 수
  있어야 한다는 요구사항. Supabase Auth 내장 기능이라 별도 콘솔 설정 없이 동작하고, `profiles` 자동
  생성 트리거도 로그인 방식과 무관하게 `auth.users` insert 시 공통으로 걸려있어 그대로 재사용됨.
  회원가입 시 프로젝트의 "Confirm email" 설정이 켜져 있으면 이메일 인증 링크를 눌러야 로그인 가능
  (꺼져있으면 가입 즉시 로그인) — 둘 다 자동으로 처리되게 구현(세션 유무로 분기).
  - **현재 상태**: 스키마 설계 + 설정 가이드만 완료, 실제 코드(로그인 화면, 데이터 레이어, 마이그레이션
    스크립트)는 아직 손대지 않음. `@supabase/supabase-js` 설치 완료, `.env.example`(→ 로컬에서 `.env`로
    복사해 실제 키 채워넣는 방식, `VITE_` 접두사 필요 — Vite는 이 접두사 붙은 변수만 클라이언트에 노출),
    `.env`는 `.gitignore`에 이미 포함됨
  - **스키마**: `supabase/schema.sql`에 전체 SQL 있음 — `profiles`(auth.users와 1:1, 별도 users 테이블
    대신 Supabase 공식 권장 패턴대로 auth.users를 참조), `households`, `household_members`(N:1 매핑,
    유저당 household 1개로 제한하는 unique index 포함), `categories`/`ingredients`/`tags`(모두 household
    단위), `recipes`(user 소유 + `content` jsonb에 인분/재료/조리순서 중첩 저장 — 개인/가구 규모라 별도
    테이블로 정규화하지 않음), `recipe_tags`, `shopping_selection`(household 공유)
  - **RLS**: household 소속 여부 체크는 `household_members` 테이블을 자기 자신이 참조하면 무한 재귀
    에러가 나서, `is_household_member`/`shares_household_with` 같은 `SECURITY DEFINER` 헬퍼 함수로
    우회함(Supabase 공식 권장 패턴). recipes는 `is_public=true`거나 본인 것만 조회 가능하도록 정책 설정
  - **Phase 2 완료 — 로그인/가구 온보딩**: `src/lib/supabaseClient.ts`(클라이언트 초기화, `VITE_SUPABASE_URL`/
    `VITE_SUPABASE_ANON_KEY` 환경변수 필요 — 없으면 명확한 에러로 즉시 실패), `src/data/session.ts`를
    Supabase Auth 기반으로 재작성(`signInWithOAuth({provider:'google'})`, `onAuthStateChange`로 세션
    반영 — `login`/`logout`은 이제 비동기, `useSession()`이 반환하는 `loaded` 플래그로 새로고침 직후
    깜빡임 방지). `src/data/household.ts`(`useHousehold()` — 로그인 사용자가 속한 household 조회),
    `src/features/auth/HouseholdOnboarding.tsx`(household 없는 신규 유저에게 "가구 만들기"/"초대코드로
    참여하기" 선택 화면), `App.tsx`가 로그인→household 유무에 따라 로그인 화면/온보딩/본화면을 분기.
    설정 화면에 가구 이름 + 초대코드 표시 추가(가족에게 공유용). 구글 로그인 리다이렉트까지 자동
    확인 완료(Playwright로 실제 구글 로그인 화면 도달 확인, 실제 로그인 자체는 사용자가 직접 테스트 필요)
  - **household 초대코드 검증 RPC**: 원래 5번째 단계로 예정했던 것을 Phase 2에서 앞당겨 구현함(초대코드로
    가입하는 기능 자체가 이게 없으면 동작할 수 없어서) — `supabase/migrations/0002_household_rpc.sql`의
    `create_household`/`join_household_by_invite_code` (둘 다 SECURITY DEFINER, 한 계정당 household
    1개 제한을 함수 안에서도 체크). **`schema.sql`을 다시 실행하지 말고 이 마이그레이션 파일만 추가로
    SQL Editor에서 실행할 것**(이미 존재하는 테이블/정책이라 전체 재실행하면 에러남 — 앞으로 스키마가
    바뀔 때마다 `supabase/migrations/000N_*.sql` 형태로 계속 이어붙이는 방식으로 관리)
  - **Phase 2 실사용 테스트 완료**: 리다이렉트 URL 등록(로컬+Vercel 배포 주소 둘 다), 구글 로그인,
    가구 만들기까지 실제로 확인함. 중간에 겪은 이슈 2개는 재발 방지용으로 기록: (1) Vercel에
    `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`를 안 넣어서 배포본이 완전히 빈 화면으로만 떴던 문제 —
    `main.tsx`가 이제 `theme`/`App`을 정적 import 대신 동적 import로 불러오게 고쳐서, 앱 시작 중 에러가
    나도 최소한 에러 메시지는 뜨도록 함(빈 화면 방지). (2) 구글 로그인 시
    `error=server_error&error_code=unexpected_failure&"Unable to exchange external code"` —
    Supabase의 Google Provider에 등록된 Client Secret이 잘못돼서(복사 시 공백 등) 발생, Google Cloud
    Console에서 Client Secret을 다시 발급/복사해 재등록하니 해결됨. Supabase Auth Logs에서 `/callback`
    요청의 상세(JSON) 안 `msg`/`error` 필드를 봐야 진짜 원인이 나옴(요약 로그의 status 302만으로는
    성공/실패 구분 불가)
  - **Phase 3 완료 — 데이터 레이어 Supabase 전환**: `CrudRepository<T>`를 동기(`getAll(): T[]`)에서
    비동기(`getAll(): Promise<T[]>`)로 변경(Supabase는 네트워크 호출이라 태생적으로 동기 구현이 불가능
    — localStorage 시절과의 근본적인 차이). `src/data/supabaseAdapter.ts`(신규)가 실제 구현체:
    categories/tags/ingredients는 household 단위 공용 팩토리(`createHouseholdRepository`)로, recipes는
    `recipe_tags` 조인 + `is_public` 로직 때문에 별도 구현. `src/data/store.ts`를 전면 재작성해서
    `initializeDataLayer(householdId, userId)`를 로그인+household 확정 후 `App.tsx`에서 한 번 호출 —
    그 전까지는 각 스토어가 빈 배열+로딩 상태. `useIngredients()`/`useRecipes()` 등 훅 시그니처는 그대로라
    features 쪽 컴포넌트는 대부분 안 건드림(단, `saveX`/`deleteX`가 이제 Promise를 반환하므로 결과를
    기다려야 하는 곳 — `RecipeEditor.tsx`의 태그/재료 자동 생성 후 레시피 저장 흐름 — 은 async/await로
    수정함, 안 그러면 방금 만든 재료/태그가 DB에 실제로 커밋되기 전에 레시피가 그걸 참조하려다 FK
    위반이 날 수 있음). `src/data/repos.ts`는 완전히 안 쓰게 돼서 삭제.
    - **PantryStatus 통합**: 예전엔 별도 `PantryStatus` 맵(ingredientId→boolean)이었는데, household 공유
      스키마에서는 `ingredients.owned` 컬럼 하나로 통합(`supabase/migrations/0003_ingredients_owned.sql`).
      `usePantryStatus()`는 이제 `ingredients` 목록에서 파생시키는 방식으로 내부 구현만 바뀌고 반환 타입은
      그대로라 `IngredientsPage.tsx`/`ShoppingListPage.tsx`는 무수정.
    - **shopping_selection**: household 공유 테이블이라 `src/data/shoppingSelection.ts`도 Supabase 직접
      호출로 재작성, `initializeShoppingSelection(householdId)`를 `App.tsx`에서 데이터 레이어와 함께 초기화.
    - **백업(JSON 내보내기/가져오기)**: `backup.ts`가 이제 스토어의 캐시 스냅샷(`getIngredientsSnapshot()`
      등, React 훅이 아닌 일반 함수)을 읽고, 가져오기는 각 `replaceAllX`를 await하도록 변경. pantryStatus는
      가져올 때 각 재료의 `owned` 필드로 다시 접어넣음(백업 JSON 포맷 자체는 안 바꿈).
    - **버그(수정 완료) — ID를 uuid로 변경**: `makeId(prefix)`가 localStorage 시절 그대로 `cat-xxx`/
      `recipe-xxx` 형태의 문자열을 만들고 있어서, Supabase의 모든 `id` 컬럼이 `uuid` 타입인 것과 충돌 —
      새 재료/태그/카테고리/레시피를 만들 때마다 `invalid input syntax for type uuid` 400 에러로 저장이
      실패했음(Supabase 대시보드 **Logs → Postgres**에서 발견). `makeId()`를 인자 없이 `crypto.randomUUID()`를
      반환하도록 변경, 모든 호출부(`makeId('cat')` 등)에서 인자 제거. 앞으로 새 테이블/엔티티를 추가할 때도
      클라이언트에서 id를 직접 만든다면 반드시 `makeId()`(진짜 UUID)를 쓸 것 — 다른 형식의 문자열 id를
      쓰면 같은 에러가 재발함.
    - **에러 메시지 처리 버그(수정 완료)**: Supabase 에러(PostgrestError)는 `Error` 인스턴스가 아니라
      `message` 속성만 있는 일반 객체라서, `err instanceof Error ? err.message : fallback` 패턴을 쓰면
      항상 fallback으로 빠져 실제 에러 내용이 안 보임. `src/lib/errorMessage.ts`의 `getErrorMessage()`로
      통일(Error 인스턴스와 `{message}` 객체 둘 다 처리) — Supabase 호출을 감싸는 catch 블록은 항상 이
      헬퍼를 쓸 것. 겸사겸사 `console.error`도 같이 남겨서 화면 문구와 별개로 콘솔에서 원본 에러 확인 가능.
    - **아직 안 함(Phase 4)**: API 키(Anthropic/Gemini) 저장을 localStorage 평문 → Supabase Vault
      암호화 + 서버리스 함수 경유로 전환하는 작업, household 신규 데이터 없음(새 household는 빈 상태로
      시작 — 기존 로컬 데이터를 옮기는 마이그레이션 스크립트는 별도로 요청 시 진행)
- **레시피 관리 화면(모바일 개편)**: `RecipesPage.tsx`가 기본으로 2열 그리드 카드 뷰를 보여줌
  (`.recipe-grid`/`.recipe-card`, 기존 "따뜻한 아날로그 + Soft UI" 변수 재사용). 카드 = 대표 이미지
  (첫 조리 단계 이미지 → 없으면 태그 기반 이모지 플레이스홀더, 완성 사진 필드가 나중에 생기면 그게
  우선하도록 설계) + 이름 + 태그 최대 2개 + 인분/총 조리시간(타이머 있는 단계 합산, `computeTotalCookMinutes`).
  화면 우측 상단 아이콘 버튼(☰/▦)으로 리스트 뷰(`.recipe-list`, 작은 썸네일 + 정보 한 줄, 더 조밀함)로
  전환 가능 — 선택은 `src/data/viewMode.ts`(localStorage, theme.ts와 같은 패턴)에 기기별로 저장됨.
  - **검색+필터**: 검색은 레시피 이름과 재료 이름 둘 다 매칭, 300ms 디바운스. 필터(태그/카테고리, 알러지
    제외, 신규 "🧺 보유 재료로 가능한 것만" — 레시피가 쓰는 재료 전부가 `owned=true`인 경우만 통과)는
    가로 스크롤 가능한 한 줄(`.chip-row-scroll`)로 통합, 전부 AND 조건으로 동시 적용 가능
  - **정렬**: 최근 추가순(기본, `Recipe.createdAt` 기준 — DB의 `recipes.created_at`을
    `supabaseAdapter.ts`에서 매핑) / 이름순(`localeCompare('ko')`). "자주 해먹은 순"은 CookingLog가
    아직 미구현이라 제외 — 나중에 요리 기록 기능이 생기면 SortMode에 추가할 지점으로 남겨둠
  - **빈 상태**: 필터 결과가 없으면 "조건에 맞는 레시피가 없어요" + 필터 초기화 버튼, 레시피가 아예
    없으면 "첫 레시피를 만들어보세요" + 추가 버튼
  - **성능**: 지금은 전부 클라이언트 사이드 필터링/정렬(레시피 몇십 개 규모에서는 충분히 빠름).
    레시피가 수백 개 이상으로 늘어나면 서버 사이드 필터링/정렬 + 페이지네이션으로 옮기는 걸 고려할 것
    (RecipesPage.tsx에도 같은 주석 남겨둠)
  - **레시피 카드에서 뺀 것**: 기존 목록 카드에 있던 "🛒 담기"/"삭제" 버튼은 그리드에서 실수로 누르는
    걸 방지하려고 뺐음 — 담기는 상세 화면에 이미 있고, 삭제는 상세 화면(`RecipeDetailPage.tsx`)의
    "수정" 옆으로 옮김. 알러지 배지도 카드에서는 뺐음(이미 알러지 제외 필터가 있어 중복 판단) — 필요해지면
    다시 넣을 수 있음

## 향후 확장 계획 (지금부터 구조는 열어두되 구현은 나중에)
- **로그인 화면 UX 개선**: 이메일 로그인 흐름을 화면 전환(예: 확인 이메일 발송 화면)까지는 개선했지만,
  전체적으로 더 사용자 친화적으로 다듬을 여지가 있음(구체적인 방향은 아직 미정 — 나중에 다시 검토)
- **다중 사용자**: 부부가 같이 보고 수정할 수 있게 — 위 "DB 전환(Supabase)" 항목에서 진행 중
- **재료 자동 인식**: 영수증/냉장고 사진 찍어서 재료 자동 등록 (Claude API 이미지 인식 활용 예정)
- **요리 기록**: 언제 어떤 레시피를 해먹었는지 로그 (아래 데이터 모델에 스텁 포함)
- **손님초대모드(메뉴 세트)**: 여러 레시피를 묶어서 하나의 "메뉴 세트"로 저장/재사용 (아래 데이터 모델에 스텁 포함)
- **음성 대화형 요리 어시스턴트**: 조리 중 화면을 안 만지고 "타임 시작해줘" → 타이머 시작, 완료 시 "완료하셨나요?
  다음으로 넘어갈까요?" 음성 안내처럼 핸즈프리로 진행. 브라우저 Web Speech API로 TTS(무료, 크로스브라우저)/STT(크롬·
  안드로이드 위주)는 기술적으로 가능. 매번 AI 호출하면 느리고 비용 드니, 자주 쓰는 명령(시작/다음/얼마나 남았어)은
  키워드 매칭으로 즉시 처리하고 자유 질문("이거 얼마나 끓여야해?")만 기존 AI 채팅으로 넘기는 하이브리드 구조 추천.
  MVP는 TTS(타이머 완료 음성 알림)부터, STT는 다음 단계로
- **레시피 완성 사진 첨부**: AI가 생성하는 단계별 이미지(구현 완료 — 아래 "이미지 저장(IndexedDB)" 참고)와
  별개로, 사용자가 직접 찍은 완성 요리
  사진을 레시피에 첨부해서 보여주는 기능. `Recipe`에 사진 데이터(또는 참조) 필드 추가 필요. 레시피당 한 장
  정도면 위 단계별 이미지보다는 용량 부담이 적지만, 여러 장 누적되면 결국 같은 이슈(localStorage 용량
  한계 → IndexedDB 전환)를 공유하므로 같이 검토할 것

## 핵심 기능 요구사항

### 0. 로그인 화면
- "CookKit" 타이틀 + **구글 로그인**(메인) 버튼. 아래에 "이메일로 로그인" 링크를 누르면 이메일/비밀번호
  로그인·회원가입 폼이 펼쳐짐(구글 계정이 없거나 네트워크 제약으로 구글 접속이 막힌 환경 대응 — 정식 기능)
- 로그인 후 소속 household가 없는 신규 유저는 "가구 만들기/초대코드로 참여하기" 온보딩 화면으로 유도됨
  (`HouseholdOnboarding.tsx`)

### 1. 재료(보유현황) 관리 화면
- 카테고리는 고정 2종이 아니라 **사용자가 추가/이름변경/삭제할 수 있는 항목**(카테고리 관리 화면 별도 존재).
  기본 시드: 채소, 육류·해산물, 유제품, 곡류, 소스·양념, 기타
- UI는 카테고리별 접기/펼치기가 가능한 컴팩트 리스트(한 줄에 이름+보유토글, 알러지는 아이콘/개수로 축약)
- 각 재료의 보유 여부(있음/없음)를 토글로 관리, 레시피와 독립적으로 저장
- 각 재료에 **알러지 유발 성분 태그**(allergens)를 등록/수정하는 액션 포함
  (예: 마늘 → allergens: ['마늘'], 토마토파스타소스 → 제품에 따라 ['마늘'] 붙일 수도 있음)
- **재료별 개인 선호 설정**: 알러지와 같은 "상세 설정" 모달(`IngredientDetailModal`)에서 선호 계량 단위
  (`preferredUnit`, COMMON_UNITS 중 선택)와 선호 방식(`preferredMethod`)을 함께 설정. 방식은 자유 텍스트를
  매번 입력하게 하면 불편해서 **자주 쓰는 프리셋 칩**(다진 것/편으로/그라인더로/가루로/생것 그대로) 중
  선택하는 방식이 기본이고, "직접입력" 칩을 고를 때만 자유 텍스트 입력창이 나타남(진짜 특이한 경우만
  텍스트로). 온보딩으로 몰아서 받지 않고 그 재료 편집 화면에서 그때그때 설정하는 방식. 설정된 재료는 AI
  레시피 생성/수정 프롬프트에 참고 정보로 자동 전달되어(`buildExistingContextNote`) 레시피에 반영됨
  (예: 소금이 "선호 단위: 작은술"이면 그 단위로 표기 시도)

### 2. 레시피 관리 화면 (앱의 메인 화면)
- 기본 진입 탭 — 레시피를 보다가 장보기로 자연스럽게 이어지는 흐름의 중심
- 레시피를 쉽게 추가할 수 있어야 함:
  - **대화형 AI로 레시피 만들기/수정하기** (`RecipeChatPanel.tsx`) — 텍스트 설명을 처음 입력하는 것과
    이미 있는 초안을 고치는 것을 화면을 나누지 않고 하나의 채팅 흐름으로 통합. "고추기름을 사서 넣을지
    직접 만들지"처럼 애매한 부분은 **AI가 먼저 되물음**(자유 텍스트 응답과 구조화 제안을 한 응답에서
    섞어야 해서 `output_config.format` 대신 `propose_recipe` 커스텀 툴/함수를 호출하는 방식 사용).
    이 대화는 **실시간 웹 검색이 아니라 AI의 학습 지식 기반 구조화**이며, 사용자가 "웹 검색으로 참고하기"
    체크박스를 켜면 Claude는 `web_search`, Gemini는 `googleSearch`를 추가로 사용해 실제 표준 레시피를
    찾아 참고함(끄면 학습 지식만 사용, 검색 켜면 응답이 몇 초 더 걸림 — 개인 사용 기준 비용은 무시 가능한
    수준). Gemini 3 계열은 커스텀 함수+내장 툴을 같이 쓰려면 `toolConfig.includeServerSideToolInvocations:
    true`가 필요함(안 켜면 400 에러).
  - AI가 레시피를 제안할 때 **태그/재료 카테고리도 기존 목록 중에서 최대한 재사용해 자동 선택**하고,
    마땅한 게 없으면 새로 만들면서 대화 답변으로 짧게 안내함(`tagNames`/`categoryName` 필드, 기존
    태그·카테고리·재료 이름 목록을 프롬프트에 함께 전달 — `src/lib/aiChat.ts`의 `buildExistingContextNote`)
  - AI가 제안(propose_recipe)해도 **바로 폼에 반영되지 않고**, 지금 폼 상태와 비교한 변경 요약(재료
    추가/제거/수량 변경, 태그 변경 등 — `src/lib/recipeDiff.ts`, 추가=초록/제거=빨강/변경=강조색으로
    색 구분)을 먼저 보여준 뒤 "이대로 반영하기 / 무시하기"로 사용자가 확정. 채팅 입력창은 여러 줄 입력
    가능(Enter=전송, Shift+Enter=줄바꿈)
  - AI 적용(채팅 확정 또는 유튜브 변환)으로 폼이 바뀌기 직전 상태를 스택에 쌓아두고 **"AI 반영 이전으로
    되돌리기"** 버튼으로 여러 단계 되돌릴 수 있음(`RecipeEditor.tsx`의 `undoStack`)
  - **기존 레시피 수정 시 현재 내용을 대화에 자동으로 알려줌** — 편집 화면을 열면 대화가 비어있어도 지금
    폼에 있는 재료/조리순서/태그를 시스템 프롬프트에 포함시켜서(`buildCurrentRecipeNote`), "이 레시피를 더
    맵게 해줘" 같은 첫 메시지만으로 바로 수정 제안이 나옴. 채팅 패널 상단에 "지금 폼에 있는 '~' 내용을
    참고해서 대화해요"를 접기/펼치기(`<details>`)로 표시해 실제 참고 내용(재료·조리순서·태그 전체)을
    펼쳐볼 수 있음
  - 자주 쓰는 수정 요청("더 맵게", "재료 줄이기", "1인분으로")을 원클릭으로 보낼 수 있는 프리셋 칩 제공
    (기존 레시피 편집 중일 때만 노출)
  - **유튜브 링크로도 변환 가능**(별도 섹션, 채팅과는 분리) — 실제 영상 자막을 자동으로 추출해 사용함
    (`api/youtube-transcript.ts` 서버리스 함수, 한국어 자막 우선 → 영어 → 자동생성 자막 순 폴백). 로딩
    중에는 "자막 추출 중..." → "레시피 분석 중..."으로 단계가 표시됨. 자막이 아예 없는 영상은 지원 범위
    밖이라 명확한 안내 메시지와 함께 중단되고(대화창/직접 붙여넣기로 유도), 비공개·삭제된 영상은 별도
    메시지로 구분함. 결과는 항상 편집 폼에 채워서 사용자가 검토 후 저장(자동 저장 안 함), 추출이
    불확실하면 경고 문구 표시. 자세한 한계는 "유튜브 자막 추출 관련 TODO" 참고
- 레시피 수정 가능(상세 화면에서 편집 진입)
- **인분 조절 기능** (필수): 레시피 상세 화면에서 인분을 바꾸면 모든 재료 수량이 비례해서 자동 재계산됨
- **레시피 태그/카테고리**: 스타일 태그(크림류, 토마토류, 고기요리, 국물요리 등)를 레시피에
  달 수 있고, 태그를 새로 만들거나 편집/삭제하는 관리 액션도 별도로 존재
- **재료 단위**: 자유 텍스트가 아니라 자주 쓰는 단위(g, kg, ml, L, 개, 큰술, 작은술, 컵, 공기, 팩, 봉지,
  조각, 알, 단, 약간) 선택형 + "직접입력" 예외 처리 (`src/data/units.ts`)
- **조리 단계 타이머**: 초 단위 직접 계산 대신 분/초 두 칸 입력으로 편집(내부 저장은 여전히 초 단위 `timerSeconds`)
- **조리 단계 순서 변경**: 각 단계 카드에 "▲/▼" 버튼으로 배열 내 순서를 바꿀 수 있음(드래그 앤 드롭 대신
  단순 인덱스 교체 방식 — 모바일 터치에서 더 안정적)
- **조리 단계별 이미지**(AI 생성 또는 직접 업로드): 레시피 편집 화면의 각 조리 단계 카드에서 "🎨 이미지
  생성"(Gemini 전용, 온디맨드, 자동 생성 안 함) 또는 "📁 사진 업로드"(제공자 무관, 직접 찍은 사진으로 즉시
  교체)로 설정. 레시피 상세 화면(`RecipeDetailPage.tsx`)에서도 이미지가 단계 카드 상단에 표시됨. 저장
  방식은 "이미지 저장(IndexedDB)" 항목 참고
- **알러지 필터**: 레시피 자체에 알러지 태그를 수동으로 다는 대신, 레시피가 사용하는 재료들의 allergens
  값을 모아서 **자동으로 계산**됨. 레시피 목록 화면에서 "마늘 제외" 등 필터 가능(재료 기반 파생 속성)
- **장보기 유도**: 레시피 목록/상세 화면에 "🛒 장보기에 담기" 버튼이 있어, 누르면 장보기 선택 목록(공유
  저장소, `src/data/shoppingSelection.ts`)에 추가됨 — 장보기 탭으로 이동해도 선택이 유지됨

### 3. 장보기 리스트 화면
- 더 이상 별도의 "메인" 화면이 아니라, 레시피에서 "담기"로 유도되어 도착하는 화면
- 담긴 레시피들에 필요한 재료를 자동으로 집계 (재료ID+단위 기준 합산)
- 필터: 전체 / 구매 필요 / 보유
- 재료별 "실제 필요량"과 "장 볼 때 사야 할 추천 단위"는 별개 값으로 관리

### 4. 데이터 백업 (JSON 내보내기/가져오기)
- 로컬 저장만 쓰므로 브라우저 데이터 삭제 시 유실 위험, DB 연동 전환 시에도 마이그레이션 통로 필요
- "내보내기" 시 recipes, ingredients, categories, tags, pantryStatus 전체를 하나의 JSON 스냅샷으로 다운로드
- "가져오기" 시 JSON 업로드하면 로컬 저장소에 복원(전체 교체)
- 이 JSON 스키마를 나중에 DB 마이그레이션 스크립트의 기준 포맷으로도 재사용할 것
- **알려진 한계**: 조리 단계 이미지(IndexedDB)는 이 백업 스냅샷에 포함되지 않음 — 내보내기/가져오기해도
  이미지는 유지/복원되지 않고 `RecipeStep.imageId` 참조만 남아 깨진 상태가 될 수 있음(다시 생성 필요)

## 데이터 모델 (최신)
```
Recipe {
  id, name, servingsBase, tagIds[] (카테고리/스타일 태그),
  ingredients: [{ ingredientId, amount, unit }],
  steps: [{ title, content, timerSeconds?, imageId? }],
  createdAt?: string  // DB recipes.created_at 매핑, 레시피 목록 "최근 추가순" 정렬용
  // allergens는 저장하지 않음 — ingredients를 통해 항상 파생(computed) 계산
  // imageId는 IndexedDB(src/data/imageStore.ts)에 저장된 AI 생성 이미지 참조(실제 이미지 데이터 아님)
}

Ingredient {
  id, name, categoryId (Category.id 참조, 사용자가 관리),
  defaultBuyUnit (예: '1팩', '800g'),
  allergens: string[] (예: ['마늘'], ['밀가루']),
  preferredUnit?: string (예: '작은술' — AI 레시피 생성 시 참고),
  preferredMethod?: string (예: '그라인더로 갈아서' — AI 레시피 생성 시 참고),
  owned: boolean (보유 여부 — household 공유, Supabase ingredients.owned 컬럼)
}

Category {
  id, name  // 채소, 육류·해산물, 유제품, 곡류, 소스·양념, 기타 등 — 사용자가 추가/이름변경/삭제 가능
}

Tag {
  id, name, type ('style' | 'category')  // 크림류, 고기요리 등 관리 가능한 목록
}

// PantryStatus는 더 이상 별도 저장소가 아니라 Ingredient.owned에서 파생되는 뷰(Record<id, boolean>).
// usePantryStatus() 훅의 반환 타입 호환을 위해 store.ts에서 계산만 함 — DB에 따로 저장 안 함.

ShoppingSelection: string[]  // 장보기에 담긴 recipeId 목록 (household 공유 테이블, shopping_selection)

// --- 아래는 지금 구현하지 않지만 구조만 남겨둘 것 ---
CookingLog {  // 향후: 요리 기록
  id, recipeId, cookedDate, memo?
}

MenuSet {  // 향후: 손님초대모드
  id, name, recipeIds[], guestCount?, plannedDate?
}
```

## 참고: 지금까지 확정된 실제 레시피 (시드 데이터로 활용 중)
1. 마늘 없는 밥 크림 리조또 (2인분)
2. 마늘 없는 밥 토마토 리조또 (2인분)
3. 부챗살 스테이크 (4인분)
4. 단호박스프 (4인분)

원본 참고자료(`요리_재료_관리.html`, `리조또_레시피_모음.md`)가 프로젝트에 없어 이름과 카테고리만 보고
합리적으로 추정해 시드 데이터를 작성함 — 실제 레시피와 다를 수 있으니 앱에서 확인 후 수정할 것.

## 유튜브 자막 추출 관련 TODO
- 자막이 실제로 있는 영상은 `youtube-transcript` + Vercel Serverless Function 조합으로 자동 추출
  완료(한국어 → 영어 → 자동생성 자막 순 폴백, 각 실패 상황(자막 없음 / 비공개·삭제 영상)을 구분한
  에러 메시지 제공).
- **자막이 아예 없는 영상**: 처음엔 이 경우 영상의 음성을 직접 다운로드해서 STT(Whisper 등)를 돌리는
  방식을 검토했으나, 조사 결과 `@distube/ytdl-core`(오디오 추출용 후보 라이브러리)가 이미 폐기(2025-08
  저장소 archive)됐고, 대안인 `yt-dlp`조차 **Vercel 같은 데이터센터 IP에서는 유튜브 봇 차단 임계치가
  훨씬 낮아**(라이브러리 문제가 아니라 IP 평판 기반 차단이라 어떤 도구를 써도 동일) 직접 구현은 신뢰성이
  낮다고 판단해 보류함.
- 대신 **Supadata(supadata.ai) API로 폴백** 도입: 자막이 없을 때만 `/api/youtube-transcript`가
  Supadata에 `mode=auto`로 재요청 → 자막 우선 시도, 없으면 Supadata가 자체적으로 오디오 STT(Whisper)까지
  대신 처리해 텍스트를 돌려줌. 오디오 다운로드/봇 차단 리스크를 우리가 직접 떠안지 않고 위임하는 구조.
  긴 영상은 Supadata가 작업(jobId)을 만들어 비동기 처리하며, 서버는 최대 100초까지 폴링 후 응답(Vercel
  함수 `maxDuration: 120` — Hobby 플랜에서 60초 넘게 쓰려면 프로젝트에서 Fluid Compute를 켜야 함).
- **환경변수 필요**: `SUPADATA_API_KEY`를 Vercel 프로젝트 환경변수로 설정해야 이 폴백이 동작함
  (supadata.ai 가입 후 발급, 무료 티어 월 100건). 다른 API 키들과 달리 이건 **브라우저 localStorage가
  아니라 서버(Vercel) 쪽 환경변수** — 서버 함수가 직접 호출하기 때문. 키가 없으면 이 폴백 없이 기존처럼
  "자막 없음" 에러만 반환하도록 안전하게 동작(하위 호환).
- 그래도 Supadata 폴백까지 실패하면: 자막이 없는 영상은 명확한 에러 메시지를 보여주고, 사용자가 상단
  대화창에서 텍스트로 직접 설명해 레시피를 만드는 기존 기능으로 유도함.
