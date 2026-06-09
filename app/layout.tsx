import type { Metadata } from 'next';
import './globals.css';
import { CommitteeProvider } from '@/lib/CommitteeContext';
import TopNav from '@/components/TopNav';
import Footer from '@/components/Footer';

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
      <body className="flex flex-col min-h-screen bg-gray-50">
        <CommitteeProvider>
          <TopNav />
          <main className="flex-1 min-w-0">
            <div className="mx-auto max-w-7xl">{children}</div>
          </main>
          <Footer />
        </CommitteeProvider>
      </body>
    </html>
  );
}
