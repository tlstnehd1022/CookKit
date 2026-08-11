# Handoff: CookKit 홈(피드형) + 주간 일정

## Overview
CookKit 모바일 앱에 **홈 화면**과 **주간 일정 화면**을 추가하는 작업입니다.
현재 앱에는 홈이 없고 탭이 레시피 / 장보기 / 재료 / 설정으로 구성되어 있습니다.
이 핸드오프는 다음을 정의합니다.

1. **홈(피드형)** — 오늘의 추천 한 개를 크게, 그 아래 이번 주 일정 스트립과 유통기한 임박 재료.
2. **주간 일정(요일 선택형)** — 상단 요일 스트립에서 하루를 고르면 그 날의 저녁 메뉴 · 이어 쓰기 안내 · 그 날 살 것이 아래에 표시.
3. **탭 구조 변경** — 홈 · 레시피 · 일정 · 장보기 · 재료 (5탭). 6탭은 좁아 **설정은 홈 우상단 프로필 진입점**으로 이동.

부수적으로 프로토타입에는 레시피 상세, 단계별 요리 모드, 장보기, 재료(냉장고), 요리책 화면도 함께 들어 있어 앞뒤 맥락을 확인할 수 있습니다. 이번 구현 범위의 핵심은 **홈 + 주간 일정 + 탭 재구성**입니다.

## About the Design Files
`designs/` 안의 파일은 **HTML로 만든 디자인 레퍼런스**입니다. 의도한 화면과 동작을 보여 주는 프로토타입이며, 그대로 가져다 쓰는 프로덕션 코드가 아닙니다.
할 일은 이 HTML 디자인을 **기존 코드베이스의 환경(React Native / SwiftUI / Flutter / React 등)과 기존 컴포넌트·디자인 토큰 위에서 다시 구현**하는 것입니다. 기존 프로젝트의 네이밍, 상태관리, 내비게이션 패턴을 우선하세요.

파일을 브라우저로 열어 직접 눌러 보면 동작을 확인할 수 있습니다(요일 선택, 재료 체크, 요리 모드 타이머 등 실제로 작동합니다).

- `designs/CookKit App.dc.html` — **구현 대상 통합 프로토타입** (홈 + 일정 + 레시피 상세 + 요리 모드 + 장보기 + 재료 + 요리책, 5탭)
- `designs/CookKit 메인·주간일정 시안.dc.html` — 채택 전 비교 시안 보드(1a~1e). 채택안은 **1a(피드형 홈)**, **1e(요일 선택형 주간 일정)**
- `designs/CookKitTabs.dc.html` — 하단 탭 바 단독 컴포넌트
- `designs/ios-frame.jsx` — 기기 목업 프레임(프로토타입 표시용, 구현 대상 아님)
- `designs/organic-styles.css` — 디자인 토큰 원본(Organic 디자인 시스템). 색·간격·radius·shadow 값의 출처

## Fidelity
**High-fidelity.** 색상, 타이포, 간격, 상호작용이 최종안입니다. 아래 토큰과 수치를 그대로 재현하세요.
단, 사진은 모두 **자리표시자(원형 도형)** 입니다. 실제 요리 사진으로 교체해야 합니다.

## Design Tokens
`organic-styles.css`의 CSS 변수 그대로 사용합니다.

**색상**
| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `--color-bg` | `#f5ead8` | 화면 배경 |
| `--color-surface` | `#ebddc5` | 보조 면 |
| `--color-text` | `#201e1d` | 본문 텍스트 |
| `--color-accent` | `#c67139` | 주 강조(테라코타), 기본 버튼 |
| `--color-accent-2` | `#7a8a5e` | 보조 강조(세이지) |
| `--color-neutral-100` | `#f9f4ed` | 카드 · 탭바 배경 |
| `--color-neutral-200/300/400` | `#eee7db` / `#dcd3c4` / `#c0b6a5` | 면 · 테두리 · 점선 |
| `--color-neutral-600/700/800/900` | `#82796a` / `#645c50` / `#474238` / `#2e2b25` | 비활성 아이콘 / 보조 텍스트 / 본문 / 토스트 배경 |
| `--color-accent-200/300/500/700/800` | `#ffe1d0` / `#ffc6a5` / `#d67f48` / `#8c491a` / `#643312` | 이미지 자리표시자 · 태그 · 강조 텍스트 |
| `--color-accent-2-200/300/400/600/700/900` | `#e1eecc` / `#ccdbb2` / `#aebf92` / `#728157` / `#56633f` / `#272e1b` | 세이지 태그, 체크 채움, 안내 박스 |
| `--color-divider` | `rgba(32,30,29,.16)` | 구분선 |

**간격** `--space-1..8` = 4.4 / 8.8 / 13.2 / 17.6 / 26.4 / 35.2 px. 화면 좌우 패딩은 **22px**.

**Radius** `--radius-sm 8` · `--radius-md 16` · `--radius-lg 28` · 버튼/칩/썸네일 원형은 `999px`.

