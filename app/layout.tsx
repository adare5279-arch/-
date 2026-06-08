import type { Metadata } from 'next';
import './globals.css';
import { CommitteeProvider } from '@/lib/CommitteeContext';
import Sidebar from '@/components/Sidebar';

export const metadata: Metadata = {
  title: '경기도의회 행정사무감사 자료관리',
  description: '행정사무감사 자료관리 시스템',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="flex flex-row min-h-screen">
        <CommitteeProvider>
          <Sidebar />
          <main className="flex-1 min-w-0 min-h-screen bg-gray-50 overflow-auto pt-14 md:pt-0">
            {children}
          </main>
        </CommitteeProvider>
      </body>
    </html>
  );
}
