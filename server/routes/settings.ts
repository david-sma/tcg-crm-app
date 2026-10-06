import { Router, Request, Response } from 'express';
import { loadCompanySettings } from '../services/companySettings.ts';

export const settingsRouter = Router();

// GET /api/settings - Public brand/locale settings for the deployment (no auth required)
settingsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const settings = await loadCompanySettings();
    res.set('Cache-Control', 'public, max-age=60');
    return res.json(settings);
  } catch (err) {
    console.error('Error loading company settings:', err);
    return res.status(500).json({ error: 'Failed to load settings' });
  }
});
