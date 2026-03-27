import { Router } from 'express';
import db from '../db.js';

const router = Router();

/**
 * POST /api/feedback
 */
router.post('/', (req, res) => {
  try {
    const { query, answer, sources, rating, comment } = req.body;

    if (!query || !rating) {
      return res.status(400).json({ error: 'Query and rating are required' });
    }

    if (!['helpful', 'not_helpful'].includes(rating)) {
      return res.status(400).json({ error: 'Rating must be "helpful" or "not_helpful"' });
    }

    db.prepare(`
      INSERT INTO feedback (query, answer, sources, rating, comment)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      query,
      answer || '',
      JSON.stringify(sources || []),
      rating,
      comment || null
    );

    res.json({ success: true, message: 'Feedback logged' });

  } catch (err) {
    console.error('Feedback error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/feedback
 * List feedback with optional format
 */
router.get('/', (req, res) => {
  const feedback = db.prepare(`
    SELECT * FROM feedback ORDER BY timestamp DESC LIMIT 200
  `).all();

  res.json(feedback);
});

/**
 * GET /api/feedback/stats
 * Summary statistics for feedback
 */
router.get('/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as count FROM feedback').get().count;
  const helpful = db.prepare("SELECT COUNT(*) as count FROM feedback WHERE rating = 'helpful'").get().count;
  const notHelpful = db.prepare("SELECT COUNT(*) as count FROM feedback WHERE rating = 'not_helpful'").get().count;
  const withComments = db.prepare("SELECT COUNT(*) as count FROM feedback WHERE comment IS NOT NULL AND comment != ''").get().count;

  // Most common unhelpful queries
  const unhelpfulQueries = db.prepare(`
    SELECT query, comment, timestamp FROM feedback
    WHERE rating = 'not_helpful'
    ORDER BY timestamp DESC
    LIMIT 10
  `).all();

  res.json({
    total,
    helpful,
    not_helpful: notHelpful,
    satisfaction_rate: total > 0 ? Math.round((helpful / total) * 100) : 0,
    with_comments: withComments,
    recent_unhelpful: unhelpfulQueries
  });
});

/**
 * GET /api/feedback/export
 * Export all feedback as CSV
 */
router.get('/export', (req, res) => {
  const feedback = db.prepare('SELECT * FROM feedback ORDER BY timestamp DESC').all();

  const csvHeader = 'ID,Timestamp,Rating,Query,Comment,Answer\n';
  const csvRows = feedback.map(f => {
    const clean = (s) => `"${(s || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`;
    return `${f.id},${clean(f.timestamp)},${clean(f.rating)},${clean(f.query)},${clean(f.comment)},${clean(f.answer)}`;
  }).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=feedback_export.csv');
  res.send(csvHeader + csvRows);
});

export default router;
