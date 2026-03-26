import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'data', 'playbook.db');

// Delete old DB to ensure fresh schema with city field
if (fs.existsSync(DB_PATH)) {
  fs.unlinkSync(DB_PATH);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Create tables with city support
db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    doc_id TEXT PRIMARY KEY,
    doc_title TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'upload',
    source_id TEXT,
    file_name TEXT,
    city TEXT DEFAULT 'all',
    last_updated TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sections (
    section_id TEXT PRIMARY KEY,
    doc_id TEXT NOT NULL,
    section_title TEXT NOT NULL,
    section_text TEXT NOT NULL,
    tags TEXT DEFAULT '[]',
    city TEXT DEFAULT 'all',
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
  CREATE INDEX IF NOT EXISTS idx_sections_city ON sections(city);
`);

// Seed the database
function seedDatabase() {
  const count = db.prepare('SELECT COUNT(*) as cnt FROM sections').get();
  if (count.cnt > 0) return;

  console.log('🌱 Seeding database with knowledgebase...');
  const seedPath = path.join(__dirname, 'data', 'seed.json');
  const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));

  const docs = new Map();
  for (const section of seedData) {
    if (!docs.has(section.doc_id)) {
      docs.set(section.doc_id, {
        doc_id: section.doc_id,
        doc_title: section.doc_title,
        source_type: section.source_type,
        source_id: section.source_id,
        city: section.city || 'all',
        last_updated: section.last_updated
      });
    }
  }

  const insertDoc = db.prepare(`
    INSERT OR IGNORE INTO documents (doc_id, doc_title, source_type, source_id, city, last_updated)
    VALUES (@doc_id, @doc_title, @source_type, @source_id, @city, @last_updated)
  `);

  const insertSection = db.prepare(`
    INSERT OR IGNORE INTO sections (section_id, doc_id, section_title, section_text, tags, city, source_type, url, last_updated)
    VALUES (@section_id, @doc_id, @section_title, @section_text, @tags, @city, @source_type, @url, @last_updated)
  `);

  const seedAll = db.transaction(() => {
    for (const doc of docs.values()) {
      insertDoc.run(doc);
    }
    for (const section of seedData) {
      insertSection.run({
        ...section,
        tags: JSON.stringify(section.tags || []),
        city: section.city || 'all',
        url: section.url || null
      });
    }
  });

  seedAll();
  console.log(`  ✅ Seeded ${docs.size} documents, ${seedData.length} sections`);
}

seedDatabase();

export default db;
