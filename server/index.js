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

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API routes
app.use('/api/documents', documentsRouter);
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
  console.log(`   Mode: ${process.env.NODE_ENV === 'production' ? '🌐 Production' : '🛠️  Development'}\n`);
});
