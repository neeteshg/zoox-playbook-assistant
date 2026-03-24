import db from '../db.js';
import { generateEmbedding } from './embeddings.js';

/**
 * Cosine similarity between two vectors
 */
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

/**
 * Simple keyword/BM25-like scoring
 */
function keywordScore(query, text) {
  const queryTokens = query.toLowerCase().split(/\W+/).filter(t => t.length > 2);
  const textLower = text.toLowerCase();
  let score = 0;
  let matchedTerms = 0;

  for (const token of queryTokens) {
    const regex = new RegExp(token, 'gi');
    const matches = textLower.match(regex);
    if (matches) {
      // TF component: log(1 + count)
      score += Math.log(1 + matches.length);
      matchedTerms++;
    }
  }

  // Boost for matching more unique terms
  if (queryTokens.length > 0) {
    score *= (1 + matchedTerms / queryTokens.length);
  }

  return score;
}

/**
 * Hybrid search: semantic + keyword
 * @param {string} queryText - The user's query
 * @param {string[]} tagFilters - Optional tag filters
 * @param {number} topK - Number of results to return
 */
export async function hybridSearch(queryText, tagFilters = [], topK = 5) {
  // Get all active sections
  let sections = db.prepare(`
    SELECT section_id, doc_id, section_title, section_text, tags, source_type, url, embedding, last_updated
    FROM sections
    WHERE superseded = 0
  `).all();

  // Apply tag filters
  if (tagFilters.length > 0) {
    sections = sections.filter(s => {
      const sectionTags = JSON.parse(s.tags || '[]');
      return tagFilters.some(f => sectionTags.includes(f));
    });
  }

  if (sections.length === 0) return [];

  // Get doc titles
  const docTitles = {};
  const docs = db.prepare('SELECT doc_id, doc_title FROM documents').all();
  for (const d of docs) docTitles[d.doc_id] = d.doc_title;

  // Semantic search
  const queryEmbedding = await generateEmbedding(queryText);
  
  // Score each section
  const scored = sections.map(section => {
    let semanticScore = 0;
    if (queryEmbedding && section.embedding) {
      try {
        const sectionEmb = JSON.parse(section.embedding);
        semanticScore = cosineSimilarity(queryEmbedding, sectionEmb);
      } catch { /* ignore parsing errors */ }
    }

    const kwScoreText = keywordScore(queryText, section.section_text);
    const kwScoreTitle = keywordScore(queryText, section.section_title) * 1.5; // Boost title matches
    const kwTotal = kwScoreText + kwScoreTitle;

    // Normalize keyword score to [0,1] range roughly
    const kwNorm = Math.min(kwTotal / 5, 1);

    // Combined score
    const combined = queryEmbedding 
      ? (0.7 * semanticScore + 0.3 * kwNorm) 
      : kwNorm; // Fall back to keyword-only if no embeddings

    return {
      section_id: section.section_id,
      doc_id: section.doc_id,
      doc_title: docTitles[section.doc_id] || 'Unknown',
      section_title: section.section_title,
      section_text: section.section_text,
      tags: JSON.parse(section.tags || '[]'),
      source_type: section.source_type,
      url: section.url,
      last_updated: section.last_updated,
      score: combined,
      semantic_score: semanticScore,
      keyword_score: kwNorm
    };
  });

  // Sort by combined score descending
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK);
}

/**
 * Get all unique tags from the database
 */
export function getAllTags() {
  const sections = db.prepare("SELECT tags FROM sections WHERE superseded = 0").all();
  const tagSet = new Set();
  for (const s of sections) {
    const tags = JSON.parse(s.tags || '[]');
    for (const t of tags) tagSet.add(t);
  }
  return Array.from(tagSet).sort();
}
