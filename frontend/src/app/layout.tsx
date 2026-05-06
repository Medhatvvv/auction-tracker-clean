import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Auction Watch — e-leiloes.pt',
  description: 'Live tracker for e-leiloes.pt auctions',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen relative">
        <div className="relative z-10">
          <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
            <a href="/" className="flex items-baseline gap-3">
              <span className="font-display text-2xl italic">Auction</span>
              <span className="font-mono text-xs uppercase tracking-[0.25em] text-accent">
                watch
              </span>
            </a>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
              e-leiloes.pt
            </span>
          </header>
          <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
