import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../../data/settings';
import * as claudeClient from '../../lib/claudeClient';
import * as geminiClient from '../../lib/geminiClient';
import type { ChatTurn, ExistingContext } from '../../lib/aiChat';
import type { ExtractedRecipe } from '../../lib/claudeClient';
import { summarizeRecipeDiff, type DiffLine, type DiffLineKind, type RecipeSnapshot } from '../../lib/recipeDiff';

function diffLineColor(kind: DiffLineKind): string {
  switch (kind) {
    case 'add':
      return 'var(--success)';
    case 'remove':
      return 'var(--danger)';
    case 'change':
      return 'var(--accent)';
    default:
      return 'var(--text-muted)';
  }
}

export function RecipeChatPanel({
  onApply,
  existingContext,
  currentRecipe,
}: {
  onApply: (result: ExtractedRecipe) => void;
  existingContext: ExistingContext;
  currentRecipe: RecipeSnapshot;
}) {
  const { settings } = useSettings();
  const isGemini = settings.aiProvider === 'gemini';

  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [useWebSearch, setUseWebSearch] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRecipe, setPendingRecipe] = useState<ExtractedRecipe | null>(null);
  const [pendingDiff, setPendingDiff] = useState<DiffLine[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    if (isGemini && !settings.geminiApiKey) {
      setError('설정 화면에서 Gemini API 키를 먼저 입력해주세요.');
      return;
    }
    if (!isGemini && !settings.anthropicApiKey) {
      setError('설정 화면에서 Anthropic API 키를 먼저 입력해주세요.');
      return;
    }

    const nextHistory: ChatTurn[] = [...messages, { role: 'user', text }];
    setMessages(nextHistory);
    setInput('');
    setError(null);
    setLoading(true);
    try {
      const result = isGemini
        ? await geminiClient.chatAboutRecipe(
            settings.geminiApiKey,
            settings.geminiModel,
            nextHistory,
            useWebSearch,
            existingContext,
          )
        : await claudeClient.chatAboutRecipe(
            settings.anthropicApiKey,
            settings.model,
            nextHistory,
            useWebSearch,
            existingContext,
          );
      setMessages([...nextHistory, { role: 'assistant', text: result.reply }]);
      if (result.updatedRecipe) {
        setPendingRecipe(result.updatedRecipe);
        setPendingDiff(summarizeRecipeDiff(currentRecipe, result.updatedRecipe));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '대화 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  function confirmApply() {
    if (!pendingRecipe) return;
    onApply(pendingRecipe);
    setMessages((prev) => [...prev, { role: 'assistant', text: '✅ 아래 폼에 반영했어요.' }]);
    setPendingRecipe(null);
    setPendingDiff([]);
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
            <button className="btn small" onClick={discardPending}>
              무시하기
            </button>
            <button className="btn small primary" onClick={confirmApply}>
              이대로 반영하기
            </button>
          </div>
        </div>
      )}

      {error && <p style={{ color: 'var(--danger)', marginBottom: 8 }}>{error}</p>}

      <div className="field">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={useWebSearch} onChange={(e) => setUseWebSearch(e.target.checked)} />
          웹 검색으로 참고하기
        </label>
      </div>

      <div className="row" style={{ gap: 6, alignItems: 'flex-end' }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="레시피에 대해 말해보세요... (Shift+Enter로 줄바꿈)"
          rows={2}
          style={{ flex: 1, resize: 'vertical' }}
        />
        <button className="btn primary" onClick={send} disabled={loading}>
          {loading ? '...' : '보내기'}
        </button>
      </div>
    </div>
  );
}
