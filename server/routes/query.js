import { Router } from 'express';
import { hybridSearch, getAllTags, getAllCities } from '../services/search.js';
import { generateAnswer } from '../services/llm.js';

const router = Router();

// Simple in-memory query cache (LRU-ish, max 50 entries)
const queryCache = new Map();
const CACHE_MAX = 50;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(query, tags, city) {
  return JSON.stringify({ q: query.toLowerCase().trim(), t: tags.sort(), c: city });
}

function getCached(key) {
  const entry = queryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.time > CACHE_TTL) {
    queryCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  if (queryCache.size >= CACHE_MAX) {
    // Delete oldest entry
    const oldest = queryCache.keys().next().value;
    queryCache.delete(oldest);
  }
  queryCache.set(key, { data, time: Date.now() });
}

/**
 * POST /api/query
 */
router.post('/', async (req, res) => {
  try {
    const { query, tags = [], city = '', topK = 5 } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({ error: 'Query text is required' });
    }

    const cleanQuery = query.trim();
    const cacheKey = getCacheKey(cleanQuery, tags, city);

    // Check cache first
    const cached = getCached(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true });
    }

    const startTime = Date.now();
    const sections = await hybridSearch(cleanQuery, tags, city, topK);
    const { answer, model } = await generateAnswer(cleanQuery, sections);
    const duration = Date.now() - startTime;

    const result = {
      query: cleanQuery,
      answer,
      model,
      duration_ms: duration,
      sources: sections.map(s => ({
        doc_title: s.doc_title,
        section_title: s.section_title,
        section_text: s.section_text.substring(0, 300) + (s.section_text.length > 300 ? '...' : ''),
        tags: s.tags,
        city: s.city,
        source_type: s.source_type,
        url: s.url,
        score: Math.round(s.score * 1000) / 1000
      })),
      timestamp: new Date().toISOString()
    };

    // Cache the result
    setCache(cacheKey, result);

    res.json(result);

  } catch (err) {
    console.error('Query error:', err);
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/query/tags */
router.get('/tags', (req, res) => {
  res.json(getAllTags());
});

/** GET /api/query/cities */
router.get('/cities', (req, res) => {
  res.json(getAllCities());
});

export default router;
