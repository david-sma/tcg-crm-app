import { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.ts';
import { sessions, users } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import type { User, UserRole } from '../../src/types/index.ts';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      sessionId?: string;
    }
  }
}

export const SESSION_COOKIE_NAME = 'roster_session_token';

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
    const headerToken = (req.headers['x-auth-token'] as string | undefined) || req.headers.authorization?.replace('Bearer ', '');
    const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
    const token = cookieToken || headerToken || queryToken;

    if (!token) {
      return next();
    }

    const sessionList = await db.select().from(sessions).where(eq(sessions.id, token)).limit(1);
    if (sessionList.length === 0) {
      res.clearCookie(SESSION_COOKIE_NAME);
      return next();
    }

    const session = sessionList[0];

    // Check expiration
    if (new Date(session.expires_at).getTime() < Date.now()) {
      await db.delete(sessions).where(eq(sessions.id, session.id));
      res.clearCookie(SESSION_COOKIE_NAME);
      return next();
    }

    // Fetch user
    const userList = await db.select().from(users).where(eq(users.id, session.user_id)).limit(1);
    if (userList.length === 0) {
      await db.delete(sessions).where(eq(sessions.id, session.id));
      res.clearCookie(SESSION_COOKIE_NAME);
      return next();
    }

    const user = userList[0];

    // Enforce active status server-side
    if (!user.is_active) {
      await db.delete(sessions).where(eq(sessions.id, session.id));
      res.clearCookie(SESSION_COOKIE_NAME);
      return res.status(403).json({ error: 'Your account is deactivated. Please contact your manager.' });
    }

    // Enforce password version consistency (revocation on password reset)
    if (session.password_version !== user.password_version) {
      await db.delete(sessions).where(eq(sessions.id, session.id));
      res.clearCookie(SESSION_COOKIE_NAME);
      return res.status(401).json({ error: 'Session expired due to password reset. Please sign in again.' });
    }

    req.user = user as User;
    req.sessionId = session.id;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    next();
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

export function requireRole(role: UserRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (req.user.role !== role) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
    }
    next();
  };
}

export function requireAnyRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
    }
    next();
  };
}

// Simple IP-based in-memory login rate limiter
const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();

export function resetLoginRateLimit(ip?: string) {
  if (ip) {
    loginAttempts.delete(ip);
  }
}

export function loginRateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || 'unknown-ip';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxAttempts = 50; // generous limit to avoid false positives during testing

  const record = loginAttempts.get(ip);
  if (!record || now - record.firstAttempt > windowMs) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
    return next();
  }

  if (record.count >= maxAttempts) {
    return res.status(429).json({
      error: 'Too many login attempts. Please wait 15 minutes before trying again.',
    });
  }

  record.count += 1;
  next();
}
