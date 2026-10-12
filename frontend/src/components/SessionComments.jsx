import { useEffect, useRef, useState } from 'react';
import { getSessionComments, postSessionComment, markCommentsRead } from '../services/api';

export default function SessionComments({ sessionId, myRole, onRead }) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);

  const load = async () => {
    try {
      const list = await getSessionComments(sessionId);
      setComments(list);
      markCommentsRead(sessionId).then(() => onRead?.(sessionId)).catch(() => {});
    } catch {
      setError('Could not load messages');
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // simple polling
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [comments.length]);

  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true); setError('');
    try {
      const c = await postSessionComment(sessionId, body);
      setComments((prev) => [...prev, c]);
      setText('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="comments-box">
      <div className="comments-list">
        {comments.length === 0 && <div className="empty-hint">No messages yet.</div>}
        {comments.map((c) => (
          <div key={c.id} className={`comment ${c.authorRole === myRole ? 'comment-mine' : 'comment-theirs'}`}>
            <div className="comment-meta">
              {c.authorRole === 'doctor' ? '🩺' : '👤'} {c.authorName || c.authorRole}
              {c.repNumber != null && ` · rep #${c.repNumber}`} · {new Date(c.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="comment-text">{c.text}</div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {error && <div className="adh-alert">{error}</div>}
      <form onSubmit={send} className="comment-form">
        <input
          type="text" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={myRole === 'doctor' ? 'Leave feedback on this session...' : 'Reply to your doctor...'}
        />
        <button type="submit" className="btn-add-patient" disabled={sending || !text.trim()}>Send</button>
      </form>
    </div>
  );
}
