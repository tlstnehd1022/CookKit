// .in() 쿼리에 넘기는 id 배열이 너무 길면 URL 길이 제한에 걸릴 수 있어 청크로 나눈다
// (cookingLog.ts/publicRecipes.ts/recipeLikes.ts가 공유하는 헬퍼).
export const IN_QUERY_CHUNK_SIZE = 150;

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}
