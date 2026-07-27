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
import { deleteImage, saveImage, useStoredImage } from '../../data/imageStore';
import { getErrorMessage } from '../../lib/errorMessage';

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
  const [applyingYoutube, setApplyingYoutube] = useState(false);

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
    ingredientPreferences: ingredients
      .filter((ingredient) => ingredient.preferredUnit || ingredient.preferredMethod)
      .map((ingredient) => ({
        name: ingredient.name,
        preferredUnit: ingredient.preferredUnit,
        preferredMethod: ingredient.preferredMethod,
      })),
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

  async function resolveOrCreateTag(rawName: string): Promise<string> {
    const trimmed = rawName.trim();
    const matched = tags.find((tag) => tag.name === trimmed);
    if (matched) return matched.id;
    const id = makeId();
    await saveTag({ id, name: trimmed, type: 'style' });
    return id;
  }

  async function applyExtractedResult(result: ExtractedRecipe) {
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
    // 새 재료/태그는 DB에 실제로 만들어진 뒤에야 레시피 쪽에서 안전하게 참조할 수 있어서
    // (recipe_tags/재료 참조가 FK로 걸려있음) 여기서 순서대로 기다린다.
    const newRecipeIngredients = await Promise.all(
      result.ingredients.map(async (item) => {
        const matched = ingredients.find((ingredient) => ingredient.name.trim() === item.name.trim());
        const ingredientId = matched?.id ?? (await createIngredientFromAi(item.name, item.categoryName));
        return { ingredientId, amount: item.amount, unit: item.unit };
      }),
    );
    setRecipeIngredients(newRecipeIngredients);

    if (result.tagNames && result.tagNames.length > 0) {
      const newTagIds = await Promise.all(result.tagNames.map((tagName) => resolveOrCreateTag(tagName)));
      setTagIds(newTagIds);
    }
    setAiWarning(result.warning ?? null);
    offerBatchImageGenerationForNewSteps(result.steps, result.name);
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

  async function confirmYoutubeApply() {
    if (!pendingYoutubeResult) return;
    setApplyingYoutube(true);
    setAiError(null);
    try {
      await applyExtractedResult(pendingYoutubeResult);
      if (!pendingYoutubeResult.warning) {
        setAiWarning(
          pendingYoutubeSource === 'supadata'
            ? '자막이 없는 영상이라 AI 음성 인식(Supadata)으로 추출한 결과입니다. 일반 자막보다 부정확할 수 있으니 꼭 확인해주세요.'
            : `유튜브 자막(${pendingYoutubeLanguage || '자동생성'}) 기반 추출 결과입니다. 실제 영상과 다를 수 있으니 꼭 확인해주세요.`,
        );
      }
      setPendingYoutubeResult(null);
      setPendingYoutubeDiff([]);
    } catch (err) {
      console.error('유튜브 반영 실패:', err);
      setAiError(getErrorMessage(err, '반영 중 오류가 발생했습니다.'));
    } finally {
      setApplyingYoutube(false);
    }
  }

  function discardYoutubeResult() {
    setPendingYoutubeResult(null);
    setPendingYoutubeDiff([]);
  }

  async function createIngredientFromAi(rawName: string, categoryName?: string | null): Promise<string> {
    const trimmed = rawName.trim();
    const id = makeId();
    const trimmedCategoryName = categoryName?.trim();
    const matchedCategory = trimmedCategoryName
      ? categories.find((c) => c.name === trimmedCategoryName)
      : undefined;
    let categoryId: string;
    if (matchedCategory) {
      categoryId = matchedCategory.id;
    } else if (trimmedCategoryName) {
      categoryId = makeId();
      await saveCategory({ id: categoryId, name: trimmedCategoryName });
    } else {
      categoryId = categories.find((c) => c.name === '기타')?.id ?? categories[0]?.id ?? '';
    }
    await saveIngredient({ id, name: trimmed, categoryId, defaultBuyUnit: '1개', allergens: [], owned: false });
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
    const removed = steps[index];
    if (removed?.imageId) {
      deleteImage(removed.imageId).catch(() => {
        // 삭제 실패해도 폼 상태는 그대로 진행 — IndexedDB 정리는 best-effort
      });
    }
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  function moveStepRow(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    setSteps((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function addStepRow() {
    setSteps((prev) => [...prev, { title: '', content: '' }]);
  }

  const [imageGeneratingIndex, setImageGeneratingIndex] = useState<number | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);

  async function generateImageForStep(index: number) {
    if (!settings.geminiApiKey) {
      setImageError('설정 화면에서 Gemini API 키를 먼저 입력해주세요.');
      return;
    }
    const step = steps[index];
    if (!step) return;
    setImageError(null);
    setImageGeneratingIndex(index);
    try {
      const prompt = geminiClient.buildStepImagePrompt(name || '이름 없는 레시피', step);
      const dataUrl = await geminiClient.generateStepImage(settings.geminiApiKey, prompt);
      const imageId = step.imageId ?? makeId();
      await saveImage(imageId, dataUrl);
      updateStepRow(index, { imageId });
    } catch (err) {
      setImageError(err instanceof Error ? err.message : '이미지 생성에 실패했습니다.');
    } finally {
      setImageGeneratingIndex(null);
    }
  }

  async function removeImageFromStep(index: number) {
    const step = steps[index];
    if (!step?.imageId) return;
    await deleteImage(step.imageId).catch(() => {});
    updateStepRow(index, { imageId: undefined });
  }

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error ?? new Error('파일을 읽지 못했습니다.'));
      reader.readAsDataURL(file);
    });
  }

  async function uploadImageForStep(index: number, file: File) {
    const step = steps[index];
    if (!step) return;
    setImageError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const imageId = step.imageId ?? makeId();
      await saveImage(imageId, dataUrl);
      updateStepRow(index, { imageId });
    } catch (err) {
      setImageError(err instanceof Error ? err.message : '사진 업로드에 실패했습니다.');
    }
  }

  const BATCH_SIZE = 7;
  const BATCH_WARN_THRESHOLD = 7;

  async function generateImagesForIndexes(
    indexes: number[],
    stepsSource: { title: string; content: string; imageId?: string }[],
    recipeNameForPrompt: string,
  ) {
    const apiKey = settings.geminiApiKey;
    if (!apiKey || indexes.length === 0) return;
    setImageError(null);
    setBatchProgress({ done: 0, total: indexes.length });
    let doneCount = 0;
    const failures: string[] = [];
    for (let i = 0; i < indexes.length; i += BATCH_SIZE) {
      const batch = indexes.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (stepIndex) => {
          const step = stepsSource[stepIndex];
          if (!step) return;
          try {
            const prompt = geminiClient.buildStepImagePrompt(recipeNameForPrompt, step);
            const dataUrl = await geminiClient.generateStepImage(apiKey, prompt);
            const imageId = step.imageId ?? makeId();
            await saveImage(imageId, dataUrl);
            updateStepRow(stepIndex, { imageId });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[이미지 생성 실패] 단계 ${stepIndex + 1} (${step.title}):`, message);
            failures.push(`${stepIndex + 1}단계: ${message}`);
          } finally {
            doneCount += 1;
            setBatchProgress({ done: doneCount, total: indexes.length });
          }
        }),
      );
    }
    setBatchProgress(null);
    if (failures.length > 0) {
      setImageError(
        `${indexes.length}개 중 ${failures.length}개 이미지 생성에 실패했습니다.\n` + failures.join('\n'),
      );
    }
  }

  function confirmAndRunBatchForCurrentSteps() {
    if (!settings.geminiApiKey) {
      setImageError('설정 화면에서 Gemini API 키를 먼저 입력해주세요.');
      return;
    }
    if (steps.length === 0) return;
    const existingCount = steps.filter((s) => s.imageId).length;
    let targetIndexes = steps.map((_, i) => i);
    if (existingCount > 0) {
      const overwrite = confirm(
        `이미 이미지가 있는 단계가 ${existingCount}개 있어요. 기존 이미지도 다시 만들까요?\n` +
          `(취소를 누르면 이미지가 없는 단계만 생성해요)`,
      );
      if (!overwrite) {
        targetIndexes = steps.map((_, i) => i).filter((i) => !steps[i].imageId);
      }
    }
    if (targetIndexes.length === 0) {
      setImageError('생성할 단계가 없습니다.');
      return;
    }
    const manyStepsNote =
      targetIndexes.length >= BATCH_WARN_THRESHOLD
        ? ` 조리 단계가 많아(${targetIndexes.length}개) 시간이 좀 더 걸릴 수 있어요.`
        : '';
    const proceed = confirm(
      `${targetIndexes.length}개 단계의 이미지를 생성할까요? 시간이 조금 걸릴 수 있어요.${manyStepsNote}`,
    );
    if (!proceed) return;
    generateImagesForIndexes(targetIndexes, steps, name || '이름 없는 레시피');
  }

  function offerBatchImageGenerationForNewSteps(
    newSteps: { title: string; content: string }[],
    recipeName: string,
  ) {
    if (settings.aiProvider !== 'gemini' || !settings.geminiApiKey || newSteps.length === 0) return;
    const manyStepsNote =
      newSteps.length >= BATCH_WARN_THRESHOLD
        ? ` 조리 단계가 많아(${newSteps.length}개) 시간이 좀 더 걸릴 수 있어요.`
        : '';
    const proceed = confirm(
      `레시피가 반영됐어요. 조리 단계 이미지도 자동으로 생성할까요? 시간이 조금 걸릴 수 있어요.${manyStepsNote}`,
    );
    if (!proceed) return;
    generateImagesForIndexes(
      newSteps.map((_, i) => i),
      newSteps,
      recipeName || '이름 없는 레시피',
    );
  }

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSave() {
    const recipe: Recipe = {
      id: existing?.id ?? makeId(),
      name: name.trim() || '이름 없는 레시피',
      servingsBase: servingsBase || 1,
      tagIds,
      ingredients: recipeIngredients,
      steps,
    };
    setSaving(true);
    setSaveError(null);
    try {
      await saveRecipe(recipe);
      onDone();
    } catch (err) {
      console.error('레시피 저장 실패:', err);
      setSaveError(getErrorMessage(err, '레시피 저장에 실패했습니다.'));
    } finally {
      setSaving(false);
    }
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
              <button className="btn small" onClick={discardYoutubeResult} disabled={applyingYoutube}>
                무시하기
              </button>
              <button className="btn small primary" onClick={confirmYoutubeApply} disabled={applyingYoutube}>
                {applyingYoutube ? '반영 중...' : '이대로 반영하기'}
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

      <div className="row">
        <div className="section-title" style={{ margin: 0 }}>
          조리 순서
        </div>
        {isGemini && steps.length > 0 && (
          <button
            className="btn small"
            disabled={batchProgress !== null || imageGeneratingIndex !== null}
            onClick={confirmAndRunBatchForCurrentSteps}
          >
            🖼 전체 이미지 생성
          </button>
        )}
      </div>
      {batchProgress && (
        <p className="text-muted">
          이미지 생성 중... ({batchProgress.done}/{batchProgress.total})
        </p>
      )}
      {steps.map((step, index) => (
        <div className="card" key={index}>
          <div className="row" style={{ marginBottom: 8 }}>
            <span className="text-muted">{index + 1}단계</span>
            <div className="chip-row" style={{ marginTop: 0 }}>
              <button className="btn small" disabled={index === 0} onClick={() => moveStepRow(index, -1)}>
                ▲
              </button>
              <button
                className="btn small"
                disabled={index === steps.length - 1}
                onClick={() => moveStepRow(index, 1)}
              >
                ▼
              </button>
            </div>
          </div>
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

          <div className="field">
            <label>조리 단계 이미지 (선택)</label>
            <StepImagePreview imageId={step.imageId} />
            <div className="chip-row" style={{ marginTop: 6 }}>
              {isGemini && (
                <button
                  className="btn small"
                  disabled={imageGeneratingIndex !== null || batchProgress !== null}
                  onClick={() => generateImageForStep(index)}
                >
                  {imageGeneratingIndex === index
                    ? '생성 중...'
                    : step.imageId
                      ? '🎨 다시 생성'
                      : '🎨 이미지 생성'}
                </button>
              )}
              <label className="btn small" style={{ cursor: 'pointer' }}>
                📁 사진 업로드
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadImageForStep(index, file);
                    e.target.value = '';
                  }}
                />
              </label>
              {step.imageId && (
                <button className="btn small danger" onClick={() => removeImageFromStep(index)}>
                  이미지 삭제
                </button>
              )}
            </div>
          </div>

          <button className="btn small danger" onClick={() => removeStepRow(index)}>
            이 단계 삭제
          </button>
        </div>
      ))}
      {imageError && (
        <p style={{ color: 'var(--danger)', whiteSpace: 'pre-wrap' }}>{imageError}</p>
      )}
      <button className="btn small" onClick={addStepRow}>
        + 조리 단계 추가
      </button>

      {saveError && <p style={{ color: 'var(--danger)' }}>{saveError}</p>}
      <div className="row" style={{ marginTop: 20 }}>
        <button className="btn" onClick={onDone}>
          취소
        </button>
        <button className="btn primary" onClick={handleSave} disabled={!name.trim() || saving}>
          {saving ? '저장 중...' : '저장'}
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

function StepImagePreview({ imageId }: { imageId?: string }) {
  const dataUrl = useStoredImage(imageId);
  if (!imageId) return null;
  return (
    <div
      style={{
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        border: '1px solid var(--border)',
        aspectRatio: '4 / 3',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--chip-bg)',
      }}
    >
      {dataUrl ? (
        <img src={dataUrl} alt="조리 단계 이미지" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span className="text-muted">불러오는 중...</span>
      )}
    </div>
  );
}
