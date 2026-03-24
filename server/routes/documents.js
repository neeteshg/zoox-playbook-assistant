import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import db from '../db.js';
import { parseFile } from '../services/parser.js';
import { generateEmbedding, generateEmbeddings } from '../services/embeddings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowedExts = ['.pdf', '.docx', '.txt', '.md', '.csv', '.xlsx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}. Allowed: ${allowedExts.join(', ')}`));
    }
  }
});

const router = Router();

/**
 * POST /api/documents/upload
 * Upload a file, parse it, store sections + embeddings
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const tags = req.body.tags ? JSON.parse(req.body.tags) : [];
    const { doc_title, sections } = await parseFile(
      req.file.path, 
      req.file.originalname,
      tags
    );

    if (sections.length === 0) {
      return res.status(400).json({ error: 'No sections could be extracted from the file' });
    }

    const docId = req.body.doc_id || `doc_${uuidv4().substring(0, 12)}`;
    const sourceId = `upload_${new Date().toISOString().split('T')[0].replace(/-/g, '')}_${docId}`;
    const now = new Date().toISOString();

    // Check if this is a re-upload (mark old sections as superseded)
    const existing = db.prepare('SELECT doc_id FROM documents WHERE doc_id = ?').get(docId);
    if (existing) {
      db.prepare('UPDATE sections SET superseded = 1 WHERE doc_id = ?').run(docId);
      db.prepare('UPDATE documents SET doc_title = ?, last_updated = ?, file_name = ? WHERE doc_id = ?')
        .run(doc_title, now, req.file.originalname, docId);
    } else {
      db.prepare(`
        INSERT INTO documents (doc_id, doc_title, source_type, source_id, file_name, last_updated)
        VALUES (?, ?, 'upload', ?, ?, ?)
      `).run(docId, doc_title, sourceId, req.file.originalname, now);
    }

    // Generate embeddings for all sections in batch
    const texts = sections.map(s => `${s.section_title}\n${s.section_text}`);
    const embeddings = await generateEmbeddings(texts);

    // Insert sections
    const insertSection = db.prepare(`
      INSERT INTO sections (section_id, doc_id, section_title, section_text, tags, source_type, embedding, last_updated)
      VALUES (?, ?, ?, ?, ?, 'upload', ?, ?)
    `);

    const insertAll = db.transaction(() => {
      for (let i = 0; i < sections.length; i++) {
        const s = sections[i];
        const embStr = embeddings[i] ? JSON.stringify(embeddings[i]) : null;
        insertSection.run(
          s.section_id, docId, s.section_title, s.section_text,
          JSON.stringify(s.tags), embStr, now
        );
      }
    });
    insertAll();

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      doc_id: docId,
      doc_title,
      sections_count: sections.length,
      message: existing ? 'Document re-uploaded successfully' : 'Document uploaded successfully'
    });

  } catch (err) {
    console.error('Upload error:', err);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/documents
 * List all documents with section counts
 */
router.get('/', (req, res) => {
  const docs = db.prepare(`
    SELECT 
      d.doc_id, d.doc_title, d.source_type, d.source_id, d.file_name, d.last_updated,
      COUNT(s.section_id) as section_count,
      GROUP_CONCAT(DISTINCT s.tags) as all_tags
    FROM documents d
    LEFT JOIN sections s ON d.doc_id = s.doc_id AND s.superseded = 0
    GROUP BY d.doc_id
    ORDER BY d.last_updated DESC
  `).all();

  // Parse tags
  const result = docs.map(d => {
    const tagSet = new Set();
    if (d.all_tags) {
      for (const tagStr of d.all_tags.split(',')) {
        try {
          const tags = JSON.parse(tagStr);
          tags.forEach(t => tagSet.add(t));
        } catch { /* ignore */ }
      }
    }
    return {
      ...d,
      all_tags: Array.from(tagSet)
    };
  });

  res.json(result);
});

/**
 * DELETE /api/documents/:docId
 * Delete a document and its sections
 */
router.delete('/:docId', (req, res) => {
  const { docId } = req.params;
  const existing = db.prepare('SELECT doc_id FROM documents WHERE doc_id = ?').get(docId);
  if (!existing) {
    return res.status(404).json({ error: 'Document not found' });
  }

  db.prepare('DELETE FROM sections WHERE doc_id = ?').run(docId);
  db.prepare('DELETE FROM documents WHERE doc_id = ?').run(docId);

  res.json({ success: true, message: 'Document deleted' });
});

export default router;
