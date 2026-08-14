import { useState } from 'react';
import { useStoredImage } from '../../data/imageStore';

export interface GalleryPhotoItem {
  id: string;
  imageId: string;
  cookedAt: string;
  /** 내 household 갤러리(4-1)는 만든 사람 이름, 둘러보기 갤러리(4-2)는 household 이름. */
  label: string | null;
}

function captionText(item: GalleryPhotoItem): string {
  const date = new Date(item.cookedAt).toLocaleDateString('ko-KR');
  return item.label ? `${date} · ${item.label}` : date;
}

function GalleryThumb({ item, onClick }: { item: GalleryPhotoItem; onClick: () => void }) {
  const url = useStoredImage(item.imageId);
  return (
    <button type="button" className="cooking-photo-thumb" onClick={onClick}>
      {url ? (
        <img src={url} alt="" className="cooking-photo-thumb-image" />
      ) : (
        <div className="cooking-photo-thumb-image cooking-photo-thumb-placeholder" />
      )}
      <span className="cooking-photo-thumb-caption">{captionText(item)}</span>
    </button>
  );
}

function PhotoLightbox({ item, onClose }: { item: GalleryPhotoItem; onClose: () => void }) {
  const url = useStoredImage(item.imageId);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet cooking-photo-lightbox" onClick={(e) => e.stopPropagation()}>
        {url && <img src={url} alt="" className="cooking-photo-lightbox-image" />}
        <p className="text-muted" style={{ margin: '8px 0 0' }}>
          {captionText(item)}
        </p>
      </div>
    </div>
  );
}

/** "우리집에서 만든 모습"(4-1)/"이 레시피를 요리해본 사람들"(4-2)이 공유하는 가로 스크롤
 * 갤러리 + 라이트박스. items가 비어있으면 아무것도 렌더링하지 않는다 — 4-2의 "사진이 하나도
 * 없으면 접기 버튼 자체를 숨김" 요구사항도 이 한 줄로 자동 충족된다.
 *
 * collapsible=true(4-2 전용)면 제목을 탭해야 펼쳐지는 버튼으로 바꾸고 기본 접힌 상태로
 * 시작한다 — 다른 household의 요리 기록을 다짜고짜 노출하지 않기 위한 선택적 노출(4-2 요구사항).
 * 4-1은 기본값(collapsible=false)대로 항상 펼쳐진 채로 보여준다. */
export function CookingLogPhotoGallery({
  title,
  items,
  collapsible,
}: {
  title: string;
  items: GalleryPhotoItem[];
  collapsible?: boolean;
}) {
  const [lightboxItem, setLightboxItem] = useState<GalleryPhotoItem | null>(null);
  const [expanded, setExpanded] = useState(!collapsible);

  if (items.length === 0) return null;

  return (
    <>
      {collapsible ? (
        <button
          type="button"
          className="section-title"
          style={{ background: 'none', border: 'none', padding: 0, width: '100%', textAlign: 'left', cursor: 'pointer' }}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? '▾' : '▸'} {title} ({items.length})
        </button>
      ) : (
        <div className="section-title">
          {title} ({items.length})
        </div>
      )}
      {expanded && (
        <div className="recipe-row-scroll">
          {items.map((item) => (
            <GalleryThumb key={item.id} item={item} onClick={() => setLightboxItem(item)} />
          ))}
        </div>
      )}
      {lightboxItem && <PhotoLightbox item={lightboxItem} onClose={() => setLightboxItem(null)} />}
    </>
  );
}
