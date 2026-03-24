import { Router } from 'express';
import db from '../db.js';

const router = Router();

/**
 * POST /api/feedback
 * Log feedback for an answer
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
 * Export feedback log
 */
router.get('/', (req, res) => {
  const feedback = db.prepare(`
    SELECT * FROM feedback ORDER BY timestamp DESC LIMIT 100
  `).all();

  res.json(feedback);
});

export default router;
