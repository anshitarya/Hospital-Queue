import fs from 'fs';
import path from 'path';
import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://turnos.in';

  // Configured list of potential landing pages with their priority and changeFrequency
  const routes = [
    { path: '', priority: 1.0, changeFrequency: 'daily' as const },
    { path: 'features', priority: 0.9, changeFrequency: 'weekly' as const },
    { path: 'pricing', priority: 0.9, changeFrequency: 'weekly' as const },
    { path: 'about', priority: 0.8, changeFrequency: 'monthly' as const },
    { path: 'get-started', priority: 0.8, changeFrequency: 'monthly' as const },
    { path: 'faq', priority: 0.8, changeFrequency: 'weekly' as const },
    { path: 'contact', priority: 0.7, changeFrequency: 'weekly' as const },
    { path: 'demo', priority: 0.7, changeFrequency: 'monthly' as const },
    { path: 'blog', priority: 0.6, changeFrequency: 'weekly' as const },
    { path: 'privacy', priority: 0.3, changeFrequency: 'monthly' as const },
    { path: 'terms', priority: 0.3, changeFrequency: 'monthly' as const },
    { path: 'join', priority: 0.8, changeFrequency: 'monthly' as const },
  ];

  const sitemapEntries: MetadataRoute.Sitemap = [];

  // Search in both process.cwd() (if run from apps/web) and process.cwd()/apps/web (if run from root)
  const appPaths = [
    path.join(process.cwd(), 'app'),
    path.join(process.cwd(), 'apps/web/app'),
  ];

  let appDir = '';
  for (const p of appPaths) {
    if (fs.existsSync(p)) {
      appDir = p;
      break;
    }
  }

  // Fallback to relative path if process.cwd detection fails
  if (!appDir) {
    appDir = path.resolve(__dirname, '..');
  }

  for (const route of routes) {
    const possibleFiles = [
      route.path === '' ? 'page.tsx' : `${route.path}/page.tsx`,
      route.path === '' ? 'page.ts' : `${route.path}/page.ts`,
    ];

    let foundFile = false;
    let lastModifiedDate = new Date();

    for (const file of possibleFiles) {
      const filePath = path.join(appDir, file);
      if (fs.existsSync(filePath)) {
        try {
          const stats = fs.statSync(filePath);
          lastModifiedDate = stats.mtime;
          foundFile = true;
          break;
        } catch (e) {
          // Fallback if stat fails
        }
      }
    }

    if (foundFile) {
      sitemapEntries.push({
        url: `${baseUrl}${route.path ? `/${route.path}` : ''}`,
        lastModified: lastModifiedDate,
        changeFrequency: route.changeFrequency,
        priority: route.priority,
      });
    }
  }

  return sitemapEntries;
}
