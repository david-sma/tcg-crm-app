import { Router, Request, Response } from 'express';
import { db } from '../db/index.ts';
import { users, sessions } from '../db/schema.ts';
import { eq, desc, and } from 'drizzle-orm';
import { generateStaffPassword, hashPassword, normalizePhone } from '../services/crypto.ts';
import { logAuditEvent } from '../services/audit.ts';
import { requireAuth, requireRole, requireAnyRole } from '../middleware/auth.ts';
import { getAppSettings } from '../../src/config/appSettings.ts';
import { USER_ROLES, ROLE_LABELS } from '../../src/config/roles.ts';
import type { UserRole } from '../../src/types/index.ts';
import crypto from 'crypto';

export const staffRouter = Router();

// Staff directory: managers and service team can look up the active list
// (service team needs it for crew allocation when scheduling jobs).
// All account mutations below stay manager-only.
staffRouter.use(requireAuth);

staffRouter.get('/', requireAnyRole('manager', 'service_team'), async (req: Request, res: Response) => {
  try {
    const roleFilter = req.query.role as string | undefined;
    const statusFilter = req.query.status as string | undefined;

    const conditions: any[] = [];
    if (roleFilter && USER_ROLES.includes(roleFilter as UserRole)) {
      conditions.push(eq(users.role, roleFilter));
    }
    if (statusFilter === 'active') {
      conditions.push(eq(users.is_active, true));
    } else if (statusFilter === 'inactive') {
      conditions.push(eq(users.is_active, false));
    }

    let query = db
      .select({
        id: users.id,
        phone_e164: users.phone_e164,
        role: users.role,
        name: users.name,
        notes: users.notes,
        is_active: users.is_active,
        created_at: users.created_at,
        updated_at: users.updated_at,
      })
      .from(users);

    let list;
    if (conditions.length > 0) {
      list = await query.where(and(...conditions)).orderBy(desc(users.created_at));
    } else {
      list = await query.orderBy(desc(users.created_at));
    }

    return res.json({ staff: list });
  } catch (err) {
    console.error('List staff error:', err);
    return res.status(500).json({ error: 'Failed to retrieve staff list' });
  }
});

// Everything beyond the list above is account management: Manager only.
staffRouter.use(requireRole('manager'));

// POST /api/staff - Create new staff or manager account
staffRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { name, phone, notes, role = 'staff' } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'User name is required.' });
    }

    const assignedRole: UserRole = USER_ROLES.includes(role as UserRole) ? role : 'staff';

    const normalized = normalizePhone(phone);
    if (!normalized.isValid) {
      return res.status(400).json({ error: `Valid phone number is required (e.g. ${getAppSettings().phone.example}).` });
    }

    // Check uniqueness
    const existing = await db.select().from(users).where(eq(users.phone_e164, normalized.e164)).limit(1);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'That phone number is already registered to an account.' });
    }

    // Generate 8-character temporary password meeting all complexity criteria
    const rawPassword = generateStaffPassword();
    const passwordHash = await hashPassword(rawPassword);
    const staffId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    await db.insert(users).values({
      id: staffId,
      phone_e164: normalized.e164,
      password_hash: passwordHash,
      role: assignedRole,
      name: name.trim(),
      notes: notes?.trim() || null,
      is_active: true,
      password_version: 1,
      created_at: nowIso,
      updated_at: nowIso,
    });

    await logAuditEvent({
      actor_user_id: req.user!.id,
      actor_name: req.user!.name,
      actor_role: req.user!.role,
      event_type: 'STAFF_CREATED',
      entity_type: 'user',
      entity_id: staffId,
      metadata: { name: name.trim(), phone: normalized.e164, role: assignedRole },
      ip_address: req.ip,
    });

    return res.status(201).json({
      user: {
        id: staffId,
        name: name.trim(),
        phone_e164: normalized.e164,
        role: assignedRole,
        is_active: true,
        notes: notes?.trim() || null,
      },
      generatedPassword: rawPassword, // Shown ONCE to manager
    });
  } catch (err: any) {
    console.error('Create staff error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to create account' });
  }
});

// PUT /api/staff/:id - Edit staff or manager details & role
staffRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, phone, notes, is_active, role } = req.body;

    const existingList = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (existingList.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const existing = existingList[0];
    const updateData: any = { updated_at: new Date().toISOString() };

    if (name && typeof name === 'string') {
      updateData.name = name.trim();
    }
    if (notes !== undefined) {
      updateData.notes = notes ? notes.trim() : null;
    }
    if (typeof is_active === 'boolean') {
      updateData.is_active = is_active;
    }

    if (role && USER_ROLES.includes(role as UserRole)) {
      if (existing.role === 'manager' && role !== 'manager') {
        // Prevent demoting the only active manager
        const activeManagers = await db
          .select()
          .from(users)
          .where(and(eq(users.role, 'manager'), eq(users.is_active, true)));
        if (activeManagers.length <= 1 && activeManagers.some((m) => m.id === id)) {
          return res.status(400).json({
            error: 'Cannot change this account to a non-manager role because it is the only active Manager. Promote another user to Manager first.',
          });
        }
      }
      updateData.role = role;
    }

    if (phone) {
      const normalized = normalizePhone(phone);
      if (!normalized.isValid) {
        return res.status(400).json({ error: 'Valid phone number is required.' });
      }
      if (normalized.e164 !== existing.phone_e164) {
        const checkConflict = await db.select().from(users).where(eq(users.phone_e164, normalized.e164)).limit(1);
        if (checkConflict.length > 0) {
          return res.status(400).json({ error: 'That phone number is already used by another account.' });
        }
        updateData.phone_e164 = normalized.e164;
      }
    }

    await db.update(users).set(updateData).where(eq(users.id, id));

    const roleChanged = updateData.role && updateData.role !== existing.role;

    await logAuditEvent({
      actor_user_id: req.user!.id,
      actor_name: req.user!.name,
      actor_role: req.user!.role,
      event_type: roleChanged ? 'USER_ROLE_CHANGED' : 'STAFF_UPDATED',
      entity_type: 'user',
      entity_id: id,
      metadata: { ...updateData, previous_role: existing.role, new_role: updateData.role || existing.role },
      ip_address: req.ip,
    });

    const updated = (await db.select().from(users).where(eq(users.id, id)))[0];
    const { password_hash, ...safeUser } = updated;
    return res.json({ user: safeUser });
  } catch (err: any) {
    console.error('Update staff error:', err);
    return res.status(500).json({ error: 'Failed to update user' });
  }
});

