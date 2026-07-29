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

const { exec } = require('child_process');

function fetchTimed(urlStr) {
  return new Promise((resolve) => {
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
    // Use system curl to bypass Cloudflare's Node.js JA3/TLS fingerprint bot blocks.
    // -w output format: HTTP_STATUS TTFB TOTAL_TIME SIZE_BYTES
    const cmd = `curl -s -L -k --max-time 5 -A "${userAgent}" -w "%{http_code} %{time_starttransfer} %{time_total} %{size_download}" -o /dev/null "${urlStr}"`;

    exec(cmd, (error, stdout) => {
      if (error) {
        resolve({
          url: urlStr,
          status: 0,
          ttfbMs: 0,
          totalMs: 5000,
          sizeBytes: 0,
          error: error.message,
        });
        return;
      }

      const parts = stdout.trim().split(/\s+/);
      if (parts.length < 4 || parts[0] === '000') {
        resolve({
          url: urlStr,
          status: 0,
          ttfbMs: 0,
          totalMs: 5000,
          sizeBytes: 0,
          error: stdout.trim() || 'Connection failed or timeout',
        });
        return;
      }

      const status = parseInt(parts[0], 10);
      const ttfbMs = parseFloat(parts[1]) * 1000;
      const totalMs = parseFloat(parts[2]) * 1000;
      const sizeBytes = parseInt(parts[3], 10);

      resolve({
        url: urlStr,
        status,
        ttfbMs,
        totalMs,
        sizeBytes,
        error: null,
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
