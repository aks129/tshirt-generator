import Link from 'next/link';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50">
      <nav className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/" className="text-base font-semibold">Tee Generator</Link>
          <div className="flex gap-4 text-sm">
            <Link href="/" className="text-zinc-700 hover:text-zinc-900">Dashboard</Link>
            <Link href="/batches/new" className="text-zinc-700 hover:text-zinc-900">Generate</Link>
            <Link href="/settings" className="text-zinc-700 hover:text-zinc-900">Settings</Link>
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="text-zinc-500 hover:text-zinc-900">Sign out</button>
            </form>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
