import { useState } from 'react';
import { useCategories, makeId } from '../../data/store';

export function CategoryManager({ onClose }: { onClose: () => void }) {
  const { categories, saveCategory, deleteCategory } = useCategories();
  const [name, setName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  function addCategory() {
    const trimmed = name.trim();
    if (!trimmed) return;
    saveCategory({ id: makeId(), name: trimmed });
    setName('');
  }

  function handleDelete(id: string) {
    if (confirm('이 카테고리를 삭제할까요? 이 카테고리를 쓰던 재료는 그대로 남지만 분류가 사라집니다.')) {
      deleteCategory(id);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>카테고리 관리</h2>

        {categories.map((category) =>
          renamingId === category.id ? (
            <div className="row" key={category.id} style={{ marginBottom: 8 }}>
              <input
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    saveCategory({ ...category, name: renameDraft.trim() || category.name });
                    setRenamingId(null);
                  }
                }}
                autoFocus
              />
              <button
                className="btn small primary"
                onClick={() => {
                  saveCategory({ ...category, name: renameDraft.trim() || category.name });
                  setRenamingId(null);
                }}
              >
                확인
              </button>
            </div>
          ) : (
            <div className="row" key={category.id} style={{ marginBottom: 8 }}>
              <span>{category.name}</span>
              <div className="chip-row" style={{ marginTop: 0 }}>
                <button
                  className="chip selectable"
                  onClick={() => {
                    setRenamingId(category.id);
                    setRenameDraft(category.name);
                  }}
                >
                  이름변경
                </button>
                <button className="chip selectable" onClick={() => handleDelete(category.id)}>
                  삭제
                </button>
              </div>
            </div>
          ),
        )}

        <div className="section-title">새 카테고리 추가</div>
        <div className="row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 냉동식품"
            onKeyDown={(e) => e.key === 'Enter' && addCategory()}
          />
          <button className="btn small" onClick={addCategory}>
            추가
          </button>
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
