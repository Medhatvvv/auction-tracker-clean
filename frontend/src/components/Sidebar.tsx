'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

const NAV = [
  { href: '/',       label: 'Dashboard',        icon: '◫' },
  { href: '/active', label: 'Active auctions',  icon: '◉' },
  { href: '/ended',  label: 'Ended auctions',   icon: '○' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 bg-surface border-r border-line flex flex-col">
      <div className="px-5 py-5 border-b border-line">
        <div className="flex items-baseline gap-2">
          <span className="font-display italic text-2xl text-ink">Auction</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-accent">
            watch
          </span>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted mt-1">
          e-leiloes.pt
        </p>
      </div>

      <nav className="flex-1 px-3 py-4">
        {NAV.map(item => {
          const active =
            (item.href === '/' && pathname === '/') ||
            (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 mb-1 rounded text-sm transition-colors
                ${active
                  ? 'bg-accent/10 text-accent font-semibold'
                  : 'text-ink/70 hover:bg-slate-50 hover:text-ink'}`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-3 border-t border-line">
        <p className="font-mono text-[9px] uppercase tracking-widest text-muted">
          v3 · 30-min check mode
        </p>
      </div>
    </aside>
  );
}
