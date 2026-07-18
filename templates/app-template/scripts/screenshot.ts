// Screenshot capture for the quality loop (see AGENTS.md).
// Usage: pnpm screenshot [route ...]   (default: "/")
// Requires the dev server to be running (BASE_URL, default http://localhost:3000).
// Writes PNGs to screenshots/, named after the route.
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
  for (const route of routes) {
    const url = new URL(route, baseUrl).toString();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    const path = fileNameFor(route);
    await page.screenshot({ path, fullPage: true });
    console.log(`captured ${url} -> ${path}`);
  }
  await browser.close();
}

main().catch((err: unknown) => {
  console.error('screenshot failed:', err);
  process.exit(1);
});
