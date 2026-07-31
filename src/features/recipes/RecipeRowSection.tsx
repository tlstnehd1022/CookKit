import { RecipeCard, RecipeListItem } from './RecipesPage';
import { useRecipeViewMode } from '../../data/viewMode';
import type { Recipe, TagType } from '../../data/types';

// 한 행에 렌더링하는 카드 개수 상한 — 레시피가 많아져도(공공데이터 시드 200개 등) 첫 화면
// 렌더링 부담이 커지지 않도록 제한한다. "더보기"로 들어가면 전체가 다 보인다.
const ROW_CARD_LIMIT = 18;

// 태그별 행이 너무 많아지지 않도록(가구마다 태그를 자유롭게 늘릴 수 있어서) 레시피 개수가
// 많은 태그부터 상위 N개만 행으로 노출한다. 나머지는 검색/필터로 여전히 찾을 수 있다.
export const TAG_ROW_LIMIT = 8;

/**
 * 넷플릭스/왓챠 스타일 가로 스크롤 행 하나에 필요한 최소 정보로 정규화한 카드 아이템.
 * "내 레시피"(Recipe.tagIds 기반)와 "둘러보기"(다른 household의 PublicRecipeEntry, tagNames
 * 문자열 기반)는 원본 데이터 구조가 달라서, 각 화면이 자기 데이터를 이 공통 shape으로 미리
 * 변환해 넘기면 RecipeRowSection/RecipeCategoryDetailPage는 출처를 몰라도 그대로 재사용된다.
 */
export interface RecipeRowItem {
  id: string;
  recipe: Recipe;
  tagNames: string[];
  onClick: () => void;
  /** 둘러보기 화면 또는 다른 가구원이 만든 레시피일 때 "OO님의 레시피" 표시용(선택) */
  ownerLabel?: string;
  ownerAvatarUrl?: string;
  /** "이미 있음" 같은 코너 배지(선택) */
  cornerBadge?: string;
  /** 좋아요 수(조회 전용, 선택) */
  likeCount?: number;
}

/** 태그 이름별로 아이템을 그룹핑한다 — 레시피가 하나도 없는 태그는 결과에 아예 포함되지 않는다. */
export function groupRowItemsByTagName(items: RecipeRowItem[]): Map<string, RecipeRowItem[]> {
  const map = new Map<string, RecipeRowItem[]>();
  for (const item of items) {
    for (const name of item.tagNames) {
      const list = map.get(name);
      if (list) list.push(item);
      else map.set(name, [item]);
    }
  }
  return map;
}

export interface TagRow {
  title: string;
  items: RecipeRowItem[];
}

/**
 * 그룹핑된 태그별 아이템을 cuisine/style(그 외 전부) 두 축으로 나누고, 각각 레시피 개수가
 * 많은 순으로 정렬해 상위 TAG_ROW_LIMIT개만 남긴다. tagTypeByName은 항상 "내 household"의
 * 태그 목록에서 만든다 — 둘러보기 화면도 cuisine 태그 이름(한식/양식 등)은 household마다
 * 기본 시드로 동일하게 깔려있어(0005 마이그레이션) 이 방식으로 충분히 분류된다. 내 household에
 * 없는 낯선 태그 이름은 style로 취급한다(cuisine 이름 집합은 원래 작고 흔한 이름들이라 안전).
 */
export function splitTagRows(
  grouped: Map<string, RecipeRowItem[]>,
  tagTypeByName: Map<string, TagType>,
): { cuisineRows: TagRow[]; styleRows: TagRow[] } {
  const cuisineRows: TagRow[] = [];
  const styleRows: TagRow[] = [];
  for (const [name, items] of grouped) {
    const row: TagRow = { title: name, items };
    if (tagTypeByName.get(name) === 'cuisine') cuisineRows.push(row);
    else styleRows.push(row);
  }
  cuisineRows.sort((a, b) => b.items.length - a.items.length);
  styleRows.sort((a, b) => b.items.length - a.items.length);
  return { cuisineRows: cuisineRows.slice(0, TAG_ROW_LIMIT), styleRows: styleRows.slice(0, TAG_ROW_LIMIT) };
}

export function RecipeRowSection({ title, items, onMore }: { title: string; items: RecipeRowItem[]; onMore: () => void }) {
  if (items.length === 0) return null;
  const visible = items.slice(0, ROW_CARD_LIMIT);

  return (
    <div className="recipe-row-section">
      <div className="section-title" style={{ marginBottom: 0 }}>
        {title}
      </div>
      <div className="recipe-row-scroll">
        {visible.map((item) => (
          <RecipeCard
            key={item.id}
            recipe={item.recipe}
            tagNames={item.tagNames}
            onClick={item.onClick}
            ownerLabel={item.ownerLabel}
            ownerAvatarUrl={item.ownerAvatarUrl}
            cornerBadge={item.cornerBadge}
            likeCount={item.likeCount}
            size="row"
          />
        ))}
        <button className="recipe-row-more-card" onClick={onMore}>
          <span>더보기</span>
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}

/**
 * 행에서 "더보기"를 눌렀을 때 이동하는 카테고리 전체 목록 화면 — 기존 그리드/리스트 뷰(및 그
 * 토글)를 그대로 재사용한다. "내 레시피"/"둘러보기" 어느 쪽에서 왔는지는 items가 이미
 * RecipeRowItem으로 정규화돼 있어서 이 컴포넌트는 신경 쓰지 않는다.
 */
export function RecipeCategoryDetailPage({
  title,
  items,
  onBack,
}: {
  title: string;
  items: RecipeRowItem[];
  onBack: () => void;
}) {
  const { mode: viewMode, setMode: setViewMode } = useRecipeViewMode();

  return (
    <div>
      <div className="row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <button className="btn small" onClick={onBack}>
            ← 뒤로
          </button>
          <h1 style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h1>
        </div>
        <button
          className="btn small"
          onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
          title={viewMode === 'grid' ? '리스트로 보기' : '그리드로 보기'}
        >
          {viewMode === 'grid' ? '☰' : '▦'}
        </button>
      </div>
      <div className="section-title">{items.length}개</div>

      {items.length === 0 && <div className="empty-hint">이 카테고리에는 레시피가 없어요.</div>}

      {viewMode === 'grid' ? (
        <div className="recipe-grid">
          {items.map((item) => (
            <RecipeCard
              key={item.id}
              recipe={item.recipe}
              tagNames={item.tagNames}
              onClick={item.onClick}
              ownerLabel={item.ownerLabel}
              ownerAvatarUrl={item.ownerAvatarUrl}
              cornerBadge={item.cornerBadge}
              likeCount={item.likeCount}
            />
          ))}
        </div>
      ) : (
        <div className="recipe-list">
          {items.map((item) => (
            <RecipeListItem
              key={item.id}
              recipe={item.recipe}
              tagNames={item.tagNames}
              onClick={item.onClick}
              ownerLabel={item.ownerLabel}
              cornerBadge={item.cornerBadge}
              likeCount={item.likeCount}
            />
          ))}
        </div>
      )}
    </div>
  );
}
