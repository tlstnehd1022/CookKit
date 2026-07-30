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
- **8차 확장 완료 — 카테고리 중복 버그 수정 + 태그 국가/스타일 축 + 난이도/조리시간 자동 판단**: 재료
  카테고리 그루핑 버그의 진짜 원인(중복 생성 레이스 컨디션)을 찾아 수정하고 정리 스크립트 추가(위
  "버그(수정 완료) — 카테고리 중복 생성 레이스 컨디션" 참고). Tag에 `cuisine` 타입 추가(한식/양식 등,
  스타일/카테고리 태그와 별개 축, 레시피 편집 화면에서 구분된 섹션으로 다중 선택). Recipe에
  `difficulty`/`difficultyReason`/`estimatedMinutes` 필드 추가 — 규칙 기반 자동 계산(아래 "난이도/
  조리시간 자동 판단" 항목 참고), AI 대화형 생성 시에도 propose_recipe가 난이도를 함께 판단해서 채움.
- **9차 확장 완료 — 이미지 저장 Supabase Storage 전환 + 완성 사진**: 조리 단계 이미지 저장소를 기기
  로컬 IndexedDB에서 Supabase Storage(household 공유)로 옮겨서 household 구성원이 다른 기기에서도
  같은 이미지를 볼 수 있게 함. 완성 요리 사진(`Recipe.finalImageId`) AI 생성/업로드 기능 추가, 조리
  단계 이미지와 완성 사진이 같은 화풍 가이드(`IMAGE_STYLE_GUIDE`)를 공유하도록 통일. 자세한 내용은
  아래 "이미지 저장(Supabase Storage)" 항목 참고.
- **10차 확장 완료 — 다른 가구 공개 레시피 둘러보기/복사 + 레시피 공개범위 3단계**: RLS 보완 + "둘러보기"
  화면 + "내 레시피로 복사하기"(재료/태그/난이도/조리시간/이미지까지 완전 복제) + 레시피 편집 화면의
  공개범위 선택(개인 소유/가구 공유(기본)/전체 공개, `is_public` boolean을 대체)까지 완료. 공개 레시피
  좋아요(하트) 기능도 추가. 자세한 내용은 아래 "레시피 탐색/복사" 항목 참고.
- **11차 확장 완료 — 유튜브 변환 시 완성 사진 자동 제안**: 유튜브 링크로 레시피 변환할 때 영상 썸네일을
  완성 사진(`finalImageId`) 후보로 미리보기+체크박스로 제안, 반영 시 우리 Storage로 실제 복사해서
  저장. CORS 우회를 위해 서버리스 함수를 하나 더 추가(`api/youtube-thumbnail.ts`) — 자세한 내용은 위
  "서버 도입(2호)" 항목 참고.
- **12차 확장 완료 — 레시피 작성자 표시 + 프로필 닉네임/사진 + household 이름 짓기 가이드**: 설정
  화면에 닉네임(`profiles.display_name`) 변경 + household 이름 변경 UI 추가(둘 다 RLS는 이미
  본인/가구원 수정을 허용하고 있어서 프론트만 필요했음), "OO님의 레시피" 작성자 표시를 레시피
  카드/상세 화면(우리집+둘러보기 전부)에 추가, 구글 프로필 사진(`profiles.avatar_url`)도 같이
  저장해 작성자 표시 옆에 작은 아이콘으로 노출. household 생성 화면과 설정 화면 양쪽에 이름
  짓기 가이드 문구("우리집"류의 특정인 기준 호칭보다 "김영희네"처럼 누가 봐도 자연스러운 이름
  추천) 추가. 자세한 내용은 아래 "작성자 표시/프로필" 항목 참고.
- **13차 확장 완료 — API 키 Vault 전환(DB 전환 Phase 4)**: Anthropic/Gemini API 키를 브라우저
  localStorage 평문 저장에서 Supabase Vault 암호화 저장으로, 실제 AI 호출(대화/이미지 생성/유튜브
  자막→레시피 추출)도 브라우저 직접 호출에서 서버리스 함수 경유로 전환. 설정 화면의 키 입력 UI도
  마스킹 표시 + 인라인 편집 방식으로 개편, 기존에 localStorage에 남아있던 평문 키를 서버로 옮기는
  1회성 마이그레이션 배너도 추가. 자세한 내용은 아래 "API 키 Vault 전환" 항목 참고.

## 기술 스택 / 아키텍처 결정
- **프론트엔드**: React + Vite + TypeScript, 탭 기반 네비게이션(별도 라우터 없음)
- **탭 전환은 언마운트가 아니라 hidden 속성으로 감추기만 함(`App.tsx`)**: 예전엔 `{tab === 'recipes' &&
  <RecipesFeature />}` 식 조건부 렌더링이라 다른 탭(재료/장보기 등)에 갔다 오면 레시피 탭이 통째로
  언마운트→재마운트돼서, 대화형 AI 채팅 중이던 메시지, 편집 중이던 폼 내용, 진행 중이던 이미지 생성
  작업 등이 전부 날아갔음(언마운트된 컴포넌트로의 `setState`는 조용히 무시되므로, 응답이 늦게 와도
  결과가 반영 안 됨). 4개 탭을 항상 동시에 마운트해두고 `hidden` 속성으로 안 보이는 탭만 화면에서
  감추는 방식으로 바꿔서 해결 — 각 탭은 이미 로드된 공유 store(`store.ts`)를 구독만 하므로 동시에
  마운트해둬도 추가 네트워크 요청이 없어 비용이 거의 없음. 레시피 탭 안에서 목록→상세→편집처럼
  스스로 화면을 전환하는 것(`RecipesFeature.tsx`의 `view` state)은 여전히 조건부 렌더링이라 그대로
  언마운트됨 — 이건 사용자가 명시적으로 "뒤로가기"/"취소"한 것이라 의도된 동작(다른 최상위 탭으로
  갔다 오는 것과는 다른 케이스).
  - **버그(수정 완료) — 브라우저 탭/다른 앱 갔다 오면 화면이 초기화됨**: 위 hidden 방식으로 바꾼
    뒤에도, 앱 내부 탭이 아니라 **브라우저 탭 자체를 벗어났다가(다른 브라우저 탭, 다른 프로그램)
    돌아오면** 여전히 레시피 편집/채팅 화면이 목록으로 초기화되는 문제가 남아있었음. 원인은 다른
    곳 — 브라우저 탭이 다시 포커스를 받으면 Supabase가 세션을 재확인하면서 `session.ts`의
    `onAuthStateChange`가 (같은 계정인데도) `user`를 매번 새 객체 참조로 갱신했고, `household.ts`의
    `useHousehold()`가 `refresh` 콜백을 `user` 객체 전체에 의존시키고 있어서 이 참조 변화만으로도
    `useEffect`가 다시 실행돼 `loading`을 `true`로 되돌렸음. `App.tsx`는 `householdLoading`일 때
    전체 트리를 `null`로 반환(사실상 전체 언마운트)하므로, 그 직후 다시 `false`가 되면서 앱 전체가
    처음부터 재마운트 → 탭 선택도 `view` state도 전부 초기값으로 리셋됐던 것. `refresh`의 의존성을
    `user`(객체) 대신 `user?.id`(문자열)로 좁혀서, 실제 로그인 계정이 바뀔 때만 다시 조회하도록
    수정. 앞으로 `useSession()`의 `user`를 훅 의존성 배열에 넣을 때는 객체 참조가 아니라 `user?.id`
    처럼 원시값으로 좁혀 쓸 것 — Supabase 세션 갱신 이벤트는 실제 로그인 상태가 안 바뀌어도 새
    객체를 만들어낼 수 있어서, 객체 참조 전체에 의존하면 이런 종류의 불필요한 재실행이 재발함.
- **저장 방식**: 브라우저 localStorage. `src/data/repository.ts`의 `CrudRepository<T>` 인터페이스로 추상화되어 있어
  나중에 실제 DB(Supabase 등)로 전환 시 `src/data/localStorageAdapter.ts`만 다른 어댑터로 교체하면 됨
- **사용자/로그인**: 지금은 실제 인증 없이 고정 사용자(`수동`)로 버튼 클릭 로그인만 존재 (`src/data/session.ts`).
  나중에 실제 로그인(Supabase Auth 등)을 붙일 때는 `login()` 내부 구현만 교체.
  storage key는 `cookkit:{userId}:...` 형태로 이미 사용자 네임스페이스가 걸려 있음(`src/data/repos.ts`) —
  지금은 사용자가 하나뿐이라 동적 재키잉은 하지 않고 고정 접두사만 사용, 실제 다중 사용자 전환 시 이 부분만 일반화하면 됨
- **AI 연동(자연어/유튜브/대화 → 레시피 변환)**: 두 개 제공자를 설정 화면에서 선택 가능(`aiProvider: 'anthropic'|'gemini'`, 기본값 Gemini — 무료 쿼터 때문에 추천).
  - **Anthropic**: `@anthropic-ai/sdk`로 호출 (`src/lib/claudeClient.ts`)
  - **Gemini**: SDK 없이 REST 엔드포인트(`generativelanguage.googleapis.com`)를 fetch로 직접 호출 (`src/lib/geminiClient.ts`).
    유튜브 변환은 YouTube Data API(선택, 무료)로 제목/설명란만 가져오고, 자막은 공식 API로 못 가져오므로 사용자가 직접 붙여넣는 방식으로 보완
  - **API 키는 Supabase Vault에 암호화 저장 + 실제 호출은 서버 경유(13차 확장, 아래 "API 키 Vault
    전환" 항목 참고)** — `claudeClient.ts`/`geminiClient.ts`의 함수들(`chatAboutRecipe`,
    `extractRecipeFromTranscript` 등)은 원래도 apiKey를 인자로 받는 순수 함수라 브라우저/서버
    양쪽에서 동일하게 재사용됨. 이 문단의 나머지 설명(모델 ID 관리 등)은 여전히 유효.
  - Gemini 모델명은 제공자가 자주 구세대 모델을 신규 키에 차단하므로(예: 2026-07-09부터 `gemini-2.5-flash` 차단),
    설정 화면에서 직접 모델 ID를 입력받게 되어 있음 — 오류 시 최신 모델 ID로 교체 필요
  - **이미지 생성 모델도 설정에서 교체 가능**(`settings.geminiImageModel`, 기본값 `GEMINI_IMAGE_MODEL`
    상수와 동일한 `gemini-3.1-flash-image`) — 텍스트 모델과 같은 이유(모델 세대별 접근 제한)로
    하드코딩 대신 사용자 입력을 받도록 함. 실사용 중 발견: `gemini-3.1-flash-image`는 **무료
    티어에 아예 없는 유료 전용 모델**이라(2026-07 기준), 무료로 이미지 생성을 테스트하려는
    사용자는 `gemini-2.5-flash-image`("Nano Banana" 1세대, 무료 티어 하루 약 500장, 1024x1024)로
    바꿔볼 수 있음 — 다만 신규 발급 API 키는 2.x 세대 모델 자체가 막혀있을 수 있어 계정/키 발급
    시점에 따라 될 수도 안 될 수도 있음. Google이 모델별 고정 rate limit 표를 더 이상 공개하지
    않아(계정별로 AI Studio 콘솔에서만 확인 가능) 정확한 한도는 사용자가 직접 확인해야 함.
- **서버 도입(1호) — 유튜브 자막 추출용 Vercel Serverless Function**: 원칙적으로 클라이언트 단독 구조를
  유지하되, "유튜브 자막을 브라우저에서 직접 긁어오는 것"만은 예외로 최소 서버를 도입함. 이유: 자막
  추출에 쓰는 `youtube-transcript` 패키지는 유튜브의 비공식 엔드포인트에 직접 `fetch`하는데, 유튜브가
  CORS를 허용하지 않아 브라우저에서 실행하면 무조건 막힘(Node/서버 환경에서만 동작). 그래서 이 부분만
  `api/youtube-transcript.ts`(Vercel Serverless Function)로 분리해 서버에서 실행하고, 프론트는
  `/api/youtube-transcript?url=...`를 호출해 이미 추출된 자막 텍스트만 받아옴(`src/lib/youtubeTranscript.ts`).
  (13차 확장에서 AI 호출 자체도 서버 경유로 전환됨 — 아래 "API 키 Vault 전환" 항목 참고.)
  - 로컬 개발 시 `npm run dev`(순수 Vite)로는 `/api/*`가 안 뜸 — `npm run dev:full`(`vercel dev`)로 실행해야
    프론트+서버리스 함수가 같이 뜸. 배포는 GitHub 저장소를 Vercel 프로젝트에 연결해두면 push할 때마다
    자동 빌드/배포됨(이미 기기 간 코드 동기화를 GitHub로 하고 있어서 자연스럽게 이어짐)
  - 다중 사용자 등으로 "진짜" 백엔드를 붙이게 되면, 이 서버리스 함수가 있던 자리(`api/`)를 그대로 확장해도
    되고 별도 백엔드로 흡수해도 됨 — 지금은 이 기능 하나만을 위한 최소 범위로 한정함
  - **서버 도입(2호) — 유튜브 썸네일 프록시**: 유튜브 변환 시 영상 썸네일을 완성 사진(`finalImageId`)
    후보로 자동 제안하는 기능을 추가하면서, 같은 CORS 문제를 한 번 더 만남 — `img.youtube.com` 썸네일은
    `<img>` 태그로 화면에 보여주는 건 되지만(CORS 무관), Supabase Storage에 업로드하려면 실제 바이트를
    `fetch`로 읽어야 하는데 그건 CORS가 막음. `api/youtube-thumbnail.ts`를 추가해 서버에서 대신
    받아오고(`maxresdefault.jpg` 우선 시도, 없는 영상은 유튜브가 120x90 더미 이미지를 200 OK로
    내려주므로 `content-length`가 작으면 `hqdefault.jpg`로 폴백 — 모든 영상에 항상 존재), 그 바이트를
    그대로 응답에 실어 내려줌(`Access-Control-Allow-Origin: *`). 프론트는 유튜브 변환 결과 미리보기에
    `<img src="https://img.youtube.com/vi/{id}/hqdefault.jpg">`로 직접 표시(미리보기는 CORS 문제
    없음)하고, 사용자가 체크박스로 "완성 사진으로 사용" 선택 후 반영을 누르면 그때 `/api/youtube-thumbnail`
    프록시를 거쳐 받은 바이트를 `imageStore.ts`의 `saveImageFromUrl`로 우리 household Storage 경로에
    저장(외부 URL을 그대로 저장하지 않음 — 나중에 유튜브 쪽 URL이 깨지거나 바뀌어도 우리 복사본은
    안전). 조리 단계별 이미지는 여전히 AI 생성/직접 업로드만 지원(영상에서 자동 추출은 신뢰도가 낮다고
    이미 판단해서 범위 밖 — "유튜브 자막 추출 관련 TODO" 항목의 STT 관련 판단과 같은 맥락).
- **이미지 저장(Supabase Storage) — 조리 단계별 + 완성 사진 AI 이미지 생성용**: Gemini
  (`gemini-3.1-flash-image`, "Nano Banana" 계열)로 이미지를 생성하는 기능은 Claude가 이미지 생성을
  지원하지 않아 **Gemini 전용**임(`src/lib/geminiClient.ts`의 `generateStepImage`/`generateFinalDishImage`
  — 둘 다 같은 재시도 로직을 공유하는 `generateImageWithRetry`의 별칭, `buildStepImagePrompt`/
  `buildFinalDishImagePrompt`). 레시피 편집 화면에서 단계별로 "🎨 이미지 생성" 버튼을 눌러 온디맨드로만
  생성함(저장 시 전체 자동 생성 안 함 — 속도/비용 고려).
  - **저장 위치(8차 확장에서 IndexedDB → Supabase Storage로 전환)**: 예전엔 기기 로컬 IndexedDB에
    저장해서 다른 기기/다른 household 구성원이 볼 수 없었음(개인 앱일 땐 문제없었지만 다중 사용자
    전환 후엔 한계). `recipe-images` 버킷(비공개, RLS로 household 멤버만 접근 — `supabase/migrations/
    0006_recipe_images_storage.sql`)으로 옮김. 경로 규칙은 `{household_id}/{recipe_id}/{step|final}/
    {임의 파일명}` — `RecipeStep.imageId`/`Recipe.finalImageId`는 이제 이 Storage 경로(문자열)를
    가리킨다(`src/data/imageStore.ts`). `saveImage(path, dataUrl)`은 그 경로에 업로드(같은 경로면
    upsert로 덮어씀 — 재생성 시), `useStoredImage(imageId)` 훅은 비공개 버킷이라 `createSignedUrl`로
    1시간 유효한 signed URL을 비동기로 발급받아 반환. `deleteImage`/`buildImagePath` 등 함수 시그니처는
    예전 IndexedDB 버전과 최대한 비슷하게 유지해서 호출부(`RecipeEditor.tsx` 등) 변경을 최소화함.
    기존 IndexedDB에 있던 이미지는 마이그레이션하지 않음(다시 생성하거나 "이미지 없음"으로 자연스럽게
    표시 — 개인 사용 규모라 감수 가능한 손실로 판단).
    - **버그(수정 완료) — 낡은 imageId 재사용 시 RLS 거부**: 실사용 테스트에서 "다시 생성"을 누르면
      계속 `new row violates row-level security policy` 에러가 났음. 원인은 이 마이그레이션 이전에
      만들어진 `imageId`(IndexedDB 시절, 폴더 구조 없는 단일 UUID)가 스텝에 이미 남아있는 상태에서
      `step.imageId ?? buildImagePath(...)` 패턴이 그 낡은 값을 "이미 있는 이미지"로 착각해 그대로
      재사용했기 때문 — household_id 폴더가 없는 경로라 RLS의 `is_household_member` 체크를 통과할
      수 없어 업로드 자체가 거부됨. `isStorageImagePath(imageId)`(슬래시 포함 여부로 새 형식인지
      판별)로 낡은 형식이면 재사용하지 않고 새 경로를 만들도록 수정(`saveImage`/`useStoredImage`
      호출부 전체). 디버깅은 브라우저 개발자도구 Network 탭에서 실패한 `storage/v1/object/...`
      요청의 실제 경로를 직접 확인해서 찾음(폴더 구조가 아예 없는 것을 보고 원인 특정) — 이번에도
      Supabase 관련 버그는 "화면 에러 메시지"보다 "실제 요청/응답"을 봐야 진짜 원인이 나온다는
      패턴이 반복됨.
    - **버그(수정 완료) — 이미지 배치 생성 시 60초 타임아웃 다발**: "전체 이미지 생성"으로 여러 장을
      `Promise.all`로 동시 요청하면 개별 요청이 평소보다 느려져(동시 부하) 원래도 넉넉하지 않던
      60초 타임아웃을 넘기는 경우가 실사용에서 빈번히 발생(7개 중 5개 타임아웃). 타임아웃(AbortError)은
      기존엔 429/503과 달리 재시도 대상이 아니었어서 즉시 실패 처리됐던 게 원인 — `geminiClient.ts`의
      `requestImageOnce`가 타임아웃 시 `GeminiImageError(..., 408)`(408은 실제 HTTP 응답이 아니라
      우리가 붙이는 sentinel 상태코드)를 던지도록 바꾸고 `RETRYABLE_STATUS_CODES`에 408 추가 —
      이제 타임아웃도 429/503과 같은 지수 백오프(2초→4초)로 자동 재시도됨.
    - Storage 경로에 새 레시피(아직 한 번도 저장 안 한 초안)의 이미지를 미리 생성/업로드할 수 있어야
      해서, `RecipeEditor.tsx`가 편집 화면에 들어오는 시점에 `recipe.id`를 미리 고정해둠(`stableRecipeId`
      — 예전엔 "저장" 버튼을 눌러야 `existing?.id ?? makeId()`로 그때 정해졌음). household id는
      `store.ts`의 `getCurrentHouseholdId()`(훅이 아닌 일반 함수, `initializeDataLayer`가 기억해둔 값을
      그대로 반환)로 다시 네트워크 조회 없이 가져옴.
  - 이미지 생성 요청은 60초 타임아웃(`AbortController`)을 걸어둠 — 원래도 이미지 생성은 텍스트보다 느려서
    (수십 초 단위) 정상 범위이지만, 응답이 안 오고 무한 대기하는 상황은 막기 위함
  - 429(요청 제한)/503(`이미지 생성 모델이 현재 수요가 많습니다` 같은 일시적 과부하)는 흔히 발생하는
    일시적 오류라 지수 백오프(2초→4초)로 최대 3회까지 자동 재시도함(`generateImageWithRetry`). 그 외
    오류는 바로 실패 처리. 배치 생성 중 실패한 항목은 어떤 에러였는지 화면과 콘솔에 그대로 표시됨
  - "🎨 이미지 생성"(AI, Gemini 전용) 옆에 "📁 사진 업로드" 버튼도 있어 사용자가 직접 찍은 사진으로 즉시
    교체 가능(AI 키 불필요, 어떤 AI 제공자를 쓰든 항상 노출). `FileReader.readAsDataURL`로 읽어서 동일하게
    Storage에 저장 — AI 생성이든 업로드든 저장 경로는 같음
  - **스타일 일관성**: `geminiClient.ts`의 `IMAGE_STYLE_GUIDE` 상수(따뜻한 톤 자연광, 나무 도마/대리석
    조리대, 무광 블랙/스테인리스 조리도구, 자연스러운 홈쿠킹 느낌)를 `buildStepImagePrompt`/
    `buildFinalDishImagePrompt` 둘 다 공유해서, 조리 단계 이미지와 완성 사진이 서로 다른 화풍으로 튀지
    않게 함.
  - **완성 사진**(`Recipe.finalImageId`): 레시피 편집 화면 상단(기본 정보 아래)에 "완성 사진" 섹션이
    별도로 있어 조리 단계와 무관하게 1장 생성/업로드 가능. `buildFinalDishImagePrompt`는 레시피 이름 +
    현재 폼의 재료 이름 목록 + 태그 이름 목록을 참고해서 프롬프트를 만듦. 레시피 상세 화면
    (`RecipeDetailPage.tsx`, 제목 아래)과 목록 카드(`RecipesPage.tsx`)의 대표 이미지 우선순위는
    **완성 사진 > 첫 조리 단계 이미지 > (목록만) 태그 기반 플레이스홀더 이모지** — 상세 화면은 둘 다
    없으면 그냥 이미지 영역을 안 보여줌(플레이스홀더 없음).
  - **일괄 생성**: "조리 순서" 섹션 제목 옆 "🖼 전체 이미지 생성" 버튼(Gemini 전용)으로 현재 폼의 모든
    단계 이미지 + 완성 사진 1장을 한 번에 생성 가능(`runBatchImageGeneration`). 이미 이미지가 있는
    항목(단계+완성 사진 포함)이 있으면 먼저 "기존 이미지도 다시 만들까요?" 확인(아니오 선택 시 이미지
    없는 항목만 대상), 이후 "시간이 조금 걸릴 수 있어요" 안내와 함께 진행 여부 확인(`confirm()`). 단계
    이미지는 내부적으로 7개씩 묶어 `Promise.all`로 병렬 처리하고 배치 사이는 순차 진행(Gemini 무료
    티어 분당 요청 제한 고려), 완성 사진은 그 뒤에 별도로 1장 순차 생성. 대상이 7개 이상이면 "시간이
    좀 더 걸릴 수 있다"는 문구 추가, 진행 중에는 "이미지 생성 중... (n/총)" 진행률 표시(총 개수에
    완성 사진 1개도 포함).
  - **채팅/유튜브로 레시피 반영 시에도 동일 플로우 제안**: `applyExtractedResult`(대화 "이대로 반영하기"와
    유튜브 "이대로 반영하기"가 공유하는 단일 함수)에서 반영 직후 Gemini 사용 중이면 "조리 단계 이미지와
    완성 사진도 자동으로 생성할까요?" 확인 후 위와 같은 방식으로 전체 생성 진행(이 경우는 방금 막
    채워진 새 단계라 기존 이미지 개념이 없어 덮어쓰기 질문은 생략, 완성 사진은 항상 새로 생성 대상)
  - **다른 화면으로 이동해도 배경에서 계속 진행 + 전역 진행 배너/완료 토스트**: 생성 작업
    자체(`runBatchImageGeneration`)는 이미 시작된 `async` 함수라 컴포넌트가 화면에서 hidden
    처리돼도(위 "탭 전환은 언마운트가 아니라 hidden" 항목 참고) 계속 실행됨 — React state
    업데이트는 언마운트된 컴포넌트에만 무시되지 grid hidden은 무관. 여기에 더해
    `src/data/imageGenerationStatus.ts`(전역 store, `store.ts`와 같은 `useSyncExternalStore`
    패턴)에 진행률(`done`/`total`/`recipeName`)을 같이 기록해서, `App.tsx`가 어떤 탭을 보고
    있어도 상단에 "🖼 이미지 생성 중... (n/총)" 배너를 띄우고, 끝나면 하단에 "이미지 생성이
    완료됐어요 🎉"(실패가 있었으면 "n/총개 성공") 토스트를 5초간 보여줌. **범위 제한**: 이건
    최상위 탭(재료/장보기 등) 전환에는 완전히 대응하지만, 레시피 탭 안에서 지금 편집 중인
    레시피를 벗어나 다른 레시피를 보거나 목록으로 돌아가는 것(`RecipesFeature.tsx`의 `view`
    전환)은 여전히 `RecipeEditor`를 언마운트시킴 — 이 경우 진행 중이던 이미지는 Storage에는
    정상 업로드되지만(업로드 자체는 컴포넌트 상태와 무관), 그 결과를 레시피의 `steps[].imageId`에
    연결하는 작업은 로컬 폼 상태 갱신이라 무시되어 이미지가 고아로 남을 수 있음. 이미 저장된
    레시피의 이미지를 DB에 바로 반영하는 read-modify-write 방식까지는 이번에 구현하지 않음(동시
    편집 시 충돌 위험 등 고려할 게 늘어나서) — 필요해지면 다음 확장 지점으로 남겨둠.
  - **배치 크기(`BATCH_SIZE`, 현재 10, 예전 7)**: Google이 모델별 고정 RPM/IPM 표를 더 이상
    공개하지 않고(계정/프로젝트별로 AI Studio 콘솔에서만 확인 가능) `gemini-3.1-flash-image`는
    무료 티어에 아예 없는 유료 전용 모델이라, "검증된 여유"를 근거로 크게 올릴 수 없었음 — 대기
    시간을 조금 줄이는 선에서 소폭만(7→10) 조정. 실제 계정의 한도를 더 확인하고 싶으면 AI Studio
    콘솔의 Rate Limits 페이지에서 이 모델 기준 값을 볼 것.
