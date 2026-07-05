export function AuthShell({ subtitle, children }: { subtitle: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="anim-rise w-full max-w-sm space-y-5 rounded-2xl border bg-card p-8 shadow-[0_12px_40px_-16px_oklch(0.26_0.015_50_/_0.25)]">
        <div className="space-y-1.5">
          <svg viewBox="0 0 24 24" className="h-10 w-10" aria-hidden="true">
            <path
              d="M8 3 3.5 6.5 5.8 10l1.7-1v11h9V9l1.7 1 2.3-3.5L16 3c-.7 1.2-2.2 2-4 2s-3.3-.8-4-2Z"
              fill="oklch(0.62 0.175 38)"
              stroke="oklch(0.42 0.12 38)"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </svg>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            DagsThreads <span className="text-primary">Studio</span>
          </h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {children}
      </div>
    </main>
  );
}

export const authInputClass =
  'w-full rounded-lg border bg-background px-3 py-2.5 outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/30';

export const authButtonClass =
  'press w-full rounded-lg bg-primary px-3 py-2.5 font-medium text-primary-foreground shadow-sm hover:opacity-92 disabled:opacity-60';
