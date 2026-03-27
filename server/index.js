import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Import DB to ensure tables are created and seeded
import './db.js';

// Import routes
import documentsRouter from './routes/documents.js';
import queryRouter from './routes/query.js';
import feedbackRouter from './routes/feedback.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Admin password — set in .env or defaults to 'zooxadmin'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'zooxadmin';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Admin auth middleware — protects upload/delete
function requireAdmin(req, res, next) {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey === ADMIN_PASSWORD) {
    return next();
  }
  return res.status(401).json({ error: 'Admin authentication required' });
}

// Admin verification endpoint
app.post('/api/admin/verify', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid admin password' });
  }
});

// API routes — documents upload/delete are admin-protected
app.use('/api/documents', (req, res, next) => {
  // Protect upload and delete, but allow GET (listing)
  if (req.method === 'POST' || req.method === 'DELETE') {
    return requireAdmin(req, res, next);
  }
  next();
}, documentsRouter);

app.use('/api/query', queryRouter);
app.use('/api/feedback', feedbackRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    hasApiKey: !!process.env.OPENAI_API_KEY
  });
});

// Serve built frontend in production
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));

// Error handler for API routes
app.use('/api', (err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: err.message });
});

// Client-side routing: serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

const HOST = '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`\n🚀 Zoox Playbook Assistant running on http://localhost:${PORT}`);
  console.log(`   OpenAI API: ${process.env.OPENAI_API_KEY ? '✅ Configured' : '❌ Not configured (keyword search + fallback answers)'}`);
  console.log(`   Admin password: ${ADMIN_PASSWORD === 'zooxadmin' ? '⚠️  Using default (set ADMIN_PASSWORD in .env)' : '✅ Custom password set'}`);
  console.log(`   Mode: ${process.env.NODE_ENV === 'production' ? '🌐 Production' : '🛠️  Development'}\n`);

  // Self-ping to prevent Render free tier from sleeping
  const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
  if (RENDER_URL) {
    const PING_INTERVAL = 5 * 60 * 1000; // 5 minutes
    setInterval(async () => {
      try {
        const res = await fetch(`${RENDER_URL}/api/health`);
        const data = await res.json();
        console.log(`🏓 Self-ping OK: ${data.timestamp}`);
      } catch (err) {
        console.error('🏓 Self-ping failed:', err.message);
      }
    }, PING_INTERVAL);
    console.log(`   Self-ping: ✅ Every 5 min → ${RENDER_URL}/api/health`);
  } else {
    console.log('   Self-ping: ⚠️  Not in production (no RENDER_EXTERNAL_URL)');
  }
});

