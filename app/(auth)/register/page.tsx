'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthShell, authInputClass, authButtonClass } from '../auth-shell';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signupCode, setSignupCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, signupCode: signupCode.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || 'Registration failed');
        return;
      }
      router.push('/');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell subtitle="Create your studio (invite-only beta).">
      <form onSubmit={onSubmit} className="space-y-4">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          autoComplete="email"
          className={authInputClass}
          autoFocus
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (min 8 characters)"
          autoComplete="new-password"
          className={authInputClass}
        />
        <input
          type="text"
          value={signupCode}
          onChange={(e) => setSignupCode(e.target.value)}
          placeholder="Invite code"
          className={authInputClass}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button type="submit" disabled={busy} className={authButtonClass}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
