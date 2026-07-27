import { useState } from 'react';
import { useTags, makeId } from '../../data/store';
import type { TagType } from '../../data/types';

export function TagManager({ onClose }: { onClose: () => void }) {
  const { tags, saveTag, deleteTag } = useTags();
  const [name, setName] = useState('');
  const [type, setType] = useState<TagType>('style');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  function addTag() {
    const trimmed = name.trim();
    if (!trimmed) return;
    saveTag({ id: makeId(), name: trimmed, type });
    setName('');
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>태그 관리</h2>

        <div className="section-title">스타일 태그</div>
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
              onDelete={() => deleteTag(tag.id)}
            />
          ))}

        <div className="section-title">카테고리 태그</div>
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
              onDelete={() => deleteTag(tag.id)}
            />
          ))}

        <div className="section-title">국가/스타일 태그 (한식·양식 등)</div>
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
              onDelete={() => deleteTag(tag.id)}
            />
          ))}

        <div className="section-title">새 태그 추가</div>
        <div className="field">
          <div className="row">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="태그 이름" />
            <select value={type} onChange={(e) => setType(e.target.value as TagType)}>
              <option value="style">스타일</option>
              <option value="category">카테고리</option>
              <option value="cuisine">국가/스타일</option>
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
