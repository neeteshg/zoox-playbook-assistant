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

// Stopwords to ignore in keyword matching
const STOPWORDS = new Set([
  'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but',
  'in', 'with', 'to', 'for', 'of', 'not', 'no', 'can', 'had', 'has',
  'have', 'it', 'its', 'do', 'does', 'did', 'will', 'would', 'shall',
  'should', 'may', 'might', 'be', 'been', 'being', 'am', 'are', 'was',
  'were', 'this', 'that', 'these', 'those', 'my', 'your', 'his', 'her',
  'we', 'they', 'them', 'i', 'me', 'what', 'how', 'when', 'where', 'who',
  'if', 'so', 'up', 'out', 'just', 'then', 'too', 'very', 'any', 'some'
]);

// Synonym map for common terms in AV operations
const SYNONYMS = {
  'rain': ['rain', 'raining', 'rainy', 'rainfall', 'flood', 'flooding', 'wet', 'storm', 'thunderstorm', 'precipitation', 'heavy rain'],
  'stuck': ['stuck', 'blocked', 'stopped', 'stalled', 'stranded', 'unable to move', 'not moving', 'immobile'],
  'emergency': ['emergency', 'urgent', 'critical', 'crisis', 'danger', 'dangerous', 'life-threatening'],
  'medical': ['medical', 'health', 'injury', 'injured', 'hurt', 'sick', 'illness', 'unconscious', 'faint', 'fainting', 'heart', 'breathing'],
  'accident': ['accident', 'collision', 'crash', 'hit', 'impact', 'damage', 'damaged'],
  'weather': ['weather', 'rain', 'raining', 'snow', 'ice', 'icy', 'fog', 'foggy', 'heat', 'hot', 'cold', 'storm', 'wind', 'tornado', 'hail', 'flood'],
  'vehicle': ['vehicle', 'car', 'pod', 'zoox', 'ride', 'av'],
  'rider': ['rider', 'passenger', 'customer', 'user', 'person'],
  'tire': ['tire', 'tyre', 'flat', 'puncture', 'pressure'],
  'sensor': ['sensor', 'lidar', 'camera', 'radar', 'ultrasonic'],
  'complaint': ['complaint', 'complain', 'uncomfortable', 'unhappy', 'bad', 'terrible', 'jerky', 'slow'],
  'lost': ['lost', 'missing', 'forgot', 'forgotten', 'left behind', 'misplaced'],
  'billing': ['billing', 'charge', 'charged', 'payment', 'refund', 'price', 'fare', 'cost', 'overcharged'],
};

function expandQueryTerms(queryTokens) {
  const expanded = new Set(queryTokens);
  for (const token of queryTokens) {
    for (const [, synonymList] of Object.entries(SYNONYMS)) {
      if (synonymList.includes(token)) {
        synonymList.forEach(s => expanded.add(s));
      }
    }
  }
  return Array.from(expanded);
}

function keywordScore(query, text, title) {
  // Tokenize query — remove stopwords
  const queryTokens = query.toLowerCase().split(/\W+/).filter(t => t.length > 2 && !STOPWORDS.has(t));
  if (queryTokens.length === 0) return 0;

  // Expand with synonyms
  const expandedTokens = expandQueryTerms(queryTokens);

  const textLower = text.toLowerCase();
  const titleLower = title.toLowerCase();

  let textScore = 0;
  let titleScore = 0;
  let textMatches = 0;
  let titleMatches = 0;

  for (const token of expandedTokens) {
    const textRegex = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi');
    const titleRegex = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi');

    const textHits = textLower.match(textRegex);
    const titleHits = titleLower.match(titleRegex);

    if (textHits) {
      textScore += Math.log(1 + textHits.length);
      textMatches++;
    }
    if (titleHits) {
      titleScore += (Math.log(1 + titleHits.length)) * 3;  // Title matches are 3x more valuable
      titleMatches++;
    }
  }

  // Bonus for matching original (non-expanded) query terms
  let directMatchBonus = 0;
  for (const token of queryTokens) {
    if (textLower.includes(token)) directMatchBonus += 1.5;
    if (titleLower.includes(token)) directMatchBonus += 3.0;
  }

  // Coverage: what % of query terms matched
  const totalTerms = expandedTokens.length;
  const matchedTerms = new Set();
  for (const token of expandedTokens) {
    if (textLower.includes(token) || titleLower.includes(token)) matchedTerms.add(token);
  }
  const coverage = matchedTerms.size / Math.max(totalTerms, 1);

  const rawScore = textScore + titleScore + directMatchBonus;
  // Multiply by coverage to penalize sections that only match one word
  return rawScore * (0.5 + 0.5 * coverage);
}

/**
 * Hybrid search with proper tag and city filtering
 */
export async function hybridSearch(queryText, tagFilters = [], cityFilter = '', topK = 5) {
  let sections = db.prepare(`
    SELECT section_id, doc_id, section_title, section_text, tags, city, source_type, url, embedding, last_updated
    FROM sections
    WHERE superseded = 0
  `).all();

  // City filter: show city-specific + global sections
  if (cityFilter && cityFilter !== 'all') {
    sections = sections.filter(s => s.city === cityFilter || s.city === 'all');
  }

  // Tag filter: section must contain ALL selected tags
  if (tagFilters.length > 0) {
    sections = sections.filter(s => {
      const sectionTags = JSON.parse(s.tags || '[]');
      return tagFilters.every(filterTag => sectionTags.includes(filterTag));
    });
  }

  if (sections.length === 0) return [];

  // Doc titles lookup
  const docTitles = {};
  const docs = db.prepare('SELECT doc_id, doc_title FROM documents').all();
  for (const d of docs) docTitles[d.doc_id] = d.doc_title;

  // Semantic embedding
  const queryEmbedding = await generateEmbedding(queryText);

  const scored = sections.map(section => {
    let semanticScore = 0;
    if (queryEmbedding && section.embedding) {
      try {
        semanticScore = cosineSimilarity(queryEmbedding, JSON.parse(section.embedding));
      } catch { /* ignore */ }
    }

    const kwScore = keywordScore(queryText, section.section_text, section.section_title);

    // Normalize keyword score (cap at reasonable max)
    const kwNorm = Math.min(kwScore / 10, 1);

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
    };
  });

  scored.sort((a, b) => b.score - a.score);

  // Filter out very low-scoring results (below 10% of top score)
  const topScore = scored[0]?.score || 0;
  const threshold = topScore * 0.1;
  const filtered = scored.filter(s => s.score >= threshold);

  return filtered.slice(0, topK);
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
