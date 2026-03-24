import { Router } from 'express';
import { hybridSearch, getAllTags } from '../services/search.js';
import { generateAnswer } from '../services/llm.js';

const router = Router();

/**
 * POST /api/query
 * Accept query text + optional tag filters, run hybrid search, generate LLM answer
 */
router.post('/', async (req, res) => {
  try {
    const { query, tags = [], topK = 5 } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({ error: 'Query text is required' });
    }

    // Run hybrid search
    const sections = await hybridSearch(query.trim(), tags, topK);

    // Generate answer
    const { answer, model } = await generateAnswer(query.trim(), sections);

    res.json({
      query: query.trim(),
      answer,
      model,
      sources: sections.map(s => ({
        doc_title: s.doc_title,
        section_title: s.section_title,
        section_text: s.section_text.substring(0, 300) + (s.section_text.length > 300 ? '...' : ''),
        tags: s.tags,
        source_type: s.source_type,
        url: s.url,
        score: Math.round(s.score * 1000) / 1000
      })),
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('Query error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/query/tags
 * Get all available tags for filter UI
 */
router.get('/tags', (req, res) => {
  const tags = getAllTags();
  res.json(tags);
});

export default router;
