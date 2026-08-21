import { Router, Request, Response } from 'express';
import { db } from '../db/index.ts';
import { auditEvents } from '../db/schema.ts';
import { desc } from 'drizzle-orm';
import { requireAuth, requireRole } from '../middleware/auth.ts';

export const auditRouter = Router();

auditRouter.use(requireAuth, requireRole('manager'));

// GET /api/audit - List recent audit logs
auditRouter.get('/', async (req: Request, res: Response) => {
  try {
    const list = await db.select().from(auditEvents).orderBy(desc(auditEvents.created_at)).limit(100);

    const parsed = list.map((item) => ({
      ...item,
      metadata: item.metadata ? JSON.parse(item.metadata) : null,
    }));

    return res.json({ audit_events: parsed });
  } catch (err) {
    console.error('List audit events error:', err);
    return res.status(500).json({ error: 'Failed to retrieve audit events' });
  }
});