**그림자** `--shadow-sm 0 1px 2px rgba(46,43,37,.14)` · `--shadow-md 0 3px 10px rgba(46,43,37,.16)` · `--shadow-lg 0 12px 32px rgba(46,43,37,.22)`.

**타이포**
- 제목: `Jua`(한글 디스플레이) — 원 시스템의 Caprasimo는 한글 미지원이라 대체. 라틴 전용 문구에는 Caprasimo 유지 가능.
- 본문: `Gowun Dodum` (대체 Figtree / system-ui)
- 크기: 화면 제목 28–30px, 카드 제목 23–24px, 섹션 제목 18–19px, 본문 14–15px, 보조 12–13.5px, 캡션 11–12px. 행간 본문 1.6–1.7, 제목 1.12–1.35.
- 숫자·버튼 라벨은 제목 폰트(Jua) 사용.

## Screens / Views

### 1. 홈 (탭 1 · 피드형)
**목적** 앱을 열자마자 "오늘 뭐 먹지"에 답을 준다.
**레이아웃** 세로 스크롤. 패딩 `상 64 / 좌우 22 / 하 108`(탭바 96 + 여유). 섹션 간 간격 26–28px.

컴포넌트 순서:
1. **인사 행** — 좌: `수요일 저녁 · 지우님` 13px `--color-neutral-700`, 그 아래 `오늘 뭐 먹지?` 30px 제목폰트. 우: 44×44 원형 프로필(`--color-accent-2-300`) → **설정 진입점**.
2. **검색 필드** — 높이 약 46px, `--color-neutral-100`, radius 999px, padding `13/18`, `--shadow-sm`. 좌측 lucide `search` 18px stroke 2.75 `--color-accent-700`, 플레이스홀더 `레시피나 재료 검색` 14px.
3. **냉장고 재료 칩** — 섹션 제목 `냉장고에 있는 재료`(19px) + 우측 `모두 보기`(13px, accent-700). 칩: 13px, padding `7/14`, radius 999, `--color-accent-2-200` / 텍스트 `--color-accent-2-900`, gap 8px, 마지막에 점선 `+ 3개 더`(`1px dashed --color-neutral-400`).
4. **오늘의 추천 카드** — radius `--radius-lg`, `--color-neutral-100`, `--shadow-md`.
   - 이미지 영역 186px, `--color-accent-200`, 중앙 원형 자리표시자. 좌상단 배지 `재료 6개 중 4개 있어요` 11px, 흰 알약.
   - 본문 padding `16/18/20`: kicker `오늘의 추천` 12px 대문자 letter-spacing .1em `--color-accent-700` → 제목 23px → 설명 13.5px `--color-neutral-700` → 메타 행(시계 아이콘 20분 · 불꽃 쉬움 · 2인분) 13px.
   - 카드 전체 탭 → 레시피 상세.
5. **이번 주 일정 스트립** — 제목 + `전체 보기`. 가로 스크롤, 카드 76px 폭, radius 16, padding `12/10`, 오늘은 `--color-accent-200`/`--color-accent-800`, 나머지 `--color-neutral-100`/`--color-neutral-800`. 요일 12px + 메뉴 축약 13px. 탭 → 일정 탭.
6. **유통기한이 다가와요** — 행: 40px 원형 썸네일 + 이름 15px + 남은 기간 12.5px `--color-accent-700` + 우측 `레시피` 알약(세이지). 배경 `--color-neutral-100`, radius 16, padding `13/16`, gap 10px.

### 2. 주간 일정 (탭 3 · 요일 선택형)
**목적** 한 주 저녁 메뉴를 하루씩 정하고, 남는 재료를 이어 쓰게 한다.
**레이아웃** 세로 스크롤, 좌우 22px.
1. **헤더** `주간 일정` 28px + `8월 10일 – 16일 · 4끼 계획됨` 13px.
2. **요일 스트립** — 가로 스크롤, 칸 52px 폭, radius 20, padding 상하 11px, gap 9px. 요일 12px / 날짜 16px(제목폰트) / 하단 5px 점.
   - 선택됨: 배경 `--color-accent`, 글자 `--color-bg`, 점 `--color-bg`
   - 미선택: 배경 `--color-neutral-100`, 글자 `--color-neutral-800`, 계획 있으면 점 `--color-accent-500`, 없으면 투명
   - 배경 전환 `.2s ease`
3. **선택된 날 카드** — radius 28, `--color-neutral-100`, `--shadow-md`. 이미지 180px(계획 있으면 `--color-accent-200`, 없으면 `--color-neutral-200`). 본문: kicker `수요일 저녁` → 제목 24px(미정 시 `아직 정하지 않았어요`) → 메타 13px(`20분 · 2인분 · 오늘` / 미정 시 `냉장고 재료로 추천 4개가 있어요`) → 버튼 2개: primary `레시피 보기`(미정 시 `메뉴 정하기`), secondary `바꾸기`. 버튼 radius 999, padding `12/22`, 14px 제목폰트.
   - 날짜 변경 시 카드 페이드-업 `.25s ease` (`opacity 0→1`, `translateY 8px→0`).
