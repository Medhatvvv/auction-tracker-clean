import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Auction Watch — e-leiloes.pt',
  description: 'Live tracker for e-leiloes.pt auctions',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-app text-ink">
        <header className="bg-surface border-b border-line">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <a href="/" className="flex items-baseline gap-3">
              <span className="font-display text-2xl italic text-ink">Auction</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-accent">
                watch
              </span>
            </a>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
              e-leiloes.pt
            </span>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
