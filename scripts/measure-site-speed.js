#!/usr/bin/env node
/**
 * Site Speed & Component Load Time Auditor
 * 
 * Usage:
 *   node scripts/measure-site-speed.js
 *   WEB_URL=https://turnos.in API_URL=http://localhost:4000 node scripts/measure-site-speed.js
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const REPO_ROOT = path.resolve(__dirname, '..');
const NEXT_BUILD_DIR = path.join(REPO_ROOT, 'apps', 'web', '.next');

const WEB_URL = (process.env.WEB_URL || 'http://localhost:3000').replace(/\/$/, '');
const defaultApiUrl = WEB_URL.includes('turnos.in') ? 'https://api.turnos.in' : 'http://localhost:4000';
const API_URL = (process.env.API_URL || defaultApiUrl).replace(/\/$/, '');

const COLOR = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function auditBundleSizes() {
  console.log(`\n${COLOR.cyan}${COLOR.bright}══ 1. NEXT.JS PAGE & COMPONENT JS BUNDLE AUDIT ══${COLOR.reset}\n`);

  const manifestPath = path.join(NEXT_BUILD_DIR, 'app-build-manifest.json');
  const routesManifestPath = path.join(NEXT_BUILD_DIR, 'app-path-routes-manifest.json');

  if (!fs.existsSync(manifestPath) || !fs.existsSync(routesManifestPath)) {
    console.log(`${COLOR.yellow}⚠️  No production build found in apps/web/.next. Run 'npm --prefix apps/web run build' first for bundle metrics.${COLOR.reset}`);
    return;
  }

  const appManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const routesMap = JSON.parse(fs.readFileSync(routesManifestPath, 'utf8'));

  const routeResults = [];

  for (const [pageKey, routePath] of Object.entries(routesMap)) {
    const files = appManifest.pages[pageKey] || [];
    let totalSize = 0;

    for (const relFile of files) {
      const fullPath = path.join(NEXT_BUILD_DIR, relFile);
      if (fs.existsSync(fullPath)) {
        const stat = fs.statSync(fullPath);
        totalSize += stat.size;
      }
    }

    routeResults.push({
      route: routePath,
      sizeBytes: totalSize,
      formatted: formatBytes(totalSize),
      filesCount: files.length,
    });
  }

  routeResults.sort((a, b) => b.sizeBytes - a.sizeBytes);

  console.log(`${COLOR.bright}${'Route Path'.padEnd(45)} ${'Total JS Payload'.padEnd(18)} ${'Status Budget'.padEnd(15)}${COLOR.reset}`);
  console.log('─'.repeat(78));

  for (const item of routeResults) {
    let status = `${COLOR.green}PASS (<350KB)${COLOR.reset}`;
    if (item.sizeBytes > 500 * 1024) {
      status = `${COLOR.red}HIGH (>500KB)${COLOR.reset}`;
    } else if (item.sizeBytes > 350 * 1024) {
      status = `${COLOR.yellow}WARN (>350KB)${COLOR.reset}`;
    }

    console.log(`${item.route.padEnd(45)} ${item.formatted.padEnd(18)} ${status}`);
  }
}

const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

function fetchTimed(urlStr, redirectCount = 0) {
  return new Promise((resolve) => {
    if (redirectCount > 5) {
      resolve({ url: urlStr, status: 310, ttfbMs: 0, totalMs: 0, sizeBytes: 0, error: 'Too many redirects' });
      return;
    }

    const url = new URL(urlStr);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    const agent = isHttps ? httpsAgent : httpAgent;

    const startTime = process.hrtime.bigint();
    let ttfbTime = 0;

    const req = client.get(urlStr, { agent, timeout: 5000 }, (res) => {
      ttfbTime = Number(process.hrtime.bigint() - startTime) / 1e6;

      // Handle HTTP redirects (301, 302, 307, 308)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const nextUrl = new URL(res.headers.location, urlStr).toString();
        fetchTimed(nextUrl, redirectCount + 1).then(resolve);
        return;
      }

      let bodyLength = 0;
      res.on('data', (chunk) => {
        bodyLength += chunk.length;
      });

      res.on('end', () => {
        const totalTime = Number(process.hrtime.bigint() - startTime) / 1e6;
        resolve({
          url: urlStr,
          status: res.statusCode,
          ttfbMs: ttfbTime,
          totalMs: totalTime,
          sizeBytes: bodyLength,
          error: null,
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        url: urlStr,
        status: 0,
        ttfbMs: 0,
        totalMs: 0,
        sizeBytes: 0,
        error: err.message,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        url: urlStr,
        status: 408,
        ttfbMs: 0,
        totalMs: 5000,
        sizeBytes: 0,
        error: 'Timeout after 5000ms',
      });
    });
  });
}

async function auditLiveLatency() {
  console.log(`\n${COLOR.cyan}${COLOR.bright}══ 2. LIVE HTTP LATENCY & TTFB SPEED AUDIT ══${COLOR.reset}\n`);

  const pagesToTest = [
    { name: 'Landing Page (Home)', url: `${WEB_URL}/` },
    { name: 'Login Chooser', url: `${WEB_URL}/login/choose` },
    { name: 'Patient Login', url: `${WEB_URL}/login/patient` },
    { name: 'Business Onboarding', url: `${WEB_URL}/get-started` },
    { name: 'FAQ Page', url: `${WEB_URL}/faq` },
    { name: 'Terms of Service', url: `${WEB_URL}/terms` },
    { name: 'Privacy Policy', url: `${WEB_URL}/privacy` },
    { name: 'Solutions Page (SEO)', url: `${WEB_URL}/solutions/clinic-queue-management-software` },
    { name: 'API Health Endpoint', url: API_URL.endsWith('/api') ? `${API_URL}/health` : `${API_URL}/api/health` },
  ];

  console.log(`${COLOR.bright}${'Target Page / Endpoint'.padEnd(35)} ${'HTTP Status'.padEnd(13)} ${'TTFB (ms)'.padEnd(12)} ${'Total (ms)'.padEnd(12)} ${'Latency SLA'.padEnd(10)}${COLOR.reset}`);
  console.log('─'.repeat(85));

  for (const page of pagesToTest) {
    const res = await fetchTimed(page.url);

    if (res.error) {
      console.log(`${page.name.padEnd(35)} ${COLOR.red}OFFLINE${COLOR.reset}`.padEnd(50) + ` (${res.error})`);
      continue;
    }

    let statusCol = `${COLOR.green}${res.status}${COLOR.reset}`;
    if (res.status >= 400) statusCol = `${COLOR.red}${res.status}${COLOR.reset}`;

    let latSla = `${COLOR.green}FAST (<100ms)${COLOR.reset}`;
    if (res.totalMs > 300) {
      latSla = `${COLOR.red}SLOW (>300ms)${COLOR.reset}`;
    } else if (res.totalMs > 100) {
      latSla = `${COLOR.yellow}MODERATE${COLOR.reset}`;
    }

    console.log(
      `${page.name.padEnd(35)} ${statusCol.padEnd(20)} ${res.ttfbMs.toFixed(1).padEnd(12)} ${res.totalMs.toFixed(1).padEnd(12)} ${latSla}`
    );
  }
}

async function main() {
  console.log(`${COLOR.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLOR.reset}`);
  console.log(`${COLOR.bright}          TURNOS SITE SPEED & COMPONENT LOAD TIME AUDITOR                  ${COLOR.reset}`);
  console.log(`${COLOR.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLOR.reset}`);

  auditBundleSizes();
  await auditLiveLatency();

  console.log(`\n${COLOR.bright}How to run this checkup anytime:${COLOR.reset}`);
  console.log(`  ${COLOR.cyan}node scripts/measure-site-speed.js${COLOR.reset}`);
  console.log(`  ${COLOR.cyan}WEB_URL=https://turnos.in node scripts/measure-site-speed.js${COLOR.reset}\n`);
}

main().catch(console.error);
