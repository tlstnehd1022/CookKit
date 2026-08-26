import { useEffect, useState } from 'react';
import { useSession } from '../../data/session';
import { useProfile } from '../../data/profile';
import { getCurrentHouseholdId } from '../../data/store';
import {
  addRecipeComment,
  deleteRecipeComment,
  fetchRecipeComments,
  RECIPE_COMMENT_MAX_LENGTH,
  updateRecipeComment,
  type RecipeComment,
} from '../../data/recipeComments';
import { createRecipeCommentedNotification, deleteRecipeCommentedNotification } from '../../data/notifications';
import { getErrorMessage } from '../../lib/errorMessage';
import { useConfirmDialog } from './ConfirmDialog';

function formatCommentTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
}

/** 레시피 상세(내 household 것 + 둘러보기 공개 레시피 둘 다)에서 재사용하는 댓글 섹션 — 좋아요
 * 하트 근처에 개수를 보여주고 탭하면 목록이 펼쳐진다. 레시피 소유자는 본인 레시피에 달린
 * 아무 댓글이나 삭제할 수 있다(완전한 신고 시스템 대신 최소한의 콘텐츠 보호 수단). */
export function RecipeCommentsSection({
  recipeId,
  recipeOwnerUserId,
}: {
  recipeId: string;
  recipeOwnerUserId: string;
}) {
  const { user } = useSession();
  const { profile } = useProfile();
  const householdId = getCurrentHouseholdId();
  const { confirmAsync, dialog } = useConfirmDialog();

  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState<RecipeComment[]>([]);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const isOwner = user?.id === recipeOwnerUserId;

  useEffect(() => {
    let cancelled = false;
    fetchRecipeComments(recipeId, householdId)
      .then((result) => {
        if (!cancelled) setComments(result);
      })
      .catch((err) => console.error('댓글 조회 실패:', getErrorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [recipeId, householdId]);

  async function handlePost() {
    if (!user) return;
    const trimmed = draft.trim();
    if (!trimmed || posting) return;
    setPosting(true);
    setError(null);
    try {
      const { id, createdAt } = await addRecipeComment(recipeId, user.id, trimmed);
      setComments((prev) => [
        ...prev,
        {
          id,
          recipeId,
          userId: user.id,
          content: trimmed,
          createdAt,
          updatedAt: null,
          authorName: profile?.displayName || '나',
          authorAvatarUrl: profile?.avatarUrl ?? undefined,
        },
      ]);
      setDraft('');
      createRecipeCommentedNotification(recipeId, id, trimmed).catch((err) =>
        console.error('댓글 알림 생성 실패:', getErrorMessage(err)),
      );
    } catch (err) {
      console.error('댓글 작성 실패:', getErrorMessage(err));
      setError(getErrorMessage(err, '댓글을 남기지 못했어요.'));
    } finally {
      setPosting(false);
    }
  }

  async function handleSaveEdit(commentId: string) {
    const trimmed = editDraft.trim();
    if (!trimmed) return;
    try {
      const { updatedAt } = await updateRecipeComment(commentId, trimmed);
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? { ...c, content: trimmed, updatedAt } : c)),
      );
      setEditingId(null);
    } catch (err) {
      console.error('댓글 수정 실패:', getErrorMessage(err));
      alert(getErrorMessage(err, '댓글을 수정하지 못했어요.'));
    }
  }

  async function handleDelete(comment: RecipeComment) {
    if (!(await confirmAsync('댓글을 삭제할까요?'))) return;
    try {
      await deleteRecipeComment(comment.id);
      setComments((prev) => prev.filter((c) => c.id !== comment.id));
      deleteRecipeCommentedNotification(comment.id).catch((err) =>
        console.error('댓글 알림 삭제 실패:', getErrorMessage(err)),
      );
    } catch (err) {
      console.error('댓글 삭제 실패:', getErrorMessage(err));
      alert(getErrorMessage(err, '댓글을 삭제하지 못했어요.'));
    }
  }

  return (
    <div>
      <button
        type="button"
        className="btn small"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        💬 {comments.length > 0 ? `댓글 ${comments.length}` : '댓글 남기기'}
      </button>

      {expanded && (
        <div className="card" style={{ marginTop: 8 }}>
          {comments.length === 0 && <p className="empty-hint">아직 댓글이 없어요. 첫 댓글을 남겨보세요!</p>}
          {comments.map((comment) => {
            const canDelete = comment.userId === user?.id || isOwner;
            const canEdit = comment.userId === user?.id;
            return (
              <div key={comment.id} style={{ marginBottom: 12 }}>
                <div className="row" style={{ alignItems: 'flex-start', gap: 8 }}>
                  {comment.authorAvatarUrl ? (
                    <img
                      src={comment.authorAvatarUrl}
                      alt=""
                      style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: 'var(--chip-bg)',
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row" style={{ gap: 6 }}>
                      <strong style={{ fontSize: 13.5 }}>
                        {comment.authorName}
                        {comment.authorHouseholdName && (
                          <span className="text-muted" style={{ fontWeight: 400 }}>
                            {' '}
                            ({comment.authorHouseholdName})
                          </span>
                        )}
                      </strong>
                      <span className="text-muted" style={{ fontSize: 11 }}>
                        {formatCommentTime(comment.createdAt)}
                        {comment.updatedAt && ' (수정됨)'}
                      </span>
                    </div>
                    {editingId === comment.id ? (
                      <div style={{ marginTop: 4 }}>
                        <div className="field" style={{ marginBottom: 4 }}>
                          <textarea
                            value={editDraft}
                            maxLength={RECIPE_COMMENT_MAX_LENGTH}
                            onChange={(e) => setEditDraft(e.target.value)}
                            rows={2}
                          />
                        </div>
                        <div className="row" style={{ gap: 6, marginTop: 4 }}>
                          <button className="btn small" onClick={() => setEditingId(null)}>
                            취소
                          </button>
                          <button className="btn small primary" onClick={() => handleSaveEdit(comment.id)}>
                            저장
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p style={{ margin: '4px 0 0', fontSize: 14, whiteSpace: 'pre-wrap' }}>{comment.content}</p>
                    )}
                    {editingId !== comment.id && (canEdit || canDelete) && (
                      <div className="row" style={{ gap: 10, marginTop: 4 }}>
                        {canEdit && (
                          <button
                            type="button"
                            className="text-muted"
                            style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, cursor: 'pointer' }}
                            onClick={() => {
                              setEditingId(comment.id);
                              setEditDraft(comment.content);
                            }}
                          >
                            수정
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              fontSize: 12,
                              color: 'var(--danger)',
                              cursor: 'pointer',
                            }}
                            onClick={() => handleDelete(comment)}
                          >
                            삭제
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {user && (
            <div style={{ marginTop: comments.length > 0 ? 8 : 0 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <textarea
                  value={draft}
                  maxLength={RECIPE_COMMENT_MAX_LENGTH}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="댓글을 남겨보세요"
                  rows={2}
                />
              </div>
              <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
                <span className="text-muted" style={{ fontSize: 11 }}>
                  {draft.length}/{RECIPE_COMMENT_MAX_LENGTH}
                </span>
                <button className="btn small primary" onClick={handlePost} disabled={posting || !draft.trim()}>
                  {posting ? '작성 중...' : '작성'}
                </button>
              </div>
              {error && (
                <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{error}</p>
              )}
            </div>
          )}
        </div>
      )}
      {dialog}
    </div>
  );
}
