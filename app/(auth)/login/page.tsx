'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      setError('Invalid password');
      return;
    }
    router.push('/');
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="anim-rise w-full max-w-sm space-y-5 rounded-2xl border bg-card p-8 shadow-[0_12px_40px_-16px_oklch(0.26_0.015_50_/_0.25)]"
      >
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
          <p className="text-sm text-muted-foreground">From slogan to Etsy listing.</p>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-lg border bg-background px-3 py-2.5 outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/30"
          autoFocus
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button
          type="submit"
          className="press w-full rounded-lg bg-primary px-3 py-2.5 font-medium text-primary-foreground shadow-sm hover:opacity-92"
        >
          Open the studio
        </button>
      </form>
    </main>
  );
}
