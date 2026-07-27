import {
  getCategoriesSnapshot,
  getIngredientsSnapshot,
  getRecipesSnapshot,
  getTagsSnapshot,
  replaceAllCategories,
  replaceAllIngredients,
  replaceAllRecipes,
  replaceAllTags,
} from './store';
import type { BackupSnapshot, PantryStatus } from './types';

export function buildBackupSnapshot(): BackupSnapshot {
  const ingredients = getIngredientsSnapshot();
  // pantryStatus는 이제 별도 저장소가 아니라 Ingredient.owned에서 파생됨 —
  // 백업 파일 포맷(BackupSnapshot)은 그대로 유지하기 위해 여기서 다시 map으로 풀어낸다.
  const pantryStatus: PantryStatus = Object.fromEntries(
    ingredients.map((ingredient) => [ingredient.id, ingredient.owned]),
  );
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    recipes: getRecipesSnapshot(),
    ingredients,
    tags: getTagsSnapshot(),
    categories: getCategoriesSnapshot(),
    pantryStatus,
  };
}

export function downloadBackup(): void {
  const snapshot = buildBackupSnapshot();
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const date = snapshot.exportedAt.slice(0, 10);
  link.href = url;
  link.download = `cookkit-backup-${date}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function isValidSnapshot(value: unknown): value is BackupSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<BackupSnapshot>;
  return (
    Array.isArray(snapshot.recipes) &&
    Array.isArray(snapshot.ingredients) &&
    Array.isArray(snapshot.tags) &&
    Array.isArray(snapshot.categories) &&
    typeof snapshot.pantryStatus === 'object' &&
    snapshot.pantryStatus !== null
  );
}

export async function restoreBackupFromFile(file: File): Promise<void> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!isValidSnapshot(parsed)) {
    throw new Error('올바른 CookKit 백업 파일 형식이 아닙니다.');
  }
  // pantryStatus 맵을 다시 각 재료의 owned 필드로 접어넣는다(현재 데이터 모델에 맞춤).
  const ingredientsWithOwned = parsed.ingredients.map((ingredient) => ({
    ...ingredient,
    owned: parsed.pantryStatus[ingredient.id] ?? false,
  }));
  await replaceAllIngredients(ingredientsWithOwned);
  await replaceAllRecipes(parsed.recipes);
  await replaceAllTags(parsed.tags);
  await replaceAllCategories(parsed.categories);
}
