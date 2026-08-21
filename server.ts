import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { bootstrapInitialData } from './server/services/seed.ts';
import { authMiddleware, loginRateLimiter } from './server/middleware/auth.ts';
import { authRouter } from './server/routes/auth.ts';
import { staffRouter } from './server/routes/staff.ts';
import { availabilityRouter } from './server/routes/availability.ts';
import { rosterRouter } from './server/routes/rosters.ts';
import { personalRosterRouter } from './server/routes/personalRoster.ts';
import { notificationsRouter } from './server/routes/notifications.ts';
import { auditRouter } from './server/routes/audit.ts';

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  const app = express();

  // Basic health check FIRST before any async initialization or middleware
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Initialize Seed Data on startup
  try {
    await bootstrapInitialData();
  } catch (dbErr) {
    console.error('Database bootstrap warning:', dbErr);
  }

  app.use(express.json());
  app.use(cookieParser());
  app.use(authMiddleware);

  // Mount API Routers
  app.use('/api/auth/login', loginRateLimiter);
  app.use('/api/auth', authRouter);
  app.use('/api/staff', staffRouter);
  app.use('/api/availability', availabilityRouter);
  app.use('/api/rosters', rosterRouter);
  app.use('/api/personal-roster', personalRosterRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/audit', auditRouter);

  // Vite integration: development middleware vs production static files
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Workforce Roster Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