// POST /api/staff/:id/role - Dedicated endpoint to switch role between staff and manager
staffRouter.post('/:id/role', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!USER_ROLES.includes(role as UserRole)) {
      return res.status(400).json({
        error: `Invalid role. Must be one of: ${USER_ROLES.join(', ')}.`,
      });
    }

    const existingList = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (existingList.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const existing = existingList[0];
    if (existing.role === role) {
      const { password_hash, ...safeUser } = existing;
      return res.json({ user: safeUser, message: `User is already a ${role}.` });
    }

    if (existing.role === 'manager' && role !== 'manager') {
      // Check that at least one other active manager exists
      const activeManagers = await db
        .select()
        .from(users)
        .where(and(eq(users.role, 'manager'), eq(users.is_active, true)));
      if (activeManagers.length <= 1 && activeManagers.some((m) => m.id === id)) {
        return res.status(400).json({
          error: 'Cannot demote this user to a non-manager role because they are the only active Manager. Promote another user first.',
        });
      }
    }

    const nowIso = new Date().toISOString();
    await db.update(users).set({ role, updated_at: nowIso }).where(eq(users.id, id));

    await logAuditEvent({
      actor_user_id: req.user!.id,
      actor_name: req.user!.name,
      actor_role: req.user!.role,
      event_type: 'USER_ROLE_CHANGED',
      entity_type: 'user',
      entity_id: id,
      metadata: { target_name: existing.name, previous_role: existing.role, new_role: role },
      ip_address: req.ip,
    });

    const updated = (await db.select().from(users).where(eq(users.id, id)))[0];
    const { password_hash, ...safeUser } = updated;
    return res.json({
      user: safeUser,
      previous_role: existing.role,
      new_role: role,
      message: `Role successfully changed to ${ROLE_LABELS[role as UserRole] || role}.`,
    });
  } catch (err: any) {
    console.error('Change role error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to change role' });
  }
});

// POST /api/staff/:id/reset-password - Generate replacement password
staffRouter.post('/:id/reset-password', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existingList = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (existingList.length === 0) {
      return res.status(404).json({ error: 'Staff member not found.' });
    }

    const existing = existingList[0];
    const rawPassword = generateStaffPassword();
    const passwordHash = await hashPassword(rawPassword);
    const newVersion = existing.password_version + 1;

    // Update password hash and increment password_version (which invalidates all sessions)
    await db
      .update(users)
      .set({
        password_hash: passwordHash,
        password_version: newVersion,
        updated_at: new Date().toISOString(),
      })
      .where(eq(users.id, id));

    // Invalidate existing sessions in DB
    await db.delete(sessions).where(eq(sessions.user_id, id));

    await logAuditEvent({
      actor_user_id: req.user!.id,
      actor_name: req.user!.name,
      actor_role: req.user!.role,
      event_type: 'STAFF_PASSWORD_RESET',
      entity_type: 'user',
      entity_id: id,
      metadata: { target_name: existing.name },
      ip_address: req.ip,
    });

    return res.json({
      generatedPassword: rawPassword, // Shown ONCE to manager
      message: 'Password reset successfully. All existing staff sessions have been revoked.',
    });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
});

// POST /api/staff/:id/toggle-status - Activate / Deactivate staff
staffRouter.post('/:id/toggle-status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existingList = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (existingList.length === 0) {
      return res.status(404).json({ error: 'Staff member not found.' });
    }

    const existing = existingList[0];
    const newStatus = !existing.is_active;

    await db
      .update(users)
      .set({
        is_active: newStatus,
        updated_at: new Date().toISOString(),
      })
      .where(eq(users.id, id));

    // If deactivated, delete all active sessions immediately
    if (!newStatus) {
      await db.delete(sessions).where(eq(sessions.user_id, id));
    }

    await logAuditEvent({
      actor_user_id: req.user!.id,
      actor_name: req.user!.name,
      actor_role: req.user!.role,
      event_type: newStatus ? 'STAFF_ACTIVATED' : 'STAFF_DEACTIVATED',
      entity_type: 'user',
      entity_id: id,
      metadata: { target_name: existing.name, new_status: newStatus },
      ip_address: req.ip,
    });

    return res.json({ is_active: newStatus });
  } catch (err) {
    console.error('Toggle status error:', err);
    return res.status(500).json({ error: 'Failed to change staff status' });
  }
});
