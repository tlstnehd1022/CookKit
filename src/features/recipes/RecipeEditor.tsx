import { useState } from 'react';
import { useCategories, useIngredients, useRecipes, useTags, makeId } from '../../data/store';
import { useSettings } from '../../data/settings';
import * as claudeClient from '../../lib/claudeClient';
import * as geminiClient from '../../lib/geminiClient';
import type { ExtractedRecipe } from '../../lib/claudeClient';
import type { ExistingContext } from '../../lib/aiChat';
import type { Recipe, RecipeIngredient, RecipeStep } from '../../data/types';
import { COMMON_UNITS, CUSTOM_UNIT_VALUE } from '../../data/units';
import { RecipeChatPanel } from './RecipeChatPanel';
import { diffLineColor, summarizeRecipeDiff, type DiffLine, type RecipeSnapshot } from '../../lib/recipeDiff';
import { fetchYoutubeTranscript } from '../../lib/youtubeTranscript';

export function RecipeEditor({ recipeId, onDone }: { recipeId?: string; onDone: () => void }) {
  const { recipes, saveRecipe } = useRecipes();
  const { ingredients, saveIngredient } = useIngredients();
  const { categories, saveCategory } = useCategories();
  const { tags, saveTag } = useTags();
  const { settings } = useSettings();

  const existing = recipeId ? recipes.find((r) => r.id === recipeId) : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [servingsBase, setServingsBase] = useState(existing?.servingsBase ?? 2);
  const [tagIds, setTagIds] = useState<string[]>(existing?.tagIds ?? []);
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredient[]>(existing?.ingredients ?? []);
  const [steps, setSteps] = useState<RecipeStep[]>(existing?.steps ?? []);

  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeManualText, setYoutubeManualText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiWarning, setAiWarning] = useState<string | null>(null);
  const [youtubeStage, setYoutubeStage] = useState<'idle' | 'extracting' | 'analyzing'>('idle');
  const [pendingYoutubeResult, setPendingYoutubeResult] = useState<ExtractedRecipe | null>(null);
  const [pendingYoutubeDiff, setPendingYoutubeDiff] = useState<DiffLine[]>([]);
  const [pendingYoutubeSource, setPendingYoutubeSource] = useState<'captions' | 'supadata'>('captions');
  const [pendingYoutubeLanguage, setPendingYoutubeLanguage] = useState('');

  interface FormSnapshot {
    name: string;
    servingsBase: number;
    tagIds: string[];
    recipeIngredients: RecipeIngredient[];
    steps: RecipeStep[];
  }
  const [undoStack, setUndoStack] = useState<FormSnapshot[]>([]);

  function undoLastApply() {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setName(last.name);
    setServingsBase(last.servingsBase);
    setTagIds(last.tagIds);
    setRecipeIngredients(last.recipeIngredients);
    setSteps(last.steps);
    setUndoStack((prev) => prev.slice(0, -1));
  }

  const existingContext: ExistingContext = {
    tags: tags.map((tag) => tag.name),
    categories: categories.map((category) => category.name),
    ingredients: ingredients.map((ingredient) => ingredient.name),
  };

  const currentRecipeSnapshot: RecipeSnapshot = {
    name,
    servingsBase,
    ingredients: recipeIngredients.map((row) => ({
      name: ingredients.find((ingredient) => ingredient.id === row.ingredientId)?.name ?? '(알 수 없음)',
      amount: row.amount,
      unit: row.unit,
    })),
    tagNames: tagIds.map((id) => tags.find((tag) => tag.id === id)?.name).filter((n): n is string => Boolean(n)),
    steps,
  };

  function resolveOrCreateTag(rawName: string): string {
    const trimmed = rawName.trim();
    const matched = tags.find((tag) => tag.name === trimmed);
    if (matched) return matched.id;
    const id = makeId('tag');
    saveTag({ id, name: trimmed, type: 'style' });
    return id;
  }

  function applyExtractedResult(result: ExtractedRecipe) {
    setUndoStack((prev) => [...prev, { name, servingsBase, tagIds, recipeIngredients, steps }]);
    setName(result.name);
    setServingsBase(result.servingsBase || 1);
    setSteps(
      result.steps.map((step) => ({
        title: step.title,
        content: step.content,
        timerSeconds: step.timerSeconds ?? undefined,
      })),
    );
    setRecipeIngredients(
      result.ingredients.map((item) => {
        const matched = ingredients.find((ingredient) => ingredient.name.trim() === item.name.trim());
        const ingredientId = matched?.id ?? createIngredientFromAi(item.name, item.categoryName);
        return { ingredientId, amount: item.amount, unit: item.unit };
      }),
    );
    if (result.tagNames && result.tagNames.length > 0) {
      setTagIds(result.tagNames.map((tagName) => resolveOrCreateTag(tagName)));
    }
    setAiWarning(result.warning ?? null);
  }

  const isGemini = settings.aiProvider === 'gemini';

  async function runYoutubeConversion() {
    if (isGemini && !settings.geminiApiKey) {
      setAiError('설정 화면에서 Gemini API 키를 먼저 입력해주세요.');
      return;
    }
    if (!isGemini && !settings.anthropicApiKey) {
      setAiError('설정 화면에서 Anthropic API 키를 먼저 입력해주세요.');
      return;
    }
    if (!youtubeUrl.trim()) return;
    setAiLoading(true);
    setAiError(null);
    setAiWarning(null);
    setYoutubeStage('extracting');
    try {
      let transcriptText = '';
      let transcriptLanguage = '';
      let transcriptSource: 'captions' | 'supadata' = 'captions';
      try {
        const transcriptResult = await fetchYoutubeTranscript(youtubeUrl.trim());
        transcriptText = transcriptResult.transcript;
        transcriptLanguage = transcriptResult.language;
        transcriptSource = transcriptResult.source;
      } catch (err) {
        // 자막을 아예 못 가져온 경우(자막 없음/비공개 영상 등) — AI 호출 없이 바로 중단하고
        // 대체 경로(직접 붙여넣기 또는 상단 대화창)로 유도한다.
        const baseMessage = err instanceof Error ? err.message : '자막을 가져오지 못했습니다.';
        setAiError(
          isGemini
            ? `${baseMessage} 아래 "영상 자막/설명 직접 붙여넣기" 칸에 붙여넣거나, 위쪽 대화창에서 텍스트로 설명해서 만들어보세요.`
            : `${baseMessage} 위쪽 대화창에서 텍스트로 설명해서 만들어보세요.`,
        );
        return;
      }

      setYoutubeStage('analyzing');
      let result: ExtractedRecipe;
      if (isGemini) {
        let meta: geminiClient.YoutubeVideoMeta | null = null;
        if (settings.youtubeApiKey) {
          try {
            meta = await geminiClient.fetchYoutubeVideoMeta(settings.youtubeApiKey, youtubeUrl.trim());
          } catch {
            // YouTube Data API 조회 실패 시에도 자막 텍스트만으로 계속 진행
          }
        }
        const combinedTranscript = [transcriptText, youtubeManualText.trim()].filter(Boolean).join('\n\n');
        result = await geminiClient.extractRecipeFromYoutubeMeta(
          settings.geminiApiKey,
          settings.geminiModel,
          meta,
          combinedTranscript,
          existingContext,
        );
      } else {
        result = await claudeClient.extractRecipeFromTranscript(
          settings.anthropicApiKey,
          settings.model,
          transcriptText,
          existingContext,
        );
      }
      setPendingYoutubeResult(result);
      setPendingYoutubeDiff(summarizeRecipeDiff(currentRecipeSnapshot, result));
      setPendingYoutubeSource(transcriptSource);
      setPendingYoutubeLanguage(transcriptLanguage);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : '유튜브 변환에 실패했습니다.');
    } finally {
      setAiLoading(false);
      setYoutubeStage('idle');
    }
  }

  function confirmYoutubeApply() {
    if (!pendingYoutubeResult) return;
    applyExtractedResult(pendingYoutubeResult);
    if (!pendingYoutubeResult.warning) {
      setAiWarning(
        pendingYoutubeSource === 'supadata'
          ? '자막이 없는 영상이라 AI 음성 인식(Supadata)으로 추출한 결과입니다. 일반 자막보다 부정확할 수 있으니 꼭 확인해주세요.'
          : `유튜브 자막(${pendingYoutubeLanguage || '자동생성'}) 기반 추출 결과입니다. 실제 영상과 다를 수 있으니 꼭 확인해주세요.`,
      );
    }
    setPendingYoutubeResult(null);
    setPendingYoutubeDiff([]);
  }

  function discardYoutubeResult() {
    setPendingYoutubeResult(null);
    setPendingYoutubeDiff([]);
  }

  function createIngredientFromAi(rawName: string, categoryName?: string | null): string {
    const trimmed = rawName.trim();
    const id = makeId('ing');
    const trimmedCategoryName = categoryName?.trim();
    const matchedCategory = trimmedCategoryName
      ? categories.find((c) => c.name === trimmedCategoryName)
      : undefined;
    let categoryId: string;
    if (matchedCategory) {
      categoryId = matchedCategory.id;
    } else if (trimmedCategoryName) {
      categoryId = makeId('cat');
      saveCategory({ id: categoryId, name: trimmedCategoryName });
    } else {
      categoryId = categories.find((c) => c.name === '기타')?.id ?? categories[0]?.id ?? '';
    }
    saveIngredient({ id, name: trimmed, categoryId, defaultBuyUnit: '1개', allergens: [] });
    return id;
  }

  function toggleTag(tagId: string) {
    setTagIds((prev) => (prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]));
  }

  function updateIngredientRow(index: number, patch: Partial<RecipeIngredient>) {
    setRecipeIngredients((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeIngredientRow(index: number) {
    setRecipeIngredients((prev) => prev.filter((_, i) => i !== index));
  }

  function addIngredientRow() {
    if (ingredients.length === 0) return;
    setRecipeIngredients((prev) => [...prev, { ingredientId: ingredients[0].id, amount: 1, unit: '개' }]);
  }

  function updateStepRow(index: number, patch: Partial<RecipeStep>) {
    setSteps((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeStepRow(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  function addStepRow() {
    setSteps((prev) => [...prev, { title: '', content: '' }]);
  }

  function handleSave() {
    const recipe: Recipe = {
      id: existing?.id ?? makeId('recipe'),
      name: name.trim() || '이름 없는 레시피',
      servingsBase: servingsBase || 1,
      tagIds,
      ingredients: recipeIngredients,
      steps,
    };
    saveRecipe(recipe);
    onDone();
  }

  return (
    <div>
      <div className="row">
        <button className="btn small" onClick={onDone}>
          ← 취소
        </button>
        <h1 style={{ margin: 0 }}>{existing ? '레시피 수정' : '레시피 추가'}</h1>
      </div>

      <div className="section-title">AI로 레시피 만들기/수정하기</div>
      <RecipeChatPanel
        onApply={applyExtractedResult}
        existingContext={existingContext}
        currentRecipe={currentRecipeSnapshot}
      />
      {undoStack.length > 0 && (
        <button className="btn small" style={{ marginBottom: 12 }} onClick={undoLastApply}>
          ↩ AI 반영 이전으로 되돌리기 ({undoStack.length})
        </button>
      )}

      <div className="section-title">또는 유튜브 링크로 변환</div>
      <div className="card">
        <p className="text-muted" style={{ marginBottom: 8 }}>
          영상 자막을 자동으로 가져와 분석해요(한국어 자막 우선, 없으면 영어, 그래도 없으면 자동생성 자막
          순으로 시도). 자막이 아예 없는 영상은 서버에 설정된 경우 AI 음성 인식으로 한 번 더 시도하고, 그마저
          안 되면 위쪽 대화창에서 텍스트로 직접 설명해서 만들어주세요.
        </p>
        <div className="field">
          <label>유튜브 링크</label>
          <input
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
          />
        </div>
        {isGemini && (
          <div className="field">
            <label>영상 자막/설명 직접 붙여넣기 (선택, 자동 추출 실패 시 대체용)</label>
            <textarea
              rows={4}
              value={youtubeManualText}
              onChange={(e) => setYoutubeManualText(e.target.value)}
              placeholder="자동 추출된 자막에 더하고 싶은 내용이 있거나, 자동 추출이 실패했을 때 여기에 직접 붙여넣으면 됩니다."
            />
          </div>
        )}
        <button className="btn" onClick={runYoutubeConversion} disabled={aiLoading}>
          {aiLoading
            ? youtubeStage === 'extracting'
              ? '자막 추출 중...'
              : '레시피 분석 중...'
            : '유튜브에서 변환'}
        </button>

        {pendingYoutubeResult && (
          <div className="card" style={{ background: 'var(--chip-bg)', marginTop: 8 }}>
            <strong style={{ fontSize: 13 }}>유튜브 변환 결과 — 변경사항</strong>
            <ul style={{ margin: '6px 0', paddingLeft: 18, fontSize: 13 }}>
              {pendingYoutubeDiff.map((line, index) => (
                <li key={index} style={{ color: diffLineColor(line.kind) }}>
                  {line.text}
                </li>
              ))}
            </ul>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn small" onClick={discardYoutubeResult}>
                무시하기
              </button>
              <button className="btn small primary" onClick={confirmYoutubeApply}>
                이대로 반영하기
              </button>
            </div>
          </div>
        )}

        {aiError && <p style={{ color: 'var(--danger)', marginTop: 8 }}>{aiError}</p>}
        {aiWarning && <p className="text-muted" style={{ marginTop: 8 }}>⚠️ {aiWarning}</p>}
      </div>

      <div className="section-title">기본 정보</div>
      <div className="field">
        <label>레시피 이름</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label>기준 인분 수</label>
        <input
          type="number"
          min={1}
          value={servingsBase}
          onChange={(e) => setServingsBase(Number(e.target.value) || 1)}
        />
      </div>

      <div className="section-title">태그</div>
      <div className="chip-row">
        {tags.map((tag) => (
          <button
            key={tag.id}
            className={`chip selectable ${tagIds.includes(tag.id) ? 'active' : ''}`}
            onClick={() => toggleTag(tag.id)}
          >
            {tag.name}
          </button>
        ))}
      </div>

      <div className="section-title">재료</div>
      {recipeIngredients.map((row, index) => (
        <div className="row" key={index} style={{ marginBottom: 8, gap: 6 }}>
          <select
            value={row.ingredientId}
            onChange={(e) => updateIngredientRow(index, { ingredientId: e.target.value })}
            style={{ flex: 2 }}
          >
            {ingredients.map((ingredient) => (
              <option key={ingredient.id} value={ingredient.id}>
                {ingredient.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            value={row.amount}
            onChange={(e) => updateIngredientRow(index, { amount: Number(e.target.value) || 0 })}
            style={{ flex: 1, width: 60 }}
          />
          <UnitPicker unit={row.unit} onChange={(unit) => updateIngredientRow(index, { unit })} />
          <button className="btn small danger" onClick={() => removeIngredientRow(index)}>
            삭제
          </button>
        </div>
      ))}
      <button className="btn small" onClick={addIngredientRow} disabled={ingredients.length === 0}>
        + 재료 추가
      </button>
      {ingredients.length === 0 && <p className="text-muted">먼저 재료 관리 화면에서 재료를 등록해주세요.</p>}

      <div className="section-title">조리 순서</div>
      {steps.map((step, index) => (
        <div className="card" key={index}>
          <div className="field">
            <label>제목</label>
            <input value={step.title} onChange={(e) => updateStepRow(index, { title: e.target.value })} />
          </div>
          <div className="field">
            <label>내용</label>
            <textarea
              rows={2}
              value={step.content}
              onChange={(e) => updateStepRow(index, { content: e.target.value })}
            />
          </div>
          <div className="field">
            <label>타이머(선택)</label>
            <div className="row" style={{ gap: 6, justifyContent: 'flex-start' }}>
              <input
                type="number"
                min={0}
                value={Math.floor((step.timerSeconds ?? 0) / 60)}
                onChange={(e) => {
                  const minutes = Number(e.target.value) || 0;
                  const seconds = (step.timerSeconds ?? 0) % 60;
                  const total = minutes * 60 + seconds;
                  updateStepRow(index, { timerSeconds: total > 0 ? total : undefined });
                }}
                style={{ width: 60 }}
              />
              <span>분</span>
              <input
                type="number"
                min={0}
                max={59}
                value={(step.timerSeconds ?? 0) % 60}
                onChange={(e) => {
                  const seconds = Number(e.target.value) || 0;
                  const minutes = Math.floor((step.timerSeconds ?? 0) / 60);
                  const total = minutes * 60 + seconds;
                  updateStepRow(index, { timerSeconds: total > 0 ? total : undefined });
                }}
                style={{ width: 60 }}
              />
              <span>초</span>
            </div>
          </div>
          <button className="btn small danger" onClick={() => removeStepRow(index)}>
            이 단계 삭제
          </button>
        </div>
      ))}
      <button className="btn small" onClick={addStepRow}>
        + 조리 단계 추가
      </button>

      <div className="row" style={{ marginTop: 20 }}>
        <button className="btn" onClick={onDone}>
          취소
        </button>
        <button className="btn primary" onClick={handleSave} disabled={!name.trim()}>
          저장
        </button>
      </div>
    </div>
  );
}

function UnitPicker({ unit, onChange }: { unit: string; onChange: (unit: string) => void }) {
  const isKnown = COMMON_UNITS.includes(unit);
  const selectValue = isKnown ? unit : CUSTOM_UNIT_VALUE;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 70 }}>
      <select
        value={selectValue}
        onChange={(e) => {
          if (e.target.value === CUSTOM_UNIT_VALUE) {
            onChange('');
          } else {
            onChange(e.target.value);
          }
        }}
      >
        {COMMON_UNITS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        <option value={CUSTOM_UNIT_VALUE}>직접입력</option>
      </select>
      {!isKnown && (
        <input value={unit} onChange={(e) => onChange(e.target.value)} placeholder="단위 입력" />
      )}
    </div>
  );
}
