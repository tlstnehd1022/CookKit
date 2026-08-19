import { useState } from 'react';
import { useTags, makeId } from '../../data/store';
import { useConfirmDialog } from './ConfirmDialog';
import type { Tag, TagType } from '../../data/types';

export function TagManager({ onClose }: { onClose: () => void }) {
  const { tags, saveTag, deleteTag } = useTags();
  const [name, setName] = useState('');
  const [type, setType] = useState<TagType>('style');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const { confirmAsync, dialog: confirmDialog } = useConfirmDialog();

  function addTag() {
    const trimmed = name.trim();
    if (!trimmed) return;
    saveTag({ id: makeId(), name: trimmed, type });
    setName('');
  }

  async function handleDeleteTag(tag: Tag) {
    if (await confirmAsync(`'${tag.name}' 태그를 삭제할까요? 이 태그를 쓰던 레시피에서는 태그가 사라져요.`, { confirmLabel: '삭제' })) {
      deleteTag(tag.id);
    }
  }

  return (
    <>
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>태그 관리</h2>

        <div className="section-title">요리 스타일</div>
        <p className="text-muted" style={{ marginTop: -4 }}>
          크림류, 국물요리처럼 맛이나 조리 방식의 특징을 나타내는 태그예요.
        </p>
        {tags
          .filter((tag) => tag.type === 'style')
          .map((tag) => (
            <TagRow
              key={tag.id}
              name={tag.name}
              isRenaming={renamingId === tag.id}
              renameDraft={renameDraft}
              onRenameDraftChange={setRenameDraft}
              onStartRename={() => {
                setRenamingId(tag.id);
                setRenameDraft(tag.name);
              }}
              onConfirmRename={() => {
                saveTag({ ...tag, name: renameDraft.trim() || tag.name });
                setRenamingId(null);
              }}
              onDelete={() => handleDeleteTag(tag)}
            />
          ))}

        <div className="section-title">카테고리 태그</div>
        <p className="text-muted" style={{ marginTop: -4 }}>레시피를 더 세부적으로 분류하는 태그예요.</p>
        {tags
          .filter((tag) => tag.type === 'category')
          .map((tag) => (
            <TagRow
              key={tag.id}
              name={tag.name}
              isRenaming={renamingId === tag.id}
              renameDraft={renameDraft}
              onRenameDraftChange={setRenameDraft}
              onStartRename={() => {
                setRenamingId(tag.id);
                setRenameDraft(tag.name);
              }}
              onConfirmRename={() => {
                saveTag({ ...tag, name: renameDraft.trim() || tag.name });
                setRenamingId(null);
              }}
              onDelete={() => handleDeleteTag(tag)}
            />
          ))}

        <div className="section-title">국가/장르 태그 (한식·양식 등)</div>
        <p className="text-muted" style={{ marginTop: -4 }}>
          한식, 양식처럼 요리의 국가나 장르를 나타내는 태그예요.
        </p>
        {tags
          .filter((tag) => tag.type === 'cuisine')
          .map((tag) => (
            <TagRow
              key={tag.id}
              name={tag.name}
              isRenaming={renamingId === tag.id}
              renameDraft={renameDraft}
              onRenameDraftChange={setRenameDraft}
              onStartRename={() => {
                setRenamingId(tag.id);
                setRenameDraft(tag.name);
              }}
              onConfirmRename={() => {
                saveTag({ ...tag, name: renameDraft.trim() || tag.name });
                setRenamingId(null);
              }}
              onDelete={() => handleDeleteTag(tag)}
            />
          ))}

        <div className="section-title">새 태그 추가</div>
        <div className="field">
          <div className="row">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="태그 이름" />
            <select value={type} onChange={(e) => setType(e.target.value as TagType)}>
              <option value="style">스타일</option>
              <option value="category">카테고리</option>
              <option value="cuisine">국가/장르</option>
            </select>
            <button className="btn small" onClick={addTag}>
              추가
            </button>
          </div>
        </div>

        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn primary" onClick={onClose} style={{ width: '100%' }}>
            닫기
          </button>
        </div>
      </div>
    </div>
      {confirmDialog}
    </>
  );
}

function TagRow({
  name,
  isRenaming,
  renameDraft,
  onRenameDraftChange,
  onStartRename,
  onConfirmRename,
  onDelete,
}: {
  name: string;
  isRenaming: boolean;
  renameDraft: string;
  onRenameDraftChange: (value: string) => void;
  onStartRename: () => void;
  onConfirmRename: () => void;
  onDelete: () => void;
}) {
  if (isRenaming) {
    return (
      <div className="row" style={{ marginBottom: 8 }}>
        <input
          value={renameDraft}
          onChange={(e) => onRenameDraftChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onConfirmRename()}
          autoFocus
        />
        <button className="btn small primary" onClick={onConfirmRename}>
          확인
        </button>
      </div>
    );
  }
  return (
    <div className="row" style={{ marginBottom: 8 }}>
      <span>{name}</span>
      <div className="chip-row" style={{ marginTop: 0 }}>
        <button className="chip selectable" onClick={onStartRename}>
          이름변경
        </button>
        <button className="chip selectable" onClick={onDelete}>
          삭제
        </button>
      </div>
    </div>
  );
}
