import db from '../db.js';
import { generateEmbedding } from './embeddings.js';

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10);
}

function keywordScore(query, text) {
  const queryTokens = query.toLowerCase().split(/\W+/).filter(t => t.length > 2);
  const textLower = text.toLowerCase();
  let score = 0;
  let matchedTerms = 0;

  for (const token of queryTokens) {
    const regex = new RegExp(`\\b${token}`, 'gi');
    const matches = textLower.match(regex);
    if (matches) {
      score += Math.log(1 + matches.length);
      matchedTerms++;
    }
  }

  if (queryTokens.length > 0) {
    score *= (1 + matchedTerms / queryTokens.length);
  }

  return score;
}

/**
 * Hybrid search with proper tag and city filtering
 * @param {string} queryText
 * @param {string[]} tagFilters - Tags to filter by (ALL selected tags must match)
 * @param {string} cityFilter - City to filter by (empty = all cities)
 * @param {number} topK
 */
export async function hybridSearch(queryText, tagFilters = [], cityFilter = '', topK = 5) {
  let sections = db.prepare(`
    SELECT section_id, doc_id, section_title, section_text, tags, city, source_type, url, embedding, last_updated
    FROM sections
    WHERE superseded = 0
  `).all();

  // Apply city filter: show city-specific + "all" (global) sections
  if (cityFilter && cityFilter !== 'all') {
    sections = sections.filter(s => {
      return s.city === cityFilter || s.city === 'all';
    });
  }

  // Apply tag filter: section must contain ALL selected tags
  if (tagFilters.length > 0) {
    sections = sections.filter(s => {
      const sectionTags = JSON.parse(s.tags || '[]');
      return tagFilters.every(filterTag => sectionTags.includes(filterTag));
    });
  }

  if (sections.length === 0) return [];

  // Get doc titles
  const docTitles = {};
  const docs = db.prepare('SELECT doc_id, doc_title FROM documents').all();
  for (const d of docs) docTitles[d.doc_id] = d.doc_title;

  // Semantic search
  const queryEmbedding = await generateEmbedding(queryText);

  const scored = sections.map(section => {
    let semanticScore = 0;
    if (queryEmbedding && section.embedding) {
      try {
        const sectionEmb = JSON.parse(section.embedding);
        semanticScore = cosineSimilarity(queryEmbedding, sectionEmb);
      } catch { /* ignore */ }
    }

    const kwScoreText = keywordScore(queryText, section.section_text);
    const kwScoreTitle = keywordScore(queryText, section.section_title) * 2.0;
    const kwTotal = kwScoreText + kwScoreTitle;

    // Normalize keyword score
    const kwNorm = Math.min(kwTotal / 5, 1);

    // Combined score
    const combined = queryEmbedding
      ? (0.7 * semanticScore + 0.3 * kwNorm)
      : kwNorm;

    return {
      section_id: section.section_id,
      doc_id: section.doc_id,
      doc_title: docTitles[section.doc_id] || 'Unknown',
      section_title: section.section_title,
      section_text: section.section_text,
      tags: JSON.parse(section.tags || '[]'),
      city: section.city,
      source_type: section.source_type,
      url: section.url,
      last_updated: section.last_updated,
      score: combined,
      semantic_score: semanticScore,
      keyword_score: kwNorm
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/** Get all unique tags */
export function getAllTags() {
  const sections = db.prepare("SELECT tags FROM sections WHERE superseded = 0").all();
  const tagSet = new Set();
  for (const s of sections) {
    const tags = JSON.parse(s.tags || '[]');
    for (const t of tags) tagSet.add(t);
  }
  return Array.from(tagSet).sort();
}

/** Get all unique cities */
export function getAllCities() {
  const rows = db.prepare("SELECT DISTINCT city FROM sections WHERE superseded = 0 ORDER BY city").all();
  return rows.map(r => r.city).filter(c => c);
}
