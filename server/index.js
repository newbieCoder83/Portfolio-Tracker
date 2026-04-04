const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeSchema } = require('./db/schema');
const sessionMiddleware = require('./middleware/session');
const requireAuth = require('./middleware/auth');

// Initialize database tables
initializeSchema();

const app = express();
const PORT = process.env.PORT || 3001;
const PROD_PORT = 3000;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'],
  credentials: true,
}));
app.use(express.json());
app.use(sessionMiddleware);

// Routes — auth routes are public
app.use('/api/auth', require('./routes/auth'));

// All other API routes require authentication
app.use('/api/account', requireAuth, require('./routes/account'));
app.use('/api/portfolio', requireAuth, require('./routes/portfolio'));
app.use('/api/history', requireAuth, require('./routes/history'));
app.use('/api/sync', requireAuth, require('./routes/sync'));
app.use('/api', requireAuth, require('./routes/sync')); // mount snapshots under /api too

// Serve static files in production
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));

// SPA fallback — serve index.html for all non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(clientDist, 'index.html'));
  }
});

// Start server
const port = process.env.NODE_ENV === 'production' ? PROD_PORT : PORT;
app.listen(port, () => {
  console.log(`[Server] Portfolio Tracker running on http://localhost:${port}`);
});
