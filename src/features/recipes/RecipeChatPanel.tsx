import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../../data/settings';
import { requestProfileSheet } from '../../data/profileSheet';
import * as aiProxy from '../../lib/aiProxy';
import { ApiProxyError } from '../../lib/aiProxy';
import type { ChatTurn, ExistingContext } from '../../lib/aiChat';
import type { ExtractedRecipe } from '../../lib/claudeClient';
import { diffLineColor, summarizeRecipeDiff, type DiffLine, type RecipeSnapshot } from '../../lib/recipeDiff';
import { getErrorMessage } from '../../lib/errorMessage';

export function RecipeChatPanel({
  onApply,
  existingContext,
  currentRecipe,
}: {
  onApply: (result: ExtractedRecipe) => Promise<void>;
  existingContext: ExistingContext;
  currentRecipe: RecipeSnapshot;
}) {
  const { settings } = useSettings();
  const isGemini = settings.aiProvider === 'gemini';

  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [useWebSearch, setUseWebSearch] = useState(true);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRecipe, setPendingRecipe] = useState<ExtractedRecipe | null>(null);
  const [pendingDiff, setPendingDiff] = useState<DiffLine[]>([]);
  const [missingApiKey, setMissingApiKey] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

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
        처음 만드는 레시피든 이미 채워진 초안을 고치는 것이든 여기서 대화로 하시면 돼요. 애매한 부분(예:
        재료를 사서 쓰는지 직접 만드는지)은 먼저 물어볼 수 있고, 태그·재료 카테고리도 기존 목록 중에서
        알아서 골라 반영해요(마땅한 게 없으면 새로 만들고 알려드려요). AI가 변경안을 제안하면 바로 반영되지
        않고 아래에서 확인 후 반영할 수 있어요. "웹 검색"을 켜면 실제 표준 레시피를 찾아보고 참고합니다
        (조금 느려짐, 기본은 학습된 일반 지식으로만 답함).
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
          <p className="text-muted">예: "고추기름 넣은 얼큰 라면 끓이는 법 알려줘" 처럼 말을 걸어보세요.</p>
        )}
        {messages.map((message, index) => (
          <div
            key={index}
            style={{
              alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
              background: message.role === 'user' ? 'var(--accent)' : 'var(--chip-bg)',
              color: message.role === 'user' ? 'var(--accent-contrast)' : 'var(--text)',
              borderRadius: 12,
              padding: '8px 12px',
              maxWidth: '85%',
              whiteSpace: 'pre-wrap',
              fontSize: 14,
            }}
          >
            {message.text}
          </div>
        ))}
        {loading && <p className="text-muted">생각하는 중...</p>}
        <div ref={messagesEndRef} />
      </div>

      {pendingRecipe && (
        <div className="card" style={{ background: 'var(--chip-bg)', marginBottom: 8 }}>
          <strong style={{ fontSize: 13 }}>AI가 제안한 변경사항</strong>
          <ul style={{ margin: '6px 0', paddingLeft: 18, fontSize: 13 }}>
            {pendingDiff.map((line, index) => (
              <li key={index} style={{ color: diffLineColor(line.kind) }}>
                {line.text}
              </li>
            ))}
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
