import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';
import { brandConfig } from './customer/brand.ts';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Injects customer branding into index.html at build/dev time so the static
// shell (title, meta, theme color, first-paint CSS vars) matches customer/.
function brandHtmlPlugin(): Plugin {
  const title = `${brandConfig.companyName} | ${brandConfig.portalSubtitle}`;
  const replacements: Record<string, string> = {
    '%BRAND_TITLE%': escapeHtml(title),
    '%BRAND_DESCRIPTION%': escapeHtml(
      `Official workforce rostering and availability scheduling portal for ${brandConfig.companyName} ${brandConfig.city} team.`
    ),
    '%BRAND_OG_DESCRIPTION%': escapeHtml(
      `${brandConfig.tagline}. ${brandConfig.city} workforce scheduling and roster portal.`
    ),
    '%BRAND_APPLE_TITLE%': escapeHtml(brandConfig.appTitle),
    '%BRAND_THEME_COLOR%': escapeHtml(brandConfig.colors.background),
  };
  const themeStyle = `<style id="brand-theme">:root{--color-brand:${brandConfig.colors.primary};--color-brand-hover:${brandConfig.colors.primaryHover};--color-brand-secondary:${brandConfig.colors.secondary};--color-brand-secondary-hover:${brandConfig.colors.secondaryHover};--color-brand-accent:${brandConfig.colors.accent};--color-brand-bg:${brandConfig.colors.background};}</style>`;

  return {
    name: 'brand-html',
    transformIndexHtml: {
      order: 'post',
      handler(html: string) {
        let out = html;
        for (const [token, value] of Object.entries(replacements)) {
          out = out.split(token).join(value);
        }
        return out.replace('</head>', `${themeStyle}</head>`);
      },
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), brandHtmlPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
