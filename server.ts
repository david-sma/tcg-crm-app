import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { EventEmitter } from 'events';
import { createServer as createViteServer } from 'vite';

// Increase default max listeners to accommodate Vite dev server middlewares, HTTP connections, and object-storage stream pipelines
EventEmitter.defaultMaxListeners = 50;
import { bootstrapInitialData } from './server/services/seed.ts';
import { authMiddleware, loginRateLimiter } from './server/middleware/auth.ts';
import { settingsRouter } from './server/routes/settings.ts';
import { authRouter } from './server/routes/auth.ts';
import { staffRouter } from './server/routes/staff.ts';
import { availabilityRouter } from './server/routes/availability.ts';
import { rosterRouter } from './server/routes/rosters.ts';
import { personalRosterRouter } from './server/routes/personalRoster.ts';
import { notificationsRouter } from './server/routes/notifications.ts';
import { auditRouter } from './server/routes/audit.ts';
import { timesheetsRouter } from './server/routes/timesheets.ts';
import { jobsRouter } from './server/routes/jobs.ts';
import { getStorageClient } from './server/services/storage.ts';
import { startMediaQueue } from './server/services/mediaQueue.ts';

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;

  getStorageClient();

  const app = express();

  // Basic health check FIRST before any async initialization or middleware
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Public brand/locale settings (login screen + PWA need these without auth)
  app.use('/api/settings', settingsRouter);

  // Initialize Seed Data on startup (company_settings + team from customer/ config)
  try {
    await bootstrapInitialData();
  } catch (dbErr) {
    console.error('Database bootstrap warning:', dbErr);
  }

  startMediaQueue();

  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));
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
  app.use('/api/timesheets', timesheetsRouter);
  app.use('/api/jobs', jobsRouter);

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