- **DB 전환(Supabase) — 진행 중**: localStorage 단독 구조를 다중 사용자가 가능한 진짜 백엔드로
  옮기는 작업. 배경: User-Household는 N:1(가족 여러 명이 하나의 household 공유), 재료(ingredients)는
  household 단위로 공유, 레시피(recipes)는 user 단위 소유하되 `visibility`로 3단계 공개범위(개인
  소유/가구 공유(기본)/전체 공개 — 10차 확장에서 `is_public` boolean을 대체함, 아래 "레시피 탐색/복사"
  항목 참고), 로그인은 **구글 소셜 로그인이 메인 + 이메일/비밀번호가 정식
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
    - **Phase 4 완료 — API 키 Vault 전환**: 13차 확장에서 완료. 아래 "API 키 Vault 전환" 항목 참고.
      household 신규 데이터 없음(새 household는 빈 상태로 시작 — 기존 로컬 데이터를 옮기는 마이그레이션
      스크립트는 별도로 요청 시 진행)는 여전히 미착수.
    - **버그(수정 완료) — 카테고리 중복 생성 레이스 컨디션**: 재료 관리 화면에서 같은 이름 카테고리인데도
      그루핑이 안 되는 문제 발견 — 그루핑 로직(`categoryId` 정확 비교) 자체는 문제 없었고, 원인은
      `RecipeEditor.tsx`의 `applyExtractedResult`(AI 대화/유튜브 반영 공통 경로)가 새 재료들을
      `Promise.all`로 동시에 처리하던 것. 아직 없는 새 카테고리를 두 재료가 동시에 필요로 하면 둘 다
      리액트 state의 같은(오래된) `categories` 스냅샷만 보고 있어서 서로의 생성 결과를 못 보고, 같은
      이름의 카테고리를 서로 다른 id로 두 번 만들어버림 — 화면에는 이름이 같아 안 구별되지만 실제로는
      `categoryId`가 갈려 그루핑이 깨진 것처럼 보였음. 새 재료/태그를 순차 처리(`for...of` + `await`)로
      바꾸고, 배치 안에서 방금 만든 카테고리/태그를 바로 찾을 수 있는 로컬 캐시(`Map`)를 둬서 해결
      (`createIngredientFromAi`/`resolveOrCreateTag`가 이제 이 캐시를 받아서 씀). 이미 이 버그로
      생성된 중복 카테고리는 `supabase/migrations/0004_merge_duplicate_categories.sql`로 병합
      (household 단위로 이름이 같은 카테고리를 대표 하나로 합치고 재료의 `category_id`를 옮긴 뒤
      나머지 삭제 — SQL Editor에서 1회 실행, 여러 번 실행해도 안전). 앞으로 AI가 여러 개의 새
      엔티티(카테고리/태그/재료)를 한 응답에서 만들 때는 항상 이 패턴(순차 처리 + 배치 내 캐시)을
      따를 것 — `Promise.all`로 동시에 새로 만들면 같은 버그가 재발함.
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
- **레시피 탐색/복사(다른 가구 공개 레시피 둘러보기)**: `RecipesFeature.tsx`에 "우리집 레시피"/"🔎 둘러보기"
  칩 토글 추가(별도 하단 탭 대신 기존 레시피 탭 안에서 전환 — 탐색은 가끔 쓰는 보조 기능이라 4개
  네비게이션 탭에 자리를 더 안 씀). 그리드/리스트 카드(`RecipeCard`/`RecipeListItem`)는 `RecipesPage.tsx`
  것을 그대로 재사용하되, `tags: Tag[]` 대신 `tagNames: string[]`을 받도록 리팩터링(다른 household의
  태그는 로컬 `useTags()` 목록에 없어서 이름을 미리 문자열로 뽑아 넘겨야 함), `ownerLabel`/`cornerBadge`
  prop을 추가해 "OO님의 레시피"/"이미 있음" 표시를 지원.
  - **공개 범위 3단계로 확장(`visibility`) — 처음엔 boolean `is_public`으로 시작했다가 곧바로 개편함**:
    실사용해보니 "레시피는 user 소유, is_public 켜면 전체공개"만으로는 **같은 가구 식구끼리도 서로의
    레시피가 자동으로 안 보이는** 문제가 있었음(가족 앱인데 정작 가족끼리 공유가 안 되는 구조). 그래서
    `is_public boolean`을 `visibility text`(`'private'` 개인 소유 / `'household'` 가구 공유(**기본값**)
    / `'public'` 전체 공개) 3단계로 교체(`supabase/migrations/0010_recipe_visibility_household_sharing.sql`,
    `schema.sql` 동기화, 기존 `is_public=false` 행은 전부 `household`로 마이그레이션됨 — 1인 가구는
    체감 차이 없지만 진짜 비공개를 원했다면 편집 화면에서 다시 "개인 소유"로 바꿔야 함).
    `recipes_select_visibility` RLS는 `visibility='public' or user_id=auth.uid() or (visibility=
    'household' and shares_household_with(user_id))` — `household_members` 재귀 방지용으로 이미
    만들어둔 `shares_household_with()` 헬퍼 함수를 그대로 재사용. `recipe_tags`/`recipe_likes` 등
    파생 정책들도 전부 같은 3항 조건으로 갱신.
    - **"우리집 레시피" 목록 재정의**: 이제 단순 "내 것"이 아니라 **내 것(등급 무관) + 우리 가구원이
      만든 household/public 등급 레시피**(가구원의 private는 안 보임)를 보여줌. RLS만으로는 "다른
      가구의 public 레시피"까지 다 통과되므로(둘러보기 전용 범위), `createRecipesRepository.getAll()`이
      먼저 `fetchHouseholdMemberIds(householdId)`(`household.ts`, `household_members` 조회)로 우리
      가구원 id 목록을 구한 뒤 `.in('user_id', memberIds).or('visibility.neq.private,user_id.eq.'+
      userId)`로 좁힘 — RLS가 허용하는 범위 중에서도 "이 화면에 필요한 만큼만" 클라이언트가 한 번 더
      제한하는 패턴(바로 아래 "내 레시피에 남의 공개 레시피가 섞여 나오던" 버그와 같은 종류의 교훈).
    - **둘러보기도 가구원 제외**: `fetchPublicRecipes(userId, householdId, myRecipes)`가 우리 가구원
      (나 포함)의 public 레시피는 이미 "우리집 레시피"에 나오므로 제외하고, 진짜 다른 가구의 public만
      보여줌.
  - **RLS 보완이 핵심 작업이었음(0007)**: `recipes` 테이블 자체의 RLS는 이미 Phase 1 설계 때부터
    있었어서 손댈 게 없었음(이후 위 visibility 개편에서 조건만 확장됨). 진짜 문제는 공개 레시피가
    "참조하는" 다른 테이블들 — `tags`/`ingredients`/`profiles`는 전부 household(또는 본인) 단위로만
    보이게 막혀있어서, 다른 household의 공개 레시피를 열어도 그 레시피가 쓰는 태그 이름/재료 이름/
    작성자 이름을 하나도 못 읽어오는 문제가 있었음(레시피 행 자체는 보이는데 참조된 이름들이 비어보임).
    `supabase/migrations/0007_public_recipe_browsing.sql`(+ `schema.sql` 동기화)로 세 테이블에
    "공개 레시피가 참조하는 경우에 한해 SELECT만 허용"하는 정책을 추가 — `tags`/`profiles`는 실제 조인
    테이블(`recipe_tags`)/FK(`recipes.user_id`)가 있어 깔끔하게 작성 가능했지만, `ingredients`는 정식
    조인 테이블이 없고(`recipes.content` jsonb 배열 안에 `ingredientId`만 있음) `jsonb_array_elements`로
    모든 공개 레시피의 재료 배열을 훑어서 판단하는 정책을 씀(개인 앱 규모에서는 성능 문제 없음). 이
    정책들은 전부 SELECT 전용이라 수정/삭제 권한은 원래대로 소유 household/본인으로 제한됨.
  - **버그(발견 및 수정) — "내 레시피"에 남의 공개 레시피가 섞여 나오고 있었음**: `createRecipesRepository`의
    `getAll()`이 원래 `user_id` 필터 없이 그냥 `recipes` 테이블을 조회했는데, RLS가 이미 "본인 것 +
    is_public=true"를 다 통과시켜주기 때문에 이 필터 없는 조회가 실제로는 **다른 사람의 공개 레시피까지
    "내 레시피" 목록에 섞어서 반환하고 있었음**(둘러보기 기능을 만들면서 발견 — 이전까지는 공개 레시피가
    하나도 없어서 드러나지 않았던 버그). `.eq('user_id', userId)`를 명시적으로 추가해서 "내 레시피"는
    소유권 기준으로만 걸러지도록 수정. 앞으로 RLS가 여러 조건을 OR로 통과시키는 테이블은, 클라이언트
    쪽에서 "지금 이 화면에 필요한 조건"을 별도로 명시하는 걸 잊지 말 것 — RLS 통과 ≠ 화면에 보여줘야 할
    범위.
  - **공개 레시피 조회는 `src/data/publicRecipes.ts`의 `fetchPublicRecipes(currentUserId, myRecipes)`** —
    household 공유 store(`store.ts`)처럼 계속 구독하는 캐시가 아니라 `DiscoverRecipesPage.tsx` 진입
    시 1회 조회. `recipe_tags(tag_id, tags(name))`/`profiles(display_name, email)`를 PostgREST 임베드
    조인으로 함께 가져와 태그 이름/작성자 이름을 한 번에 해석하고, 재료 이름은 이 배치가 참조하는
    `ingredientId`를 전부 모아 별도 쿼리 한 번으로 해석(`ingredientNameById: Map<string,string>`).
    "이미 있음" 배지는 `recipes.source_recipe_id`(0007 마이그레이션에서 추가한 컬럼 — 복사해온 원본
    레시피 id를 추적) 기준으로 `myRecipes`와 대조해서 판단.
  - **"내 레시피로 복사하기"** (`RecipesFeature.tsx`의 `handleCopyPublicRecipe`): 재료/태그는 이름으로
    매칭해서 내 household에 이미 있으면 재사용, 없으면 새로 만듦(AI 반영 로직 `createIngredientFromAi`/
    `resolveOrCreateTag`와 같은 패턴 — 순차 처리 + 배치 내 캐시로 중복 생성 방지). 새 재료의 카테고리는
    원본 카테고리를 그대로 옮기지 않고(원본 카테고리는 다른 household 소유라 이름조차 못 읽어옴 —
    categories 테이블까지는 공개 예외를 안 넣음, 범위 밖으로 남겨둠) "기타"로 폴백 — 필요하면 나중에
    직접 재분류. 조리 단계 이미지/완성 사진은 **참조만 옮기지 않고 실제로 다운로드해서 내 household
    경로에 새로 저장**(`imageStore.ts`의 `copyImage` — 원본이 나중에 삭제되거나 비공개로 바뀌어도 내
    복사본은 이미지까지 안전하게 유지됨). 이걸 가능하게 하려고 recipe-images 버킷에
    `supabase/migrations/0008_public_recipe_images_storage.sql`로 "공개 레시피가 참조하는 이미지는
    다운로드만 추가로 허용"하는 정책을 넣음(0006의 household 전용 정책과 별개로 추가, 업로드/삭제는
    여전히 household 전용). 복사 완료 후 `confirm()`으로 "편집 화면으로 이동할까요?" 안내.
  - **공개 범위(`visibility`) 선택**: `RecipeEditor.tsx` 하단(조리 순서 다음)에 개인 소유/가구 공유
    (기본)/전체 공개 3단 select 추가, 전체 공개 선택 시 경고 문구 노출. 상세 화면에는 안 넣음(스펙상
    편집 화면에만 필요).
  - **범위에서 뺀 것**: 시드 레시피 4개(`src/data/seed.ts`)를 공개로 미리 심어두는 건 스킵 — 이 시드는
    실제 DB에 한 번도 들어간 적 없는 미사용 TypeScript 참고 데이터라(Supabase 전환 후 새 household는
    항상 빈 상태로 시작) 토글할 실제 DB 행 자체가 없음. 초기 콘텐츠 문제는 여러 household가 실제로
    레시피를 만들고 공개하기 시작하면 자연히 해소될 것으로 보고 별도 조치 없이 남겨둠.
  - **좋아요(하트)**: 공개 레시피를 얼마나 좋아하는지 보여주는 지표로 추가(가구 수가 늘어나기 전까진
    "즐겨찾기" 개인용 기능이 더 실용적이지만, 그건 레시피 관리 기능을 더 발전시킬 때 따로 추가하기로
    하고 이번엔 공개 지표만). `recipe_likes`(recipe_id+user_id 복합 PK — 중복 좋아요 자체가 DB
    레벨에서 불가능) 테이블 + `supabase/migrations/0009_recipe_likes.sql`. RLS는 "그 레시피를 볼 수
    있으면(본인 것+공개) 좋아요 목록도 볼 수 있음", 좋아요 추가/삭제는 본인 것만. `src/data/
    recipeLikes.ts`의 `fetchLikeInfo`/`toggleLike` — group by 없이 해당 레시피들의 좋아요 행을 통째로
    가져와 클라이언트에서 집계(개인 앱 규모라 충분히 가벼움). 토글 가능한 하트 버튼은
    `PublicRecipeDetailPage.tsx`(다른 사람 공개 레시피, 낙관적 업데이트 + 실패 시 롤백)에만 두고,
    `RecipesPage.tsx`의 그리드/리스트 카드와 `RecipeDetailPage.tsx`(내 레시피 상세, 공개 상태일 때만)에는
    조회 전용 숫자만 표시 — 내 레시피에 내가 좋아요 누르는 건 의미가 없어서 그쪽엔 토글 버튼을 안 둠.
- **작성자 표시/프로필(닉네임/사진)**: `profiles.display_name`은 원래도 존재했고 가입 시 트리거가
  구글 계정 실명(`raw_user_meta_data->>'full_name'`)으로 자동 채워주고 있었지만, 편집 UI가 없었음
  (이메일 로그인은 `full_name`이 없어 비어있었음). `src/data/profile.ts`의 `useProfile()`(household.ts와
  같은 패턴)로 조회/수정 — 본인 프로필 수정은 `profiles_update_own` RLS가 이미 허용해서 DB 변경
  없이 프론트만 추가하면 됐음.
  - **레시피 작성자 표시("OO님의 레시피")**: `Recipe.authorName`/`authorAvatarUrl`을 추가 —
    DB에 저장되는 값이 아니라 조회 시 `profiles!user_id(display_name, avatar_url)` 임베드 조인으로만
    채워지는 표시 전용 필드(`rowToRecipe`). "우리집 레시피" 목록(`createRecipesRepository.getAll()`)은
    이미 가구원으로 좁혀 조회하고 있어서(`profiles_select_own_or_household` RLS로 이미 허용) 조인만
    추가하면 됐고, 본인 레시피 포함 전부에 작성자를 보여줌(가구원 중 누가 만들었는지 구분이 목적이라
    내 것도 예외 두지 않는 쪽이 자연스럽다고 판단). 둘러보기(다른 가구 공개 레시피, `publicRecipes.ts`)는
    다른 household 소속 작성자라 `authorHouseholdName`도 같이 붙여 "OO님의 레시피 (영희네)"로 표시
    (`formatPublicRecipeOwnerLabel`), 내 household 소속 레시피는 어차피 같은 가구라 이름을 생략.
  - **household 이름도 조회 가능해야 함(RLS 보완, 0012)**: 공개 레시피 작성자가 다른 household
    소속이면 그 household 이름을 읽어올 권한이 없었음(`households_select_member`가 "내 household면"만
    허용) — tags/ingredients/profiles에 이미 해준 것과 같은 종류의 SELECT 전용 예외를
    `household_members`/`households`에도 추가(`supabase/migrations/0012_public_recipe_household_name.sql`).
    노출 컬럼도 user_id/household_id/household 이름뿐이라 추가 민감정보 노출은 없음.
  - **민감정보(이메일) 노출 버그(발견 및 수정)**: `publicRecipes.ts`가 원래 작성자 이름 조회 시
    `profiles!user_id(display_name, email)`로 email까지 같이 가져와서, 닉네임이 비어있으면
    이메일을 그대로 화면에 표시하는 폴백이 있었음 — 다른 household 유저에게 낯선 사람의 이메일이
    노출되는 셈이라 위험한 패턴이었음(이번에 작성자 표시 기능을 만들며 발견). email 선택 자체를
    제거하고, 닉네임이 없으면 "이름 없는 사용자"라는 중립적인 문구로 대체.
  - **프로필 사진(avatar_url, 0013)**: 구글 로그인 시 `raw_user_meta_data`에 이미 있는
    `avatar_url`/`picture`를 `profiles.avatar_url`에 저장(`handle_new_user()` 트리거 갱신 +
    기존 계정은 마이그레이션에서 1회 백필). 실제 이미지 바이트를 우리 Storage에 복사하지 않고
    구글이 제공하는 URL을 그대로 참조만 함(조리 단계 이미지와 달리 "우리가 소유해야 하는 자산"이
    아니라고 판단, 계정 부가 정보일 뿐). 작성자 표시 옆(그리드 카드/상세 화면)과 설정 화면
    "계정" 섹션에 작은 원형 아이콘으로 노출 — 리스트 뷰(컴팩트 한 줄 레이아웃)에는 생략.
  - **household 이름 짓기 가이드**: household 생성 화면(`HouseholdOnboarding.tsx`)과 설정 화면
    양쪽에 "가구 이름은 모든 구성원과 다른 가구 유저에게 동일하게 보여요. '우리집'이나
    '장모님댁'처럼 특정 사람 기준의 호칭보다는, '김영희네'처럼 누가 봐도 자연스러운 이름을
    추천해요" 안내 문구 추가. 설정 화면에서 household 이름을 나중에 바꾸는 기능도 이번에
    추가(`households_update_member` RLS가 이미 가구원의 수정을 허용하고 있어서 UI만 없었음).
  - **설정 화면 UI 패턴 — 인라인 편집**: API 키 입력처럼 입력창+저장 버튼+상태 문구를 항상
    늘어놓는 대신, 닉네임/household 이름은 평소엔 "라벨: 값 [변경]"만 조용히 보여주다가 [변경]을
    누르면 그 자리가 입력창+[취소]/[저장]으로 바뀌는 인라인 편집 컴포넌트(`SettingsPage.tsx`의
    `InlineEditRow`)를 새로 만들어 적용 — 자주 안 바꾸는 값을 계속 입력 폼 형태로 노출해두면
    화면이 번잡해 보인다는 피드백에 따른 디자인. 이 컴포넌트는 이후 API 키 마스킹 표시에도
    재사용됨(아래 "API 키 Vault 전환" 항목의 `startEmpty` 옵션 참고).
- **API 키 Vault 전환(DB 전환 Phase 4)**: Anthropic/Gemini API 키를 브라우저 localStorage 평문
  저장 → Supabase Vault 암호화 저장으로, 실제 AI 호출도 브라우저 직접 호출 → 서버리스 함수 경유로
  전환. 유튜브 자막 추출/썸네일 프록시("서버 도입 1호/2호")에 이은 세 번째 서버 확장이지만, 이번엔
  "CORS 우회"가 아니라 "민감정보(API 키)를 브라우저에 안 두기"가 목적이라 성격이 다름 — 브라우저는
  이제 Anthropic/Gemini API 키를 아예 들고 있지 않는다.
  - **Vault 스키마**(`supabase/migrations/0014_api_key_vault.sql`): `user_api_keys(user_id,
    provider, secret_id, updated_at)` — 실제 키 값은 담지 않고 `vault.secrets`를 가리키는 참조만
    저장(household 아니라 user 단위, 각자 자기 키를 씀). `vault.secrets`/`vault.decrypted_secrets`는
    PostgREST에 노출되지 않는 스키마라 supabase-js로 직접 접근이 원천적으로 불가능(anon/service_role
    키 어느 쪽으로도) — 공식 권장 패턴대로 `public` 스키마에 `save_user_api_key`/`get_user_api_key`
    SECURITY DEFINER 래퍼 함수를 두고, 그 실행 권한도 `service_role`에만 부여(anon/authenticated는
    revoke). `user_api_keys` 테이블 자체도 RLS는 켜두되 정책을 하나도 안 만듦(anon/authenticated
    접근 자체를 차단) — "본인 키만 조회/저장 가능"은 RLS가 아니라 서버리스 함수가 요청자의 로그인
    세션(JWT)을 검증해서 그 user_id로만 함수를 호출하는 방식으로 보장(`api/_lib/auth.ts`의
    `requireUser` — Supabase anon 클라이언트로 `auth.getUser(token)`만 하면 되고 service_role은
    필요 없음). **SQL Editor에서 이 마이그레이션 실행 필요** + Vercel 프로젝트에 새 환경변수
    `SUPABASE_SERVICE_ROLE_KEY` 추가 필요(반드시 `VITE_` 접두사 없이 — 접두사가 붙으면 Vite가
    클라이언트 번들에 그대로 인라인해서 브라우저에 노출시키므로 절대 금지, `api/_lib/
    supabaseAdmin.ts`에 이 경고를 주석으로 남겨둠).
  - **서버리스 함수 구성**: `api/_lib/`(언더스코어 접두사 폴더는 Vercel이 라우트로 등록하지 않는
    공식 컨벤션)에 공용 헬퍼 3개 — `auth.ts`(`requireUser`), `supabaseAdmin.ts`(service_role
    클라이언트), `apiKeyStore.ts`(`saveUserApiKey`/`getUserApiKey`/`maskApiKey`). 실제 엔드포인트는
    `api/save-api-key.ts`(키 저장), `api/get-api-key.ts`(마스킹된 키만 반환 — "앞 6자리+****+뒤
    4자리", 설정 화면 표시용), `api/ai-chat.ts`(대화형 propose_recipe, 두 제공자 공용),
    `api/ai-extract-transcript.ts`(Claude 전용, 자막→레시피), `api/ai-extract-youtube-meta.ts`
    (Gemini 전용, 영상 메타+자막→레시피), `api/ai-image.ts`(Gemini 전용, 조리 단계/완성 사진 생성).
  - **핵심 설계 — 클라이언트/서버가 같은 프롬프트·툴 로직을 공유**: `src/lib/claudeClient.ts`/
    `geminiClient.ts`의 `chatAboutRecipe`/`extractRecipeFromTranscript`/
    `extractRecipeFromYoutubeMeta`/`generateImageWithRetry`는 원래도 apiKey를 인자로 받는 순수
    함수였어서(브라우저 전용 API를 쓰지 않음), 로직을 서버용으로 새로 옮겨 적을 필요 없이 `api/ai-*.ts`
    가 그대로 import해서 쓴다(Vercel 함수 빌드가 `api/`에서 `src/`로의 상대 경로 import를 그대로
    번들링해줌) — apiKey만 클라이언트가 보내던 것에서 서버가 Vault에서 복호화한 값으로 바뀔 뿐,
    프롬프트/툴 스키마/재시도 로직은 완전히 동일해서 "서버 경유해도 기존과 동일한 품질의 에러
    메시지가 보이는지" 같은 걱정이 애초에 생기지 않음(로직 중복이 없으므로 동작이 갈릴 여지가 없음).
    반대로 `buildStepImagePrompt`/`buildFinalDishImagePrompt`/`fetchYoutubeVideoMeta`(YouTube Data
    API, `settings.youtubeApiKey`)처럼 API 키가 필요 없거나 이번 전환 범위 밖인 함수는 그대로
    클라이언트에 남아있음.
  - **YouTube Data API 키는 이번 전환 대상이 아님**: `settings.youtubeApiKey`는 계속 localStorage
    평문 그대로 둠 — Anthropic/Gemini 키와 달리 읽기 전용 공개 데이터(영상 제목/설명란) 조회용이라
    민감도가 낮고, 원래도 선택 사항이라 범위를 좁게 유지하는 쪽을 택함.
  - **클라이언트 진입점**: `src/lib/aiProxy.ts`(로그인 세션의 access token을 `Authorization: Bearer`
    로 실어 `/api/ai-*` 호출, `ApiProxyError`(코드+메시지)를 던짐) + `src/data/apiKeys.ts`의
    `useApiKeyStatus(provider)`(설정 화면에서 마스킹된 키 상태 조회/저장, `useProfile()`과 같은 패턴).
    `RecipeChatPanel.tsx`/`RecipeEditor.tsx`의 모든 AI 호출 지점이 `claudeClient`/`geminiClient`
    직접 호출에서 `aiProxy.*` 호출로 교체됨.
  - **설정 화면 UI**: API 키 입력도 `InlineEditRow`로 통일하되, 기존 값을 다시 보여주지 않고 항상
    빈 입력창에서 새로 입력받도록 `startEmpty` 옵션을 추가(일반적인 보안 UX 패턴 — "변경"을 누르면
    마스킹된 값이 아니라 빈 칸에서 시작). 표시값은 `useApiKeyStatus`가 돌려주는 마스킹된 문자열
    (없으면 "(미설정)").
  - **에러 처리 — "키 없음"은 서버가 최종 판단**: 클라이언트에서 사전에 `settings.xxxApiKey` 존재
    여부를 체크하던 방식(이제 그 필드 자체가 안 쓰임)을 없애고, 서버가 Vault 조회 결과 키가 없으면
    `{error: 'no_api_key', message: '...'}` (HTTP 400)를 반환 → `ApiProxyError.code === 'no_api_key'`
    를 감지해서 에러 메시지 아래에 "설정으로 이동" 버튼을 보여줌. 이 버튼이 실제로 설정 탭으로
    전환할 수 있어야 해서, `App.tsx`의 탭 상태를 로컬 `useState`에서 전역 store(`src/data/
    activeTab.ts`, `useSyncExternalStore` 패턴)로 옮김 — 예전엔 탭 상태가 `App.tsx` 안에 갇혀있어서
    레시피 편집/채팅 화면에서 "설정 탭으로 보내기"가 불가능했음.
  - **기존 localStorage 평문 키 마이그레이션**: 설정 화면 진입 시 `settings.anthropicApiKey`/
    `geminiApiKey`(둘 다 예전 필드, 마이그레이션 감지 목적으로만 남겨둠)에 값이 남아있고
    `localStorage['cookkit:apiKeyMigrated']`가 없으면 "안전하게 옮길까요?" 배너 표시. "옮기기"를
    누르면 각 키를 `/api/save-api-key`로 전송한 뒤 `settings`에서 지우고 플래그를 세움, "나중에"를
    눌러도 플래그는 세워서 다시 안 뜨게 함(개인 1인 사용 앱이라 "묻지 않기" 선택을 존중 — 다만 이
    경우 예전 평문 키는 그대로 localStorage에 남으므로, 신경 쓰인다면 브라우저 devtools에서 직접
    지우거나 플래그를 지우고 다시 마이그레이션을 띄울 수 있음).
  - **스트리밍은 원래도 안 씀**: 서버 경유 전환 전에도 Claude/Gemini 호출 둘 다 비스트리밍
    (`messages.create`/`generateContent`, `streamGenerateContent` 아님)이었어서, "서버리스 함수를
    거쳐도 스트리밍이 유지되는가"는 애초에 해당 사항이 없었음 — 응답은 항상 완결된 JSON을 한 번에
    받아서 화면에 반영하는 방식 그대로.
  - **이미지 생성 함수 타임아웃(`maxDuration: 200`)**: `generateImageWithRetry`가 내부적으로 60초
    타임아웃 + 429/503/408 재시도(최대 3회, 지수 백오프 2초→4초)를 이미 갖고 있어서, 최악의 경우
    60+2+60+4+60초 가까이 걸릴 수 있음 — Vercel 함수 자체의 `maxDuration`을 넉넉히 잡아야 도중에
    함수가 먼저 끊기지 않음(`api/youtube-transcript.ts`가 이미 Fluid Compute를 전제로 120초를 쓰고
    있어서 같은 전제 위에 설정).
- **난이도/조리시간 자동 판단**: `Recipe.difficulty`('easy'|'medium'|'hard') / `difficultyReason`(판단
  근거 한 문장) / `estimatedMinutes`(예상 조리시간 분)를 추가. 실제 저장은 다른 중첩 데이터와 마찬가지로
  `recipes.content` jsonb 안에 담김(`supabaseAdapter.ts`).
  - **조리시간**(`src/lib/recipeTime.ts` `estimateCookMinutes`): 조리 단계의 `timerSeconds` 합계를 분으로
    환산, 타이머가 없는 단계는 단계당 2분으로 보정해서 더함.
  - **난이도**(`src/lib/recipeDifficulty.ts` `computeDifficulty`): 재료 개수(5개 이하 0점/6~10개 1점/
    11개 이상 2점) + 조리시간(30분 이하 0점/60분 이하 1점/그 이상 2점) + 조리단계 개수(5개 이하 0점/6개
    이상 1점)를 합산 — 0~1점 easy, 2~3점 medium, 4점 이상 hard. 판단 근거 문장을 `difficultyReason`에 자동
    채움.
  - **RecipeEditor.tsx**: 두 값 모두 재료/조리순서가 바뀔 때마다 `useEffect`로 자동 재계산되다가, 사용자가
    직접 값을 바꾸면(`difficultyTouched`/`estimatedMinutesTouched`) 그 편집 세션 동안은 자동 계산이
    덮어쓰지 않음 — "↻ 자동 판단/계산으로 되돌리기" 버튼으로 다시 자동 모드로 전환 가능. 난이도를 수동
    설정하면 `difficultyReason`이 `MANUAL_DIFFICULTY_REASON`("사용자가 직접 설정함") 상수로 바뀌고, 이
    문구가 저장돼 있으면 다음에 그 레시피를 다시 열었을 때도 수동 설정을 존중해서 자동 재계산하지 않음
    (문구가 없으면 — 즉 예전에 자동 계산된 값이면 — 열 때마다 최신 재료/조리순서 기준으로 다시 계산됨).
  - **AI 대화형 생성**(`propose_recipe`): `claudeClient.ts`/`geminiClient.ts`의 스키마에 `difficulty`/
    `difficultyReason` 필드를 추가하고 `aiChat.ts`의 `RECIPE_CHAT_SYSTEM_PROMPT`에 판단 기준(easy=30분
    이내·재료 5가지 이하·특수 도구 불필요, medium=1시간 이내·기본 도구, hard=1시간 이상 또는 특수 기술/
    도구 필요)을 안내해 AI가 직접 판단하게 함. `extractRecipeFromTranscript`/`extractRecipeFromYoutubeMeta`도
    같은 스키마(`RECIPE_SCHEMA`/`GEMINI_RECIPE_SCHEMA`)를 공유해서 자동으로 같은 필드를 채움. AI가 준
    난이도는 규칙 기반 점수보다 맥락(기술/도구 난이도)을 더 반영한다고 보고 적용 시 `difficultyTouched`를
    true로 표시해 규칙 기반 재계산이 곧바로 덮어쓰지 않게 함(다만 이 표시는 편집 세션 한정 — 위와 달리
    `MANUAL_DIFFICULTY_REASON` 문구를 쓰지 않으므로 다음에 다시 열면 규칙 기반으로 재계산됨).
  - **UI**: 레시피 편집 화면(기본 정보 아래)과 상세 화면(태그 옆) 둘 다 난이도/예상 조리시간 배지 + ⓘ
    아이콘(탭/호버 시 `difficultyReason` 표시)을 노출.
  - **시드 데이터**: `src/data/seed.ts`의 4개 시드 레시피도 같은 함수로 난이도/조리시간을 계산해 채워둠
    (단, 이 시드는 현재 앱 어디서도 import되지 않는 미사용 참고 데이터 — Supabase 전환 후 새 household는
    빈 상태로 시작하기 때문).
- **태그 국가/스타일 축**: `TagType`에 `'cuisine'` 추가(기존 `'style'`/`'category'`와 별개 축, 예:
  한식/양식/중식/일식). `TagManager.tsx`에 태그 관리 섹션과 새 태그 추가 시 선택 옵션으로 추가.
  `RecipeEditor.tsx`의 태그 선택 UI를 스타일/카테고리(있을 때만)/국가·스타일 세 섹션으로 분리(모두 다중
  선택, cuisine은 선택 사항). AI(`propose_recipe`)가 `tagNames`로 제안하는 태그는 타입 구분 없이 이름만
  보고 기존 태그를 재사용하므로(`resolveOrCreateTag`), 이미 등록된 cuisine 태그 이름을 그대로 다시
  제안하면 자동으로 재사용됨 — 다만 AI가 새 cuisine 태그를 제안하도록 유도하는 프롬프트는 아직 추가하지
  않음(필요해지면 `buildExistingContextNote`/시스템 프롬프트에 안내 추가할 것).
  - **버그(수정 완료) — 국가/스타일 섹션이 비어서 고를 게 없었음**: 두 가지가 겹친 문제였음. (1) DB의
    `tags.type` 체크 제약이 `schema.sql`에 `check (type in ('style', 'category'))`로 박혀있는 채
    남아있어서 — TagType에 `'cuisine'`을 추가할 때 이 DB 제약을 같이 안 고친 누락 — cuisine 태그
    insert 자체가 `new row for relation "tags" violates check constraint "tags_type_check"` 에러로
    전부 막혀 있었음. (2) 그래서 household에 cuisine 태그가 하나도 없어 레시피 편집 화면의 "국가/스타일"
    섹션을 열어도 선택할 게 없었음. `supabase/migrations/0005_seed_default_cuisine_tags.sql`로 해결 —
    제약을 `'cuisine'`까지 허용하도록 재생성한 뒤, 기존 household들에 기본 태그 5개(한식/양식/중식/
    일식/퓨전)를 채워넣고(이미 같은 이름이 있으면 건너뜀, 여러 번 실행해도 안전), `create_household`
    RPC도 갱신해서 앞으로 새로 만들어지는 household도 자동으로 받도록 함. `schema.sql`의 제약 정의도
    같이 고쳐서 앞으로 새 Supabase 프로젝트를 처음부터 설치할 때는 이 문제가 재발하지 않음. **SQL
    Editor에서 이 마이그레이션 실행 필요**(0004처럼 실행 안 하면 화면에서 여전히 빈 섹션으로 보임).
    앞으로 Tag/TagType처럼 DB에 `check` 제약이 걸린 필드에 새 값을 추가할 때는 TypeScript 타입만 고치고
    끝내지 말고 반드시 해당 제약도 같이 마이그레이션할 것 — 이번에 놓친 지점.

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
- **가구 간 팔로우/구독(레시피 visibility 다음 단계)**: 지금은 다른 가구 레시피를 보려면 "전체 공개"뿐이라
  전부 아니면 전무 식인데, 사용자가 많아지면 "이 가구만 팔로우해서 그 가구가 공개한 레시피는 항상 보기"
  같은 가구-대-가구 연결 관계를 만들고 싶다는 아이디어(2026-07-29 논의). 지금 3단계
  (private/household/public) 구조 위에 `household_follows`(follower_household_id, followed_household_id)
  같은 테이블을 얹으면 될 것 같음 — 예를 들어 "팔로우한 가구의 household 등급 레시피까지 보이게" 정책을
  추가하는 식. 사용자 수가 늘어나서 "전체 공개 둘러보기"만으로는 관계性이 부족해질 때 진행하기로 하고
  지금은 스킵.

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
  id, name, servingsBase, tagIds[] (스타일/카테고리/국가·스타일 태그 모두 포함),
  ingredients: [{ ingredientId, amount, unit }],
  steps: [{ title, content, timerSeconds?, imageId? }],
  createdAt?: string  // DB recipes.created_at 매핑, 레시피 목록 "최근 추가순" 정렬용
  difficulty?: 'easy' | 'medium' | 'hard'  // 규칙 기반 자동 계산 또는 사용자 수동 설정
  difficultyReason?: string  // 판단 근거 한 문장(수동 설정 시 'MANUAL_DIFFICULTY_REASON' 상수 문구)
  estimatedMinutes?: number  // 예상 조리시간(분), 규칙 기반 자동 계산 또는 수동 입력
  finalImageId?: string  // 완성 사진(AI 생성 또는 업로드), Supabase Storage 경로 참조
  sourceRecipeId?: string  // 공개 레시피를 복사해온 경우 원본 id(DB recipes.source_recipe_id 실컬럼)
  visibility?: 'private' | 'household' | 'public'  // 공개 범위(DB recipes.visibility 실컬럼, 기본 household)
  authorName?: string  // 작성자 닉네임(profiles.display_name) — 저장 안 됨, 조회 시 join으로만 채워짐
  authorAvatarUrl?: string  // 작성자 프로필 사진 URL(profiles.avatar_url) — authorName과 같은 조회 전용 필드
  // allergens는 저장하지 않음 — ingredients를 통해 항상 파생(computed) 계산
  // imageId/finalImageId는 Supabase Storage(src/data/imageStore.ts)에 저장된 이미지 경로 참조(실제 데이터 아님)
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
  id, name, type ('style' | 'category' | 'cuisine')  // 크림류/고기요리(style·category), 한식/양식 등(cuisine)
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
