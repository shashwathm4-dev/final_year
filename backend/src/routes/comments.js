/**
 * Comments routes — Item 24.
 * GET  /api/comments/unread
 * GET  /api/comments/session/:sessionId
 * POST /api/comments/session/:sessionId
 * POST /api/comments/session/:sessionId/read
 */
const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const { getSessionAccess } = require('../services/access');
const { getSession } = require('../services/firestore');
const {
  addComment,
  getCommentsForSession,
  markSessionCommentsRead,
  getUnreadCounts,
} = require('../services/entities');

// Unread badge counts
router.get('/unread', requireAuth, async (req, res) => {
  try {
    const bySession = await getUnreadCounts(req.user.uid);
    const total = Object.values(bySession).reduce((a, b) => a + b, 0);
    res.json({ total, bySession, counts: bySession });
  } catch (err) {
    console.error('Error fetching unread counts:', err);
    res.status(500).json({ error: 'Failed to fetch unread counts' });
  }
});

// Get comments for a session
router.get('/session/:sessionId', requireAuth, async (req, res) => {
  try {
    const session = await getSession(req.params.sessionId);
    const access = await getSessionAccess(req.user, session);
    if (!access) return res.status(403).json({ error: 'Forbidden' });

    const comments = await getCommentsForSession(req.params.sessionId);
    res.json({ comments });
  } catch (err) {
    console.error('Error fetching comments:', err);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// Post a comment
router.post('/session/:sessionId', requireAuth, async (req, res) => {
  try {
    const session = await getSession(req.params.sessionId);
    const access = await getSessionAccess(req.user, session);
    if (!access) return res.status(403).json({ error: 'Forbidden' });

    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
    if (!text) return res.status(400).json({ error: 'Comment text is required' });

    const comment = await addComment(
      req.params.sessionId,
      req.user.uid,
      req.user.role,
      text
    );
    res.json({ comment });
  } catch (err) {
    console.error('Error posting comment:', err);
    res.status(500).json({ error: 'Failed to post comment' });
  }
});

// Mark all comments for a session as read
router.post('/session/:sessionId/read', requireAuth, async (req, res) => {
  try {
    const session = await getSession(req.params.sessionId);
    const access = await getSessionAccess(req.user, session);
    if (!access) return res.status(403).json({ error: 'Forbidden' });

    const marked = await markSessionCommentsRead(req.params.sessionId, req.user.uid);
    res.json({ marked });
  } catch (err) {
    console.error('Error marking comments read:', err);
    res.status(500).json({ error: 'Failed to mark comments read' });
  }
});

module.exports = router;
