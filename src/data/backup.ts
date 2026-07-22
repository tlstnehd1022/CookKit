import { categoriesRepo, ingredientsRepo, pantryRepo, recipesRepo, tagsRepo } from './repos';
import {
  replaceAllCategories,
  replaceAllIngredients,
  replaceAllRecipes,
  replaceAllTags,
  replacePantryStatus,
} from './store';
import type { BackupSnapshot } from './types';

export function buildBackupSnapshot(): BackupSnapshot {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    recipes: recipesRepo.getAll(),
    ingredients: ingredientsRepo.getAll(),
    tags: tagsRepo.getAll(),
    categories: categoriesRepo.getAll(),
    pantryStatus: pantryRepo.get(),
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
  replaceAllIngredients(parsed.ingredients);
  replaceAllRecipes(parsed.recipes);
  replaceAllTags(parsed.tags);
  replaceAllCategories(parsed.categories);
  replacePantryStatus(parsed.pantryStatus);
}