4. **이어 쓰기 박스** — `--color-accent-2-200`, radius 28, padding `17/19`. kicker 12px 대문자 + 문구 14.5px, 색 `--color-accent-2-900`. 예: "남은 우유 200ml를 이 날 다 쓰게 됩니다. 유통기한 하루 전이에요." 겹치는 재료가 없으면 "이 날 재료는 앞뒤 요일과 겹치지 않아요."
5. **이 날 살 것** — 체크 원형(22px, `2px solid --color-neutral-400`) + 이름 14.5px + 수량 13px. 비어 있으면 "이 날은 냉장고 재료로 다 됩니다."

### 3. 하단 탭 바 (전 화면 공통)
높이 96px(하단 34px는 홈 인디케이터 영역), padding `12 / 16 / 34`, 배경 `--color-neutral-100`, 상단 `1px solid --color-divider`, 5등분 그리드.
아이콘 lucide 22–23px stroke-width **2.75**, 라벨 10.5–11px. 활성 `--color-accent-700`, 비활성 `--color-neutral-600`.
순서: **홈**(house) · **레시피**(book) · **일정**(calendar) · **장보기**(shopping-cart, 우상단 배지 = 남은 항목 수, `--color-accent` 배경/`--color-bg` 글자, 최소 16–17px 원형) · **재료**(냉장고 rect).

### 4. 참고 화면 (이미 구현되었거나 후속)
- **레시피 상세** — 290px 히어로 + 뒤로/저장 42px 원형 버튼, 태그 → 제목 28px → 설명 → 3분할 메타(조리 시간/난이도/분량) → 재료 체크리스트(없는 재료는 `없음` 태그) → `부족한 재료 2개 장보기에 담기` → 순서 미리보기 → 하단 고정 `요리 시작하기`.
- **요리 모드** — 배경 `--color-neutral-100`, 상단 진행 바(7px, `--color-accent`, width 전환 `.35s ease`) + `3 / 5`, 단계 문구 **34px**(주방에서 멀리서도 읽히게), 타이머 카드(38px 숫자, 시작/일시정지), 이 단계 재료 칩, 팁 박스(`--color-accent-100`), 하단 `이전` / `다음 단계`(마지막은 `완성했어요`).
- **장보기 / 재료 / 요리책** — 프로토타입 참조.

## Interactions & Behavior
- 탭 전환: 즉시, 화면 진입 시 `ckIn` 페이드-업(`opacity 0→1`, `translateY 8px→0`, `.28–.3s ease`).
- 홈 추천 카드 · 일정 카드 · 요리책 항목 → 레시피 상세 push. 상세의 뒤로 버튼은 직전 탭으로 복귀.
- 재료/장보기 체크: 원형 토글. 체크 시 배경·테두리 `--color-accent-2-600`, 흰 체크 아이콘, 장보기 행은 opacity .5 + 취소선.
- 요리 모드 타이머: 1초 간격 카운트다운, `mm:ss`, 0에서 자동 정지, 버튼 라벨 `타이머 시작 / 일시정지 / 다 됐어요`.
- 토스트: 하단 탭바 위 120px, 배경 `--color-neutral-900`, 글자 `--color-neutral-100`, radius 999, 2.2초 후 자동 사라짐, 등장 `.25s` 페이드-업.
- 요일 선택: 선택 상태만 바뀌고 스크롤은 유지.
- 히트 영역은 최소 44×44pt.

## State Management
- `tab` — `home | recipe | plan | shop | stock`
- `screen` — 탭 화면 + `detail | cook | done` (상세·요리 모드는 push 스택)
- `selectedDate` — 주간 일정에서 선택된 날짜 (기본: 오늘)
- `step`, `timer`, `timerRunning` — 요리 모드
- `checkedIngredients` (레시피별), `boughtItems` (장보기)
- `savedRecipes` — 북마크
- `toast` — 문구 + 자동 해제 타이머

데이터 요구: 주간 계획(날짜 → 레시피), 레시피(재료·단계·시간·난이도·분량), 재고(재료 + 유통기한), 장보기 목록(항목 + 출처 레시피). "이어 쓰기" 문구는 인접 요일 간 재료 중복에서 파생됩니다.

## Assets
- 아이콘: **Lucide**, stroke-width 2.75 (house, book-open, calendar, shopping-cart, refrigerator(rect 대체), search, clock, flame, check, plus, chevron-left/right, x)
- 사진: **없음.** 프로토타입의 모든 이미지는 원형 자리표시자입니다. 실제 요리 사진 필요, 이미지에는 `.washed` 처리(`filter: saturate(.6) contrast(.85) brightness(1.1) opacity(.94)`)를 적용해 배경에 가라앉게 합니다.
- 폰트: Google Fonts `Jua`, `Gowun Dodum`

## Files
- `designs/CookKit App.dc.html` — 통합 프로토타입(구현 기준)
- `designs/CookKit 메인·주간일정 시안.dc.html` — 시안 비교 보드(1a~1e)
- `designs/CookKitTabs.dc.html` — 탭 바
- `designs/organic-styles.css` — 토큰 원본
- `designs/ios-frame.jsx` — 목업 프레임(구현 대상 아님)
