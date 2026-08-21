import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../../data/settings';
import { requestProfileSheet } from '../../data/profileSheet';
import { useSession } from '../../data/session';
import { getCurrentHouseholdId } from '../../data/store';
import { submitAiChatFeedback } from '../../data/aiChatFeedback';
import * as aiProxy from '../../lib/aiProxy';
import { ApiProxyError } from '../../lib/aiProxy';
import type { ChatTurn, ExistingContext } from '../../lib/aiChat';
import type { ExtractedRecipe } from '../../lib/claudeClient';
import { diffLineColor, summarizeRecipeDiff, type DiffLine, type RecipeSnapshot } from '../../lib/recipeDiff';
import { getErrorMessage } from '../../lib/errorMessage';
import { DIFFICULTY_LABEL } from '../../lib/recipeDifficulty';
import { estimateCookMinutes } from '../../lib/recipeTime';

export function RecipeChatPanel({
  onApply,
  existingContext,
  currentRecipe,
  autoSendText,
  initialInputText,
  recipeId,
}: {
  onApply: (result: ExtractedRecipe) => Promise<void>;
  existingContext: ExistingContext;
  currentRecipe: RecipeSnapshot;
  /** 홈 화면 "있는 재료로 만들기" 같은 진입점에서, 채팅을 열자마자 이 텍스트를 첫 사용자 메시지로
   * 자동 전송한다. */
  autoSendText?: string;
  /** 공유하기로 들어온 텍스트 등을 입력창에 미리 채워두기만 한다(autoSendText와 달리 자동
   * 전송하지 않음 — 사용자가 확인/수정 후 직접 보낼 수 있게). */
  initialInputText?: string;
  /** 지금 편집 중인 레시피 id(신규 레시피면 없음) — 👎 피드백에 참고용으로만 같이 저장 */
  recipeId?: string;
}) {
  const { settings } = useSettings();
  const isGemini = settings.aiProvider === 'gemini';
  const { user } = useSession();
  const householdId = getCurrentHouseholdId();

  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState(initialInputText ?? '');
  const [useWebSearch, setUseWebSearch] = useState(true);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRecipe, setPendingRecipe] = useState<ExtractedRecipe | null>(null);
  const [pendingDiff, setPendingDiff] = useState<DiffLine[]>([]);
  const [pendingReply, setPendingReply] = useState('');
  const [missingApiKey, setMissingApiKey] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // AI 응답 👎 피드백 — feedbackTarget은 지금 이유 입력 중인 메시지의 index, feedbackGiven은
  // 이미 제출해서 다시 못 누르게 숨길 index 목록, feedbackThanksIndex는 "피드백 감사해요"를
  // 잠깐 보여줄 index.
  const [feedbackTarget, setFeedbackTarget] = useState<number | null>(null);
  const [feedbackReason, setFeedbackReason] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState<Set<number>>(new Set());
  const [feedbackThanksIndex, setFeedbackThanksIndex] = useState<number | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  // 마운트 시 한 번만 자동 전송(ref로 StrictMode 이중 실행 방지) — send()는 함수 선언이라
  // 호이스팅되므로 아래에서 정의돼도 여기서 참조 가능.
  const autoSentRef = useRef(false);
  useEffect(() => {
    if (!autoSendText || autoSentRef.current) return;
    autoSentRef.current = true;
    send(autoSendText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const PRESET_REQUESTS = [
    { label: '더 맵게', text: '이 레시피를 더 맵게 수정해줘' },
    { label: '재료 줄이기', text: '재료 가짓수를 줄여서 더 간단하게 만들어줘' },
    { label: '1인분으로', text: '1인분 기준으로 바꿔줘' },
  ];

  async function send(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;

    const nextHistory: ChatTurn[] = [...messages, { role: 'user', text }];
    setMessages(nextHistory);
    setInput('');
    setError(null);
    setMissingApiKey(false);
    setLoading(true);
    try {
      const result = await aiProxy.chatAboutRecipe(
        settings.aiProvider,
        isGemini ? settings.geminiModel : settings.model,
        nextHistory,
        useWebSearch,
        existingContext,
        currentRecipe,
      );
      setMessages([...nextHistory, { role: 'assistant', text: result.reply }]);
      if (result.updatedRecipe) {
        setPendingRecipe(result.updatedRecipe);
        setPendingDiff(summarizeRecipeDiff(currentRecipe, result.updatedRecipe));
        setPendingReply(result.reply);
      }
    } catch (err) {
      if (err instanceof ApiProxyError && err.code === 'no_api_key') {
        setMissingApiKey(true);
      }
      setError(getErrorMessage(err, '대화 중 오류가 발생했습니다.'));
    } finally {
      setLoading(false);
    }
  }

  async function confirmApply() {
    if (!pendingRecipe) return;
    setApplying(true);
    setError(null);
    try {
      await onApply(pendingRecipe);
      setMessages((prev) => [...prev, { role: 'assistant', text: '✅ 아래 폼에 반영했어요.' }]);
      setPendingRecipe(null);
      setPendingDiff([]);
      setPendingReply('');
    } catch (err) {
      console.error('레시피 반영 실패:', err);
      setError(getErrorMessage(err, '반영 중 오류가 발생했습니다.'));
    } finally {
      setApplying(false);
    }
  }

  function discardPending() {
    setPendingRecipe(null);
    setPendingDiff([]);
    setPendingReply('');
  }

  async function submitFeedback(index: number) {
    const assistantMessage = messages[index];
    const userMessage = messages[index - 1];
    if (!assistantMessage || !user || !householdId) return;
    setFeedbackSubmitting(true);
    try {
      await submitAiChatFeedback({
        householdId,
        userId: user.id,
        recipeId,
        userMessage: userMessage?.text ?? '',
        aiResponse: assistantMessage.text,
        feedbackType: 'bad',
        reason: feedbackReason,
      });
      setFeedbackTarget(null);
      setFeedbackReason('');
      setFeedbackGiven((prev) => new Set(prev).add(index));
      setFeedbackThanksIndex(index);
      setTimeout(() => setFeedbackThanksIndex((cur) => (cur === index ? null : cur)), 2500);
    } catch (err) {
      console.error('AI 피드백 저장 실패:', err);
    } finally {
      setFeedbackSubmitting(false);
    }
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="card">
      <h2 style={{ fontSize: 14, marginBottom: 4 }}>💬 대화로 레시피 만들기/수정하기</h2>
      <p className="text-muted" style={{ marginBottom: 8 }}>
        만들고 싶거나 고치고 싶은 걸 편하게 말해보세요.
      </p>

      {(currentRecipe.name.trim() || currentRecipe.ingredients.length > 0) && (
        <details className="text-muted" style={{ marginBottom: 8, fontSize: 13 }}>
          <summary style={{ cursor: 'pointer' }}>
            ✏️ 지금 폼에 있는 "{currentRecipe.name || '이름 없는 레시피'}" 내용(재료{' '}
            {currentRecipe.ingredients.length}개, 조리 {currentRecipe.steps.length}단계)을 참고해서 대화해요.
            (펼쳐보기)
          </summary>
          <div style={{ marginTop: 6, paddingLeft: 4 }}>
            <div>
              <strong>재료:</strong>{' '}
              {currentRecipe.ingredients.length > 0
                ? currentRecipe.ingredients.map((i) => `${i.name} ${i.amount}${i.unit}`).join(', ')
                : '(없음)'}
            </div>
            <div style={{ marginTop: 4 }}>
              <strong>조리순서:</strong>
            </div>
            {currentRecipe.steps.length > 0 ? (
              <ol style={{ margin: '4px 0', paddingLeft: 18 }}>
                {currentRecipe.steps.map((step, index) => (
                  <li key={index}>
                    {step.title}: {step.content}
                  </li>
                ))}
              </ol>
            ) : (
              <div>(없음)</div>
            )}
            {currentRecipe.tagNames.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <strong>태그:</strong> {currentRecipe.tagNames.join(', ')}
              </div>
            )}
          </div>
        </details>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          marginBottom: 8,
          maxHeight: 320,
          overflowY: 'auto',
        }}
      >
        {messages.length === 0 && (
          <p className="text-muted">"고추기름 넣은 얼큰 라면 끓이는 법 알려줘"</p>
        )}
        {messages.map((message, index) => (
          <div
            key={index}
            style={{
              alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div
              style={{
                background: message.role === 'user' ? 'var(--accent)' : 'var(--chip-bg)',
                color: message.role === 'user' ? 'var(--accent-contrast)' : 'var(--text)',
                borderRadius: 12,
                padding: '8px 12px',
                whiteSpace: 'pre-wrap',
                fontSize: 14,
              }}
            >
              {message.text}
            </div>
            {message.role === 'assistant' &&
              (feedbackTarget === index ? (
                <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                  <div className="field" style={{ flex: 1, margin: 0 }}>
                    <input
                      value={feedbackReason}
                      onChange={(e) => setFeedbackReason(e.target.value)}
                      placeholder="어떤 점이 아쉬웠나요? (선택)"
                      style={{ fontSize: 13, padding: '6px 10px' }}
                    />
                  </div>
                  <button className="btn small" onClick={() => setFeedbackTarget(null)} disabled={feedbackSubmitting}>
                    취소
                  </button>
                  <button
                    className="btn small primary"
                    onClick={() => submitFeedback(index)}
                    disabled={feedbackSubmitting}
                  >
                    제출
                  </button>
                </div>
              ) : feedbackThanksIndex === index ? (
                <span className="text-muted" style={{ fontSize: 12 }}>
                  피드백 감사해요
                </span>
              ) : (
                !feedbackGiven.has(index) && (
                  <button
                    type="button"
                    onClick={() => {
                      setFeedbackTarget(index);
                      setFeedbackReason('');
                    }}
                    aria-label="이 답변이 별로였어요"
                    title="이 답변이 별로였어요"
                    style={{
                      alignSelf: 'flex-start',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      opacity: 0.4,
                      fontSize: 13,
                      padding: '2px 4px',
                    }}
                  >
                    👎
                  </button>
                )
              ))}
          </div>
        ))}
        {loading && <p className="text-muted">생각하는 중...</p>}
        <div ref={messagesEndRef} />
      </div>

      {pendingRecipe && (
        <div className="card" style={{ background: 'var(--chip-bg)', marginBottom: 8 }}>
          {pendingRecipe.tagline && (
            <p style={{ margin: '0 0 8px', fontStyle: 'italic' }}>“{pendingRecipe.tagline}”</p>
          )}
          <strong style={{ fontSize: 13 }}>AI가 제안한 변경사항</strong>
          {pendingReply && (
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>{pendingReply}</p>
          )}
          <ul style={{ margin: '6px 0', paddingLeft: 18, fontSize: 13 }}>
            {pendingDiff.map((line, index) => (
              <li key={index} style={{ color: diffLineColor(line.kind) }}>
                {line.text}
              </li>
            ))}
            <li style={{ color: diffLineColor('info') }}>
              난이도: {pendingRecipe.difficulty ? DIFFICULTY_LABEL[pendingRecipe.difficulty] : '-'} / 조리시간: 약{' '}
              {estimateCookMinutes(pendingRecipe.steps)}분
            </li>
          </ul>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn small" onClick={discardPending} disabled={applying}>
              무시하기
            </button>
            <button className="btn small primary" onClick={confirmApply} disabled={applying}>
              {applying ? '반영 중...' : '이대로 반영하기'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 8 }}>
          <p style={{ color: 'var(--danger)', marginBottom: missingApiKey ? 6 : 0 }}>{error}</p>
          {missingApiKey && (
            <button className="btn small" onClick={() => requestProfileSheet()}>
              설정으로 이동
            </button>
          )}
        </div>
      )}

      <div className="field">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={useWebSearch} onChange={(e) => setUseWebSearch(e.target.checked)} />
          웹 검색으로 참고하기
        </label>
      </div>

      {currentRecipe.ingredients.length > 0 && (
        <div className="chip-row" style={{ marginBottom: 8 }}>
          {PRESET_REQUESTS.map((preset) => (
            <button
              key={preset.label}
              className="chip selectable"
              disabled={loading}
              onClick={() => send(preset.text)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}

      <div className="row" style={{ gap: 6, alignItems: 'flex-end' }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="레시피에 대해 말해보세요... (Shift+Enter로 줄바꿈)"
          rows={2}
          style={{ flex: 1, resize: 'vertical' }}
        />
        <button className="btn primary" onClick={() => send()} disabled={loading}>
          {loading ? '...' : '보내기'}
        </button>
      </div>
    </div>
  );
}
