// ============================================================================
// BhashaSetu - Production Node.js Server
// Serves static bundle and /api/* endpoints on port 3000
// ============================================================================

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiRouter } from './src/api.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// API Endpoints
app.use('/api', apiRouter);

// Static files from dist
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// Fallback to index.html
app.use((_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`BhashaSetu Server running on http://0.0.0.0:${PORT}`);
});
