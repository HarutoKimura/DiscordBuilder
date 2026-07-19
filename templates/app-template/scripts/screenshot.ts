// Screenshot capture for the quality loop (see AGENTS.md).
// Usage: pnpm screenshot [route ...]   (default: "/")
// Requires the dev server to be running (BASE_URL, default http://localhost:3000).
// Writes PNGs to screenshots/, named after the route.
// Exits non-zero when a route cannot be reached or returns an HTTP error status,
// so a broken page fails the quality loop instead of being captured as "success".
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';
const routes = process.argv.slice(2);
if (routes.length === 0) routes.push('/');

function fileNameFor(route: string): string {
  const slug = route === '/' ? 'home' : route.replace(/^\//, '').replace(/[^a-zA-Z0-9_-]+/g, '-');
  return `screenshots/${slug}.png`;
}

async function main(): Promise<void> {
  mkdirSync('screenshots', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const failures: string[] = [];
  for (const route of routes) {
    const url = new URL(route, baseUrl).toString();
    // Two attempts per route: the first request compiles the route in dev mode
    // and can outlast the timeout on a cold cache; the retry is then fast.
    let captured = false;
    let lastError = '';
    for (let attempt = 1; attempt <= 2 && !captured; attempt++) {
      try {
        const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
        if (!response || response.status() >= 400) {
          lastError = response ? `HTTP ${response.status()}` : 'no response from server';
          continue;
        }
        await page.waitForTimeout(1200); // let charts settle (recharts animates ~1.5s from mount)
        const path = fileNameFor(route);
        await page.screenshot({ path, fullPage: true });
        console.log(`captured ${url} -> ${path}`);
        captured = true;
      } catch (err) {
        lastError = err instanceof Error ? (err.message.split('\n')[0] ?? err.message) : String(err);
      }
    }
    if (!captured) {
      console.error(`FAILED ${url}: ${lastError}`);
      failures.push(`${route} (${lastError})`);
    }
  }
  await browser.close();
  if (failures.length > 0) {
    console.error(
      `screenshot failed for: ${failures.join(', ')} — the page is broken or the dev server is not running.`,
    );
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error('screenshot failed:', err);
  process.exit(1);
});
