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
    <main className="flex min-h-screen items-center justify-center bg-zinc-50">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-xl bg-white p-8 shadow">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-md border px-3 py-2"
          autoFocus
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="w-full rounded-md bg-black px-3 py-2 text-white">
          Continue
        </button>
      </form>
    </main>
  );
}
