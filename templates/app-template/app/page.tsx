// Placeholder home page — the Codex agent replaces this on the initial build.
// Styled as a live example of DESIGN.md (monochrome, pill, hairline card).
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-md rounded-card border border-hairline bg-canvas p-8 text-center">
        <h1 className="text-2xl font-semibold text-ink">Nothing here yet</h1>
        <p className="mt-2 text-body">
          The community has not built this app yet. Ask for something with{' '}
          <code className="rounded-chip bg-surface-soft px-2 py-0.5 text-sm">/build</code>
        </p>
      </div>
    </main>
  );
}
