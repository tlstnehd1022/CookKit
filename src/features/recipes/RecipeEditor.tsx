import { useEffect, useRef, useState } from 'react';
import { useCategories, useIngredients, useRecipes, useTags, makeId, getCurrentHouseholdId } from '../../data/store';
import { useSettings } from '../../data/settings';
import { requestProfileSheet } from '../../data/profileSheet';
// geminiClient는 이제 API 키가 필요 없는 순수 함수(프롬프트 생성)와 youtubeApiKey(범위 밖, 계속
// 클라이언트에서 직접 씀)를 쓰는 fetchYoutubeVideoMeta만 남음 — 실제 AI 호출(대화/추출/이미지
// 생성)은 aiProxy를 거쳐 서버로 감(Phase 4, API 키 Vault 전환).
import * as geminiClient from '../../lib/geminiClient';
import * as aiProxy from '../../lib/aiProxy';
import { ApiProxyError } from '../../lib/aiProxy';
import type { ExtractedRecipe } from '../../lib/claudeClient';
import type { ExistingContext } from '../../lib/aiChat';
import type { Difficulty, Recipe, RecipeIngredient, RecipeStep, RecipeVisibility } from '../../data/types';
import { COMMON_UNITS, CUSTOM_UNIT_VALUE } from '../../data/units';
import { RecipeChatPanel } from './RecipeChatPanel';
import { diffLineColor, summarizeRecipeDiff, type DiffLine, type RecipeSnapshot } from '../../lib/recipeDiff';
import { extractYoutubeVideoId, fetchYoutubeTranscript } from '../../lib/youtubeTranscript';
import {
  buildImagePath,
  deleteImage,
  isStorageImagePath,
  saveImage,
  saveImageFromUrl,
  useStoredImage,
} from '../../data/imageStore';
import { getErrorMessage } from '../../lib/errorMessage';
import { computeDifficulty, DIFFICULTY_LABEL, MANUAL_DIFFICULTY_REASON } from '../../lib/recipeDifficulty';
import { estimateCookMinutes } from '../../lib/recipeTime';
import {
  finishImageGenerationBatch,
  startImageGenerationBatch,
  updateImageGenerationProgress,
} from '../../data/imageGenerationStatus';

