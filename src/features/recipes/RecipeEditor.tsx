import { useState } from 'react';
import { useCategories, useIngredients, useRecipes, useTags, makeId } from '../../data/store';
import { useSettings } from '../../data/settings';
import * as claudeClient from '../../lib/claudeClient';
import * as geminiClient from '../../lib/geminiClient';
import type { ExtractedRecipe } from '../../lib/claudeClient';
import type { Recipe, RecipeIngredient, RecipeStep } from '../../data/types';

export function RecipeEditor({ recipeId, onDone }: { recipeId?: string; onDone: () => void }) {
  const { recipes, saveRecipe } = useRecipes();
  const { ingredients, saveIngredient } = useIngredients();
  const { categories } = useCategories();
  const { tags } = useTags();
  const { settings } = useSettings();

  const existing = recipeId ? recipes.find((r) => r.id === recipeId) : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [servingsBase, setServingsBase] = useState(existing?.servingsBase ?? 2);
  const [tagIds, setTagIds] = useState<string[]>(existing?.tagIds ?? []);
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredient[]>(existing?.ingredients ?? []);
  const [steps, setSteps] = useState<RecipeStep[]>(existing?.steps ?? []);

  const [aiDescription, setAiDescription] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeManualText, setYoutubeManualText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiWarning, setAiWarning] = useState<string | null>(null);

  function applyExtractedResult(result: ExtractedRecipe) {
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
        const ingredientId = matched?.id ?? createIngredientFromAi(item.name);
        return { ingredientId, amount: item.amount, unit: item.unit };
      }),
    );
    setAiWarning(result.warning ?? null);
  }

  const isGemini = settings.aiProvider === 'gemini';

  async function runAiConversion() {
    if (isGemini && !settings.geminiApiKey) {
      setAiError('설정 화면에서 Gemini API 키를 먼저 입력해주세요.');
      return;
    }
    if (!isGemini && !settings.anthropicApiKey) {
      setAiError('설정 화면에서 Anthropic API 키를 먼저 입력해주세요.');
      return;
    }
    if (!aiDescription.trim()) return;
    setAiLoading(true);
    setAiError(null);
    setAiWarning(null);
    try {
      const result = isGemini
        ? await geminiClient.extractRecipeFromText(settings.geminiApiKey, settings.geminiModel, aiDescription)
        : await claudeClient.extractRecipeFromText(settings.anthropicApiKey, settings.model, aiDescription);
      applyExtractedResult(result);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI 변환에 실패했습니다.');
    } finally {
      setAiLoading(false);
    }
  }

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
    try {
      let result: ExtractedRecipe;
      if (isGemini) {
        let meta: geminiClient.YoutubeVideoMeta | null = null;
        if (settings.youtubeApiKey) {
          try {
            meta = await geminiClient.fetchYoutubeVideoMeta(settings.youtubeApiKey, youtubeUrl.trim());
          } catch {
            // YouTube Data API 조회 실패 시에도 사용자가 붙여넣은 텍스트만으로 계속 진행
          }
        }
        result = await geminiClient.extractRecipeFromYoutubeMeta(
          settings.geminiApiKey,
          settings.geminiModel,
          meta,
          youtubeManualText,
        );
      } else {
        result = await claudeClient.extractRecipeFromYoutubeUrl(
          settings.anthropicApiKey,
          settings.model,
          youtubeUrl.trim(),
        );
      }
      applyExtractedResult(result);
      if (!result.warning) {
        setAiWarning('유튜브 정보 기반 자동 추출 결과입니다. 실제 영상과 다를 수 있으니 꼭 확인해주세요.');
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : '유튜브 변환에 실패했습니다.');
    } finally {
      setAiLoading(false);
    }
  }

  function createIngredientFromAi(rawName: string): string {
    const trimmed = rawName.trim();
    const id = makeId('ing');
    const fallbackCategoryId = categories.find((c) => c.name === '기타')?.id ?? categories[0]?.id ?? '';
    saveIngredient({ id, name: trimmed, categoryId: fallbackCategoryId, defaultBuyUnit: '1개', allergens: [] });
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

      <div className="section-title">AI로 변환</div>
      <div className="card">
        <div className="field">
          <label>자연어로 레시피를 설명해주세요</label>
          <textarea
            rows={4}
            value={aiDescription}
            onChange={(e) => setAiDescription(e.target.value)}
            placeholder="예: 마늘 없는 크림 리조또, 2인분. 양파를 볶다가 밥과 육수를 넣고 끓인 뒤 생크림을 넣어 마무리..."
          />
        </div>
        <button className="btn primary" onClick={runAiConversion} disabled={aiLoading}>
          {aiLoading ? '변환 중...' : 'AI로 변환'}
        </button>

        <div className="field" style={{ marginTop: 16 }}>
          <label>또는 유튜브 링크로 변환 (제목/설명란 기반, 결과가 부정확할 수 있어요)</label>
          <input
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
          />
        </div>
        {isGemini && (
          <div className="field">
            <label>영상 자막/설명 직접 붙여넣기 (선택, 정확도 향상)</label>
            <textarea
              rows={4}
              value={youtubeManualText}
              onChange={(e) => setYoutubeManualText(e.target.value)}
              placeholder="유튜브 자막 텍스트를 복사해서 붙여넣으면 더 정확하게 변환됩니다. (유튜브 정책상 자막 자동 가져오기는 지원하지 않아요)"
            />
          </div>
        )}
        <button className="btn" onClick={runYoutubeConversion} disabled={aiLoading}>
          {aiLoading ? '변환 중...' : '유튜브에서 변환'}
        </button>

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
          <input
            value={row.unit}
            onChange={(e) => updateIngredientRow(index, { unit: e.target.value })}
            style={{ flex: 1, width: 60 }}
          />
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
            <label>타이머(초, 선택)</label>
            <input
              type="number"
              value={step.timerSeconds ?? ''}
              onChange={(e) =>
                updateStepRow(index, {
                  timerSeconds: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            />
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
