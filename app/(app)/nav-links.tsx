'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/batches/new', label: 'Generate' },
  { href: '/listings', label: 'Listings' },
  { href: '/settings', label: 'Settings' },
] as const;

export function NavLinks() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    // /batches/[id] review pages belong to Generate's flow
    if (href === '/batches/new') return pathname.startsWith('/batches');
    return pathname.startsWith(href);
  }

  return (
    <div className="flex items-center gap-1 text-sm">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={
            'press rounded-full px-3.5 py-1.5 transition-colors ' +
            (isActive(l.href)
              ? 'bg-accent font-medium text-accent-foreground'
              : 'text-muted-foreground hover:bg-secondary hover:text-foreground')
          }
        >
          {l.label}
        </Link>
      ))}
    </div>
  );
}
