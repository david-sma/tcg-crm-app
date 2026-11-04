// Password age policy for manager-led resets. There is no self-service password
// change and no email/SMS: the app only reminds the user to ask their manager,
// and shows managers who is due. "Due" is computed on the fly (no cron).

export const PASSWORD_MAX_AGE_DAYS = 30;

/**
 * A password is due when it is strictly older than PASSWORD_MAX_AGE_DAYS.
 * A missing password_changed_at (rows predating the backfill) counts as due:
 * fail toward reminding rather than staying silent.
 */
export function isPasswordDue(passwordChangedAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!passwordChangedAt) return true;
  const changedAt = new Date(passwordChangedAt).getTime();
  if (Number.isNaN(changedAt)) return true;
  const maxAgeMs = PASSWORD_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() - changedAt > maxAgeMs;
}
