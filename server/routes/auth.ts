import { Router, Request, Response } from 'express';
import { db } from '../db/index.ts';
import { users, sessions } from '../db/schema.ts';
import { eq, or, like } from 'drizzle-orm';
import { normalizePhone, verifyPassword } from '../services/crypto.ts';
import { logAuditEvent } from '../services/audit.ts';
import { SESSION_COOKIE_NAME, requireAuth, resetLoginRateLimit } from '../middleware/auth.ts';
import crypto from 'crypto';

export const authRouter = Router();

// POST /api/auth/login
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone number and password are required' });
    }

    const normalized = normalizePhone(phone);
    if (!normalized.isValid) {
      return res.status(400).json({ error: 'Please enter a valid phone number (e.g. 027 730 4466)' });
    }

    let userList = await db.select().from(users).where(eq(users.phone_e164, normalized.e164)).limit(1);

    // Fallback: search by digits or if user typed national number
    if (userList.length === 0) {
      const digitsOnly = phone.toString().replace(/\D/g, '');
      if (digitsOnly.length >= 6) {
        const allUsers = await db.select().from(users);
        const match = allUsers.find(u => u.phone_e164.replace(/\D/g, '').endsWith(digitsOnly) || digitsOnly.endsWith(u.phone_e164.replace(/\D/g, '')));
        if (match) {
          userList = [match];
        }
      }
    }

    if (userList.length === 0) {
      return res.status(401).json({ error: 'Invalid phone number or password' });
    }

    const user = userList[0];

    // Enforce active status server-side
    if (!user.is_active) {
      return res.status(403).json({ error: 'Your account is deactivated. Please contact your manager.' });
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid phone number or password' });
    }

    // Reset rate limiter on valid login
    resetLoginRateLimit(req.ip);

    // Create session
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
    const nowIso = new Date().toISOString();

    await db.insert(sessions).values({
      id: sessionId,
      user_id: user.id,
      password_version: user.password_version,
      user_agent: req.headers['user-agent'] || null,
      ip_address: req.ip || null,
      expires_at: expiresAt,
      created_at: nowIso,
    });

    res.cookie(SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    await logAuditEvent({
      actor_user_id: user.id,
      actor_name: user.name,
      actor_role: user.role,
      event_type: 'USER_LOGIN',
      entity_type: 'user',
      entity_id: user.id,
      ip_address: req.ip,
    });

    const { password_hash, ...safeUser } = user;
    return res.json({ user: safeUser, sessionId, token: sessionId });
  } catch (err: any) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error during login' });
  }
});

// POST /api/auth/logout
authRouter.post('/logout', async (req: Request, res: Response) => {
  try {
    if (req.sessionId) {
      await db.delete(sessions).where(eq(sessions.id, req.sessionId));
    }
    res.clearCookie(SESSION_COOKIE_NAME);
    return res.json({ success: true });
  } catch (err) {
    console.error('Logout error:', err);
    return res.status(500).json({ error: 'Failed to logout' });
  }
});

// GET /api/auth/me
authRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const { password_hash, ...safeUser }: any = req.user;
  return res.json({ user: safeUser });
});
