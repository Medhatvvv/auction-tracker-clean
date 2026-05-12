import './globals.css';
import type { ReactNode } from 'react';
import Sidebar from '@/components/Sidebar';

export const metadata = {
  title: 'Auction Watch — e-leiloes.pt',
  description: 'Auction tracker dashboard',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-app text-ink">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 px-8 py-6 max-w-[1400px]">{children}</main>
        </div>
      </body>
    </html>
  );
}
