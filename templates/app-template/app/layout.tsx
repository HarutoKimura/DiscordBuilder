import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

// Every page renders on demand: `next build` must never prerender against the
// SQLite DB, and pages must always show fresh data (see AGENTS.md). Do not remove.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'DiscordBuilder App',
  description: 'Built by your community with DiscordBuilder',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
        {children}
      </body>
    </html>
  );
}
