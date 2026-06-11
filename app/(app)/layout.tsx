import Link from 'next/link';
import { NavLinks } from './nav-links';

function TeeMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <path
        d="M8 3 3.5 6.5 5.8 10l1.7-1v11h9V9l1.7 1 2.3-3.5L16 3c-.7 1.2-2.2 2-4 2s-3.3-.8-4-2Z"
        fill="oklch(0.62 0.175 38)"
        stroke="oklch(0.42 0.12 38)"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <nav className="stitch-b sticky top-0 z-40 border-b bg-card/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/" className="press flex items-center gap-2">
            <TeeMark />
            <span className="font-display text-base font-bold tracking-tight">
              DagsThreads <span className="text-primary">Studio</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <NavLinks />
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="press rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
