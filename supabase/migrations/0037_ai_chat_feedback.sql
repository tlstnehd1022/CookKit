-- ============================================================================
-- 0037_ai_chat_feedback.sql — AI 대화 응답에 대한 피드백 기록
-- ============================================================================
-- 대화형 AI(RecipeChatPanel)의 응답이 별로였을 때 👎로 남기는 기록 — household 공유(모든
-- 구성원이 조회 가능), 생성은 household 멤버 + 본인 명의로만(cooking_log 0018과 같은 패턴).
-- 프롬프트를 직접 고치는 기능이 아니라 "보는 용도"의 로그라 update/delete 정책은 두지 않는다.
--
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 한 번 실행.
-- ============================================================================

create table if not exists public.ai_chat_feedback (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- 레시피 편집 중이 아니었거나(신규 레시피 대화 등) 나중에 레시피가 삭제돼도 피드백 자체는
  -- 남겨야 해서(디버깅 자료) cascade가 아니라 set null.
  recipe_id uuid references public.recipes(id) on delete set null,
  user_message text not null,
  ai_response text not null,
  -- 'bad'만 우선 구현. 나중에 'good' 등을 추가해도 이 컬럼은 그냥 자유 text라 마이그레이션이
  -- 필요 없다(의도적으로 체크 제약을 두지 않음).
  feedback_type text not null default 'bad',
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists ai_chat_feedback_household_id_idx on public.ai_chat_feedback (household_id, created_at desc);

alter table public.ai_chat_feedback enable row level security;

drop policy if exists "ai_chat_feedback_select_household" on public.ai_chat_feedback;
create policy "ai_chat_feedback_select_household" on public.ai_chat_feedback
  for select using (public.is_household_member(household_id));

drop policy if exists "ai_chat_feedback_insert_own" on public.ai_chat_feedback;
create policy "ai_chat_feedback_insert_own" on public.ai_chat_feedback
  for insert with check (public.is_household_member(household_id) and user_id = auth.uid());
