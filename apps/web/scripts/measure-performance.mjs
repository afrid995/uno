import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

async function measurePage(browser, name, url) {
  // Cold cache
  const coldContext = await browser.newContext();
  const coldPage = await coldContext.newPage();
  
  let transferredBytes = 0;
  let resourceCount = 0;
  coldPage.on('response', async (res) => {
    try {
      const headers = res.headers();
      const length = headers['content-length'] ? parseInt(headers['content-length'], 10) : 0;
      transferredBytes += length;
      resourceCount++;
    } catch {
      // ignore
    }
  });

  const start = Date.now();
  await coldPage.goto(url, { waitUntil: 'networkidle' });
  const loadDuration = Date.now() - start;

  const metrics = await coldPage.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const paint = performance.getEntriesByType('paint');
    const fcp = paint.find(p => p.name === 'first-contentful-paint')?.startTime || 0;
    const domContentLoaded = nav?.domContentLoadedEventEnd || 0;
    const complete = nav?.loadEventEnd || 0;

    return {
      fcp: Math.round(fcp),
      domContentLoaded: Math.round(domContentLoaded),
      complete: Math.round(complete),
    };
  });

  await coldContext.close();

  // Warm cache
  const warmContext = await browser.newContext();
  const warmPage = await warmContext.newPage();
  await warmPage.goto(url, { waitUntil: 'networkidle' });
  const warmStart = Date.now();
  await warmPage.reload({ waitUntil: 'networkidle' });
  const warmLoadDuration = Date.now() - warmStart;
  const warmMetrics = await warmPage.evaluate(() => {
    const paint = performance.getEntriesByType('paint');
    return {
      fcp: Math.round(paint.find(p => p.name === 'first-contentful-paint')?.startTime || 0),
    };
  });
  await warmContext.close();

  return {
    name,
    loadDuration,
    fcpCold: metrics.fcp,
    fcpWarm: warmMetrics.fcp,
    domContentLoaded: metrics.domContentLoaded,
    complete: metrics.complete,
    transferredBytes,
    resourceCount,
  };
}

async function run() {
  console.log('Measuring actual browser performance...');
  const browser = await chromium.launch({
    executablePath: 'C:\\Users\\Shaik Afrid\\AppData\\Local\\ms-playwright\\chromium-1254\\chrome-win64\\chrome.exe',
    headless: true
  });

  const landing = await measurePage(browser, 'Landing Page', 'http://localhost:5173/');
  console.log('Landing Page metrics:', landing);

  await browser.close();

  // Calculate bundle assets stats
  const distDir = path.resolve('apps/web/dist/assets');
  let totalJsSize = 0;
  let totalCssSize = 0;
  const jsFiles = [];

  if (fs.existsSync(distDir)) {
    const files = fs.readdirSync(distDir);
    files.forEach(f => {
      const full = path.join(distDir, f);
      const stat = fs.statSync(full);
      if (f.endsWith('.js')) {
        totalJsSize += stat.size;
        jsFiles.push({ file: f, size: (stat.size / 1024).toFixed(2) + ' kB' });
      } else if (f.endsWith('.css')) {
        totalCssSize += stat.size;
      }
    });
  }

  const results = {
    landing,
    bundle: {
      totalJsRawKb: (totalJsSize / 1024).toFixed(2),
      totalCssRawKb: (totalCssSize / 1024).toFixed(2),
      jsChunks: jsFiles,
    }
  };

  fs.writeFileSync('reports/performance-metrics.json', JSON.stringify(results, null, 2));
  console.log('Performance metrics recorded to reports/performance-metrics.json');
}

run().catch(console.error);
