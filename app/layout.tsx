import type { Metadata } from 'next';
import './globals.css';
import { CommitteeProvider } from '@/lib/CommitteeContext';
import TopNav from '@/components/TopNav';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: '경기도의회 행정사무감사 자료관리',
  description: '행정사무감사 자료관리 시스템',
};

const SUPABASE_ORIGIN =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mrfcwyfpkreicemwxhrv.supabase.co';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        {/* 첫 데이터 조회가 빨라지도록 Supabase에 미리 연결(DNS·TLS 선처리) */}
        <link rel="preconnect" href={SUPABASE_ORIGIN} crossOrigin="anonymous" />
        {/* Pretendard 폰트를 CDN에서 병렬 로드 (미리 연결해 지연 최소화) */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        />
      </head>
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
