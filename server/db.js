import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'data', 'playbook.db');

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    doc_id TEXT PRIMARY KEY,
    doc_title TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'upload',
    source_id TEXT,
    file_name TEXT,
    last_updated TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sections (
    section_id TEXT PRIMARY KEY,
    doc_id TEXT NOT NULL,
    section_title TEXT NOT NULL,
    section_text TEXT NOT NULL,
    tags TEXT DEFAULT '[]',
    source_type TEXT NOT NULL DEFAULT 'upload',
    url TEXT,
    embedding TEXT,
    last_updated TEXT NOT NULL,
    superseded INTEGER DEFAULT 0,
    FOREIGN KEY (doc_id) REFERENCES documents(doc_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL,
    answer TEXT NOT NULL,
    sources TEXT,
    rating TEXT NOT NULL,
    comment TEXT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_sections_doc_id ON sections(doc_id);
  CREATE INDEX IF NOT EXISTS idx_sections_superseded ON sections(superseded);
  CREATE INDEX IF NOT EXISTS idx_sections_tags ON sections(tags);
`);

// Seed the database with sample data on first run
function seedDatabase() {
  const count = db.prepare('SELECT COUNT(*) as cnt FROM sections').get();
  if (count.cnt > 0) return;

  console.log('🌱 Seeding database with sample knowledgebase...');
  const seedPath = path.join(__dirname, 'data', 'seed.json');
  const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));

  // Gather unique documents
  const docs = new Map();
  for (const section of seedData) {
    if (!docs.has(section.doc_id)) {
      docs.set(section.doc_id, {
        doc_id: section.doc_id,
        doc_title: section.doc_title,
        source_type: section.source_type,
        source_id: section.source_id,
        last_updated: section.last_updated
      });
    }
  }

  const insertDoc = db.prepare(`
    INSERT OR IGNORE INTO documents (doc_id, doc_title, source_type, source_id, last_updated)
    VALUES (@doc_id, @doc_title, @source_type, @source_id, @last_updated)
  `);

  const insertSection = db.prepare(`
    INSERT OR IGNORE INTO sections (section_id, doc_id, section_title, section_text, tags, source_type, url, last_updated)
    VALUES (@section_id, @doc_id, @section_title, @section_text, @tags, @source_type, @url, @last_updated)
  `);

  const seedAll = db.transaction(() => {
    for (const doc of docs.values()) {
      insertDoc.run(doc);
    }
    for (const section of seedData) {
      insertSection.run({
        ...section,
        tags: JSON.stringify(section.tags || []),
        url: section.url || null
      });
    }
  });

  seedAll();
  console.log(`  ✅ Seeded ${docs.size} documents, ${seedData.length} sections`);
}

seedDatabase();

export default db;