export function RecipeEditor({ recipeId, onDone }: { recipeId?: string; onDone: () => void }) {
  const { recipes, saveRecipe } = useRecipes();
  const { ingredients, saveIngredient } = useIngredients();
  const { categories, saveCategory } = useCategories();
  const { tags, saveTag } = useTags();
  const { settings } = useSettings();

  const existing = recipeId ? recipes.find((r) => r.id === recipeId) : undefined;
  // 이미지(조리 단계/완성 사진)를 Storage에 저장할 때 경로에 recipe_id가 필요한데, 새 레시피는
  // 원래 저장 시점에야 id가 생겼음 — 그러면 저장 전 초안 상태에서 이미지를 미리 생성/업로드할 수
  // 없으므로, 편집 화면에 들어오는 시점에 id를 미리 고정해둔다(기존 레시피는 그 id를 그대로 씀).
  const [stableRecipeId] = useState(() => existing?.id ?? makeId());
  const householdId = getCurrentHouseholdId();

  const [name, setName] = useState(existing?.name ?? '');
  const [servingsBase, setServingsBase] = useState(existing?.servingsBase ?? 2);
  const [tagIds, setTagIds] = useState<string[]>(existing?.tagIds ?? []);
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredient[]>(existing?.ingredients ?? []);
  const [steps, setSteps] = useState<RecipeStep[]>(existing?.steps ?? []);

  // 난이도/예상 조리시간은 규칙 기반으로 자동 계산되지만, 사용자가 직접 값을 바꾸면
  // 그 뒤로는(이 편집 세션 동안) 재료/조리순서가 바뀌어도 자동 계산이 덮어쓰지 않는다.
  // difficultyTouched의 초기값은 저장된 difficultyReason이 "사용자가 직접 설정함"인지로 판단 —
  // 예전에 수동으로 설정해둔 레시피를 다시 열었을 때도 그 설정을 존중하기 위함.
  const [difficulty, setDifficulty] = useState<Difficulty>(existing?.difficulty ?? 'easy');
  const [difficultyReason, setDifficultyReason] = useState(existing?.difficultyReason ?? '');
  const [difficultyTouched, setDifficultyTouched] = useState(
    existing?.difficultyReason === MANUAL_DIFFICULTY_REASON,
  );
  const [showDifficultyReason, setShowDifficultyReason] = useState(false);
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    existing?.estimatedMinutes ?? estimateCookMinutes(existing?.steps ?? []),
  );
  const [estimatedMinutesTouched, setEstimatedMinutesTouched] = useState(false);

  useEffect(() => {
    if (estimatedMinutesTouched) return;
    setEstimatedMinutes(estimateCookMinutes(steps));
  }, [steps, estimatedMinutesTouched]);

  useEffect(() => {
    if (difficultyTouched) return;
    const result = computeDifficulty({
      ingredientCount: recipeIngredients.length,
      cookMinutes: estimatedMinutes,
      stepCount: steps.length,
    });
    setDifficulty(result.difficulty);
    setDifficultyReason(result.reason);
  }, [recipeIngredients, steps, estimatedMinutes, difficultyTouched]);

  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeManualText, setYoutubeManualText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiMissingApiKey, setAiMissingApiKey] = useState(false);
  const [aiWarning, setAiWarning] = useState<string | null>(null);
  const [youtubeStage, setYoutubeStage] = useState<'idle' | 'extracting' | 'analyzing'>('idle');
  const [pendingYoutubeResult, setPendingYoutubeResult] = useState<ExtractedRecipe | null>(null);
  const [pendingYoutubeDiff, setPendingYoutubeDiff] = useState<DiffLine[]>([]);
  const [pendingYoutubeSource, setPendingYoutubeSource] = useState<'captions' | 'supadata'>('captions');
  const [pendingYoutubeLanguage, setPendingYoutubeLanguage] = useState('');
  const [applyingYoutube, setApplyingYoutube] = useState(false);
  const [pendingYoutubeVideoId, setPendingYoutubeVideoId] = useState<string | null>(null);
  const [useYoutubeThumbnail, setUseYoutubeThumbnail] = useState(true);

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

  async function resolveOrCreateTag(rawName: string, tagCache: Map<string, string>): Promise<string> {
    const trimmed = rawName.trim();
    const cached = tagCache.get(trimmed);
    if (cached) return cached;
    const id = makeId();
    await saveTag({ id, name: trimmed, type: 'style' });
    tagCache.set(trimmed, id);
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
    if (result.difficulty) {
      // AI가 판단한 난이도는 재료 개수 같은 단순 규칙보다 맥락(기술/도구 난이도)을 더 잘 반영하므로
      // 규칙 기반 자동 재계산(useEffect)이 곧바로 덮어쓰지 않도록 touched로 표시해서 존중한다.
      // 사용자가 "↻ 자동 판단으로 되돌리기"를 누르면 다시 규칙 기반 계산으로 전환 가능.
      setDifficulty(result.difficulty);
      setDifficultyReason(result.difficultyReason?.trim() || DIFFICULTY_LABEL[result.difficulty]);
      setDifficultyTouched(true);
    }
    // 새 재료/태그/카테고리는 DB에 실제로 만들어진 뒤에야 레시피 쪽에서 안전하게 참조할 수 있어서
    // (recipe_tags/재료 참조가 FK로 걸려있음) 순서대로 기다린다. 예전엔 Promise.all로 동시에
    // 처리했는데, 그 경우 "지금 폼에 없는 새 카테고리"를 두 재료가 동시에 필요로 하면 서로의
    // 생성 결과를 못 보고(둘 다 리액트 state 스냅샷 기준) 같은 이름의 카테고리를 중복 생성하는
    // 버그가 있었음 — 한 번에 하나씩 처리 + 배치 내에서 직접 채우는 캐시로 해결.
    const categoryCache = new Map(categories.map((c) => [c.name, c.id]));
    const ingredientCache = new Map(ingredients.map((i) => [i.name.trim(), i.id]));
    const newRecipeIngredients: RecipeIngredient[] = [];
    for (const item of result.ingredients) {
      const trimmedName = item.name.trim();
      let ingredientId = ingredientCache.get(trimmedName);
      if (!ingredientId) {
        ingredientId = await createIngredientFromAi(item.name, item.categoryName, categoryCache);
        ingredientCache.set(trimmedName, ingredientId);
      }
      newRecipeIngredients.push({ ingredientId, amount: item.amount, unit: item.unit });
    }
    setRecipeIngredients(newRecipeIngredients);

    if (result.tagNames && result.tagNames.length > 0) {
      const tagCache = new Map(tags.map((t) => [t.name, t.id]));
      const newTagIds: string[] = [];
      for (const tagName of result.tagNames) {
        newTagIds.push(await resolveOrCreateTag(tagName, tagCache));
      }
      setTagIds(newTagIds);
    }
    setAiWarning(result.warning ?? null);
    // 이미지 생성 여부는 더 이상 여기서(AI 반영 직후) 매번 묻지 않고, "저장" 시점에 이미지가
    // 하나도 없을 때만 한 번 물어본다(handleSave) — 반영할 때마다 + 저장할 때 또 물어보는 중복
    // 질문과 불필요한 생성 비용을 줄이기 위함.
  }

  const isGemini = settings.aiProvider === 'gemini';

  async function runYoutubeConversion() {
    if (!youtubeUrl.trim()) return;
    setAiLoading(true);
    setAiError(null);
    setAiMissingApiKey(false);
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
        // 키가 없거나 조회 실패해도 서버가 meta: null로 응답(선택 사항 — 자막만으로 계속 진행)
        const meta = await aiProxy.fetchYoutubeVideoMeta(youtubeUrl.trim()).catch(() => null);
        const combinedTranscript = [transcriptText, youtubeManualText.trim()].filter(Boolean).join('\n\n');
        result = await aiProxy.extractRecipeFromYoutubeMeta(
          settings.geminiModel,
          meta,
          combinedTranscript,
          existingContext,
        );
      } else {
        result = await aiProxy.extractRecipeFromTranscript(settings.model, transcriptText, existingContext);
      }
      setPendingYoutubeResult(result);
      setPendingYoutubeDiff(summarizeRecipeDiff(currentRecipeSnapshot, result));
      setPendingYoutubeSource(transcriptSource);
      setPendingYoutubeLanguage(transcriptLanguage);
      setPendingYoutubeVideoId(extractYoutubeVideoId(youtubeUrl.trim()));
      setUseYoutubeThumbnail(true);
    } catch (err) {
      if (err instanceof ApiProxyError && err.code === 'no_api_key') {
        setAiMissingApiKey(true);
      }
      setAiError(getErrorMessage(err, '유튜브 변환에 실패했습니다.'));
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
      if (useYoutubeThumbnail && pendingYoutubeVideoId && householdId) {
        try {
          const proxyUrl = `/api/youtube-thumbnail?videoId=${encodeURIComponent(pendingYoutubeVideoId)}`;
          const authHeaders = await aiProxy.getAuthHeader();
          const path = await saveImageFromUrl(proxyUrl, householdId, stableRecipeId, 'final', authHeaders);
          setFinalImageId(path);
        } catch (err) {
          // 완성 사진 저장 실패는 레시피 반영 자체를 막을 정도는 아니라 경고만 표시하고 계속 진행
          console.error('유튜브 썸네일 저장 실패:', err);
          setImageError(getErrorMessage(err, '유튜브 썸네일을 완성 사진으로 저장하지 못했습니다.'));
        }
      }
      setPendingYoutubeResult(null);
      setPendingYoutubeDiff([]);
      setPendingYoutubeVideoId(null);
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
    setPendingYoutubeVideoId(null);
  }

  async function createIngredientFromAi(
    rawName: string,
    categoryName: string | null | undefined,
    categoryCache: Map<string, string>,
  ): Promise<string> {
    const trimmed = rawName.trim();
    const id = makeId();
    const trimmedCategoryName = categoryName?.trim();
    let categoryId: string;
    if (trimmedCategoryName) {
      const cached = categoryCache.get(trimmedCategoryName);
      if (cached) {
        categoryId = cached;
      } else {
        categoryId = makeId();
        await saveCategory({ id: categoryId, name: trimmedCategoryName });
        categoryCache.set(trimmedCategoryName, categoryId);
      }
    } else {
      categoryId = categoryCache.get('기타') ?? categories.find((c) => c.name === '기타')?.id ?? categories[0]?.id ?? '';
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
  const [imageMissingApiKey, setImageMissingApiKey] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [finalImageId, setFinalImageId] = useState<string | undefined>(existing?.finalImageId);
  const [finalImageGenerating, setFinalImageGenerating] = useState(false);

  async function generateImageForStep(index: number) {
    if (!householdId) {
      setImageError('household 정보를 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.');
      return;
    }
    const step = steps[index];
    if (!step) return;
    setImageError(null);
    setImageMissingApiKey(false);
    setImageGeneratingIndex(index);
    try {
      const prompt = geminiClient.buildStepImagePrompt(name || '이름 없는 레시피', step);
      const dataUrl = await aiProxy.generateImage(settings.geminiImageModel, prompt);
      const imageId = isStorageImagePath(step.imageId) ? step.imageId : buildImagePath(householdId, stableRecipeId, 'step');
      await saveImage(imageId, dataUrl);
      updateStepRow(index, { imageId });
    } catch (err) {
      if (err instanceof ApiProxyError && err.code === 'no_api_key') {
        setImageMissingApiKey(true);
      }
      setImageError(getErrorMessage(err, '이미지 생성에 실패했습니다.'));
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

  function currentMainIngredientNames(): string[] {
    return recipeIngredients
      .map((row) => ingredients.find((i) => i.id === row.ingredientId)?.name)
      .filter((n): n is string => Boolean(n));
  }

  function currentTagNames(): string[] {
    return tagIds.map((id) => tags.find((t) => t.id === id)?.name).filter((n): n is string => Boolean(n));
  }

  /** 완성 사진을 생성해 저장하고 finalImageId를 갱신한다. 배치 생성/단일 버튼 양쪽에서 공유. */
  async function generateFinalImageInternal(recipeNameForPrompt: string): Promise<void> {
    if (!householdId) {
      throw new Error('household 정보가 없습니다.');
    }
    const prompt = geminiClient.buildFinalDishImagePrompt(
      recipeNameForPrompt || '이름 없는 레시피',
      currentMainIngredientNames(),
      currentTagNames(),
    );
    const dataUrl = await aiProxy.generateImage(settings.geminiImageModel, prompt);
    const path = isStorageImagePath(finalImageId) ? finalImageId : buildImagePath(householdId, stableRecipeId, 'final');
    await saveImage(path, dataUrl);
    setFinalImageId(path);
  }

  async function generateFinalImage() {
    if (!householdId) {
      setImageError('household 정보를 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.');
      return;
    }
    setImageError(null);
    setImageMissingApiKey(false);
    setFinalImageGenerating(true);
    try {
      await generateFinalImageInternal(name);
    } catch (err) {
      if (err instanceof ApiProxyError && err.code === 'no_api_key') {
        setImageMissingApiKey(true);
      }
      setImageError(getErrorMessage(err, '완성 사진 생성에 실패했습니다.'));
    } finally {
      setFinalImageGenerating(false);
    }
  }

  async function uploadFinalImage(file: File) {
    if (!householdId) {
      setImageError('household 정보를 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.');
      return;
    }
    setImageError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const path = isStorageImagePath(finalImageId) ? finalImageId : buildImagePath(householdId, stableRecipeId, 'final');
      await saveImage(path, dataUrl);
      setFinalImageId(path);
    } catch (err) {
      setImageError(err instanceof Error ? err.message : '사진 업로드에 실패했습니다.');
    }
  }

  async function removeFinalImage() {
    if (!finalImageId) return;
    await deleteImage(finalImageId).catch(() => {});
    setFinalImageId(undefined);
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
    if (!householdId) {
      setImageError('household 정보를 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.');
      return;
    }
    const step = steps[index];
    if (!step) return;
    setImageError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const imageId = isStorageImagePath(step.imageId) ? step.imageId : buildImagePath(householdId, stableRecipeId, 'step');
      await saveImage(imageId, dataUrl);
      updateStepRow(index, { imageId });
    } catch (err) {
      setImageError(err instanceof Error ? err.message : '사진 업로드에 실패했습니다.');
    }
  }

  // Google이 더 이상 모델별 고정 RPM/IPM 표를 공개하지 않고(계정/프로젝트별로 AI Studio
  // 콘솔에서만 확인 가능) gemini-3.1-flash-image는 무료 티어에 아예 없는 유료 전용 모델이라,
  // "검증된 여유"를 근거로 정할 수 없었음 — 7에서 10으로 소폭만 올려 대기 시간을 조금 줄이되
  // 과도한 동시 요청으로 인한 타임아웃/실패 증가는 피함(408도 재시도 대상이라 어느 정도는
  // 안전망이 있음). 계정의 AI Studio 콘솔에서 실제 한도를 확인하면 더 올릴 수 있는지 판단 가능.
  const BATCH_SIZE = 10;
  const BATCH_WARN_THRESHOLD = 7;

  /** 조리 단계 이미지(+ 선택적으로 완성 사진 1개)를 한 번에 생성한다. 진행률(batchProgress)은
   * 둘을 합친 총 개수 기준으로 표시된다. */
  async function runBatchImageGeneration(
    indexes: number[],
    stepsSource: { title: string; content: string; imageId?: string }[],
    recipeNameForPrompt: string,
    includeFinal: boolean,
  ) {
    if (!householdId) return;
    if (indexes.length === 0 && !includeFinal) return;
    setImageError(null);
    setImageMissingApiKey(false);
    const total = indexes.length + (includeFinal ? 1 : 0);
    setBatchProgress({ done: 0, total });
    // 로컬 state(batchProgress)뿐 아니라 전역 store에도 같이 기록 — 다른 탭으로 이동해서
    // 이 화면이 hidden 처리돼 있어도(App.tsx) App 상단 배너/완료 토스트로 진행 상황을 계속
    // 보여주기 위함. 생성 작업 자체(아래 for 루프)는 컴포넌트가 화면에서 안 보여도 계속
    // 진행된다 — React state 갱신이 언마운트 시에만 무시되는데, 탭 전환은 hidden일 뿐
    // 언마운트가 아니라서 batchProgress도 정상적으로 갱신됨.
    startImageGenerationBatch(recipeNameForPrompt, total);
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
            const dataUrl = await aiProxy.generateImage(settings.geminiImageModel, prompt);
            const imageId = isStorageImagePath(step.imageId) ? step.imageId : buildImagePath(householdId, stableRecipeId, 'step');
            await saveImage(imageId, dataUrl);
            updateStepRow(stepIndex, { imageId });
          } catch (err) {
            if (err instanceof ApiProxyError && err.code === 'no_api_key') {
              setImageMissingApiKey(true);
            }
            const message = getErrorMessage(err);
            console.error(`[이미지 생성 실패] 단계 ${stepIndex + 1} (${step.title}):`, message);
            failures.push(`${stepIndex + 1}단계: ${message}`);
          } finally {
            doneCount += 1;
            setBatchProgress({ done: doneCount, total });
            updateImageGenerationProgress(doneCount);
          }
        }),
      );
    }
    if (includeFinal) {
      try {
        await generateFinalImageInternal(recipeNameForPrompt);
      } catch (err) {
        if (err instanceof ApiProxyError && err.code === 'no_api_key') {
          setImageMissingApiKey(true);
        }
        const message = getErrorMessage(err);
        console.error('[완성 사진 생성 실패]', message);
        failures.push(`완성 사진: ${message}`);
      } finally {
        doneCount += 1;
        setBatchProgress({ done: doneCount, total });
        updateImageGenerationProgress(doneCount);
      }
    }
    setBatchProgress(null);
    finishImageGenerationBatch(failures.length);
    if (failures.length > 0) {
      setImageError(`${total}개 중 ${failures.length}개 이미지 생성에 실패했습니다.\n` + failures.join('\n'));
    }
  }

  function confirmAndRunBatchForCurrentSteps() {
    if (steps.length === 0 && !finalImageId) return;
    const existingStepCount = steps.filter((s) => s.imageId).length;
    const existingCount = existingStepCount + (finalImageId ? 1 : 0);
    let targetIndexes = steps.map((_, i) => i);
    let includeFinal = true;
    if (existingCount > 0) {
      const overwrite = confirm(
        `이미 이미지가 있는 항목이 ${existingCount}개 있어요(조리 단계 + 완성 사진 포함). ` +
          `기존 이미지도 다시 만들까요?\n(취소를 누르면 이미지가 없는 항목만 생성해요)`,
      );
      if (!overwrite) {
        targetIndexes = steps.map((_, i) => i).filter((i) => !steps[i].imageId);
        includeFinal = !finalImageId;
      }
    }
    const totalCount = targetIndexes.length + (includeFinal ? 1 : 0);
    if (totalCount === 0) {
      setImageError('생성할 이미지가 없습니다.');
      return;
    }
    const manyStepsNote =
      totalCount >= BATCH_WARN_THRESHOLD ? ` 항목이 많아(${totalCount}개) 시간이 좀 더 걸릴 수 있어요.` : '';
    const proceed = confirm(`${totalCount}개 이미지를 생성할까요? 시간이 조금 걸릴 수 있어요.${manyStepsNote}`);
    if (!proceed) return;
    runBatchImageGeneration(targetIndexes, steps, name || '이름 없는 레시피', includeFinal);
  }

  /** 이미지 생성 여부는 AI 반영/유튜브 반영 때마다 묻지 않고 "저장" 시점에 딱 한 번만 묻는다
   * (비용 절감) — 이미 이미지가 하나라도 있는 레시피(조리 단계든 완성 사진이든)를 다시 저장할
   * 때는 중복 생성을 막기 위해 아예 묻지 않는다. 생성을 진행하면 handleSave가 완료를 기다린
   * 뒤(await) 그 결과를 recipe 객체에 반영해서 저장한다. */
  function shouldOfferImageGenerationOnSave(): boolean {
    if (settings.aiProvider !== 'gemini') return false;
    if (steps.length === 0) return false;
    const hasAnyImage = Boolean(finalImageId) || steps.some((s) => s.imageId);
    return !hasAnyImage;
  }

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // handleSave는 이미지 생성을 기다린(await) 뒤 recipe 객체를 만드는데, 그 시점에 steps/
  // finalImageId를 그냥 읽으면 handleSave가 시작될 때의 오래된 클로저 값이라 방금 생성된
  // 이미지가 빠질 수 있다 — ref로 항상 최신 값을 읽는다.
  const stepsRef = useRef(steps);
  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);
  const finalImageIdRef = useRef(finalImageId);
  useEffect(() => {
    finalImageIdRef.current = finalImageId;
  }, [finalImageId]);
  const [visibility, setVisibility] = useState<RecipeVisibility>(existing?.visibility ?? 'household');

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      if (shouldOfferImageGenerationOnSave()) {
        const totalCount = steps.length + 1; // +1은 완성 사진
        const manyStepsNote =
          totalCount >= BATCH_WARN_THRESHOLD ? ` 항목이 많아(${totalCount}개) 시간이 좀 더 걸릴 수 있어요.` : '';
        const proceed = confirm(
          `AI로 조리 단계 이미지와 완성 사진을 생성할까요? 시간이 조금 걸릴 수 있어요.${manyStepsNote}`,
        );
        if (proceed) {
          await runBatchImageGeneration(
            steps.map((_, i) => i),
            steps,
            name || '이름 없는 레시피',
            true,
          );
        }
      }
      const recipe: Recipe = {
        id: stableRecipeId,
        name: name.trim() || '이름 없는 레시피',
        servingsBase: Math.max(1, servingsBase || 1),
        tagIds,
        ingredients: recipeIngredients,
        // 방금 이미지 생성을 기다렸다면 그 결과가 반영된 최신 값을 ref로 읽는다(위 주석 참고).
        steps: stepsRef.current,
        difficulty,
        difficultyReason,
        estimatedMinutes,
        finalImageId: finalImageIdRef.current,
        sourceRecipeId: existing?.sourceRecipeId,
        visibility,
      };
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
            {pendingYoutubeVideoId && (
              <div className="row" style={{ alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                <img
                  src={`https://img.youtube.com/vi/${pendingYoutubeVideoId}/hqdefault.jpg`}
                  alt="영상 썸네일 미리보기"
                  style={{ width: 96, aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 'var(--radius)' }}
                />
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={useYoutubeThumbnail}
                    onChange={(e) => setUseYoutubeThumbnail(e.target.checked)}
                  />
                  이 썸네일을 완성 사진으로 사용할까요? (반영하면 우리 Storage에 저장돼요. 원치 않으면
                  체크 해제 — 나중에 AI 생성/직접 업로드로 바꿀 수 있어요)
                </label>
              </div>
            )}
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

        {aiError && (
          <div style={{ marginTop: 8 }}>
            <p style={{ color: 'var(--danger)', marginBottom: aiMissingApiKey ? 6 : 0 }}>{aiError}</p>
            {aiMissingApiKey && (
              <button className="btn small" onClick={() => requestProfileSheet()}>
                설정으로 이동
              </button>
            )}
          </div>
        )}
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
          onChange={(e) => setServingsBase(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
        />
      </div>

      <div className="section-title">완성 사진 (선택)</div>
      <div className="field">
        <ImagePreview imageId={finalImageId} />
        <div className="chip-row" style={{ marginTop: 6 }}>
          {isGemini && (
            <button
              className="btn small"
              disabled={finalImageGenerating || batchProgress !== null}
              onClick={generateFinalImage}
            >
              {finalImageGenerating ? '생성 중...' : finalImageId ? '🎨 다시 생성' : '🎨 이미지 생성'}
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
                if (file) uploadFinalImage(file);
                e.target.value = '';
              }}
            />
          </label>
          {finalImageId && (
            <button className="btn small danger" onClick={removeFinalImage}>
              이미지 삭제
            </button>
          )}
        </div>
      </div>

      <div className="section-title">난이도 / 예상 조리시간</div>
      <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>난이도</label>
          <div className="row" style={{ gap: 6 }}>
            <select
              value={difficulty}
              onChange={(e) => {
                const value = e.target.value as Difficulty;
                setDifficulty(value);
                setDifficultyReason(MANUAL_DIFFICULTY_REASON);
                setDifficultyTouched(true);
              }}
              style={{ flex: 1 }}
            >
              {(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((value) => (
                <option key={value} value={value}>
                  {DIFFICULTY_LABEL[value]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="chip selectable"
              title={difficultyReason}
              onClick={() => setShowDifficultyReason((v) => !v)}
            >
              ⓘ
            </button>
          </div>
          {showDifficultyReason && (
            <p className="text-muted" style={{ marginTop: 4 }}>
              {difficultyReason}
            </p>
          )}
          {difficultyTouched && (
            <button className="btn small" style={{ marginTop: 6 }} onClick={() => setDifficultyTouched(false)}>
              ↻ 자동 판단으로 되돌리기
            </button>
          )}
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>예상 조리시간(분)</label>
          <input
            type="number"
            min={0}
            value={estimatedMinutes}
            onChange={(e) => {
              setEstimatedMinutes(Number(e.target.value) || 0);
              setEstimatedMinutesTouched(true);
            }}
          />
          {estimatedMinutesTouched && (
            <button
              className="btn small"
              style={{ marginTop: 6 }}
              onClick={() => setEstimatedMinutesTouched(false)}
            >
              ↻ 자동 계산으로 되돌리기
            </button>
          )}
        </div>
      </div>

      <div className="section-title">요리 스타일</div>
      <p className="text-muted" style={{ marginTop: -4, marginBottom: 6 }}>
        크림류, 국물요리처럼 맛이나 조리 방식의 특징을 나타내는 태그예요.
      </p>
      <div className="chip-row">
        {tags
          .filter((tag) => tag.type === 'style')
          .map((tag) => (
            <button
              key={tag.id}
              className={`chip selectable ${tagIds.includes(tag.id) ? 'active' : ''}`}
              onClick={() => toggleTag(tag.id)}
            >
              {tag.name}
            </button>
          ))}
      </div>

      {tags.some((tag) => tag.type === 'category') && (
        <>
          <div className="section-title">카테고리 태그</div>
          <p className="text-muted" style={{ marginTop: -4, marginBottom: 6 }}>
            레시피를 더 세부적으로 분류하는 태그예요.
          </p>
          <div className="chip-row">
            {tags
              .filter((tag) => tag.type === 'category')
              .map((tag) => (
                <button
                  key={tag.id}
                  className={`chip selectable ${tagIds.includes(tag.id) ? 'active' : ''}`}
                  onClick={() => toggleTag(tag.id)}
                >
                  {tag.name}
                </button>
              ))}
          </div>
        </>
      )}

      <div className="section-title">국가/장르 (선택)</div>
      <p className="text-muted" style={{ marginTop: -4, marginBottom: 6 }}>
        한식, 양식처럼 요리의 국가나 장르를 나타내는 태그예요.
      </p>
      <div className="chip-row">
        {tags
          .filter((tag) => tag.type === 'cuisine')
          .map((tag) => (
            <button
              key={tag.id}
              className={`chip selectable ${tagIds.includes(tag.id) ? 'active' : ''}`}
              onClick={() => toggleTag(tag.id)}
            >
              {tag.name}
            </button>
          ))}
      </div>
      {tags.filter((tag) => tag.type === 'cuisine').length === 0 && (
        <p className="text-muted">태그 관리에서 국가/장르 태그를 추가할 수 있어요(예: 한식, 양식).</p>
      )}

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
            onChange={(e) => updateIngredientRow(index, { amount: Math.max(0, Number(e.target.value) || 0) })}
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
                  const minutes = Math.max(0, Math.floor(Number(e.target.value) || 0));
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
                  const seconds = Math.min(59, Math.max(0, Math.floor(Number(e.target.value) || 0)));
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
            <ImagePreview imageId={step.imageId} />
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
        <div>
          <p style={{ color: 'var(--danger)', whiteSpace: 'pre-wrap', marginBottom: imageMissingApiKey ? 6 : 0 }}>
            {imageError}
          </p>
          {imageMissingApiKey && (
            <button className="btn small" onClick={() => requestProfileSheet()}>
              설정으로 이동
            </button>
          )}
        </div>
      )}
      <button className="btn small" onClick={addStepRow}>
        + 조리 단계 추가
      </button>

      <div className="section-title">공개 범위</div>
      <div className="card">
        <div className="field" style={{ marginBottom: 0 }}>
          <select value={visibility} onChange={(e) => setVisibility(e.target.value as RecipeVisibility)}>
            <option value="private">🔒 개인 소유 — 나만 볼 수 있어요</option>
            <option value="household">🏠 가구 공유 — 우리 가구원까지 볼 수 있어요 (기본)</option>
            <option value="public">🌍 전체 공개 — 다른 가구도 "둘러보기"에서 볼 수 있어요</option>
          </select>
        </div>
        {visibility === 'public' && (
          <p className="text-muted" style={{ marginTop: 8 }}>
            ⚠️ 이 레시피를 다른 가구 사용자도 "둘러보기" 화면에서 볼 수 있게 됩니다(재료·조리순서·이미지 포함).
          </p>
        )}
      </div>

      {saveError && <p style={{ color: 'var(--danger)' }}>{saveError}</p>}
      {/* 처음 쓰는 사람이 저장 버튼을 못 찾는다는 피드백 — 스크롤 위치와 무관하게 항상 보이도록
          화면 하단에 고정(position: sticky). 일반 문서 흐름에서 자기 자리를 그대로 차지하다가
          화면 아래로 나가려 할 때만 붙기 때문에 다른 내용을 가리지 않는다. */}
      <div
        className="row"
        style={{
          marginTop: 20,
          position: 'sticky',
          bottom: 0,
          background: 'var(--bg-page)',
          padding: '10px 0',
          borderTop: '1px solid var(--border)',
        }}
      >
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

function ImagePreview({ imageId }: { imageId?: string }) {
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
        <img src={dataUrl} alt="레시피 이미지" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span className="text-muted">불러오는 중...</span>
      )}
    </div>
  );
}
