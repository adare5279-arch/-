'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCommittee } from '@/lib/CommitteeContext';
import { COMMITTEES } from '@/lib/types';

const NAV_SECTIONS = [
  {
    title: '종합 현황',
    items: [
      { label: '대시보드', href: '/' },
      { label: '감사 일정', href: '/calendar' },
      { label: '활동 통계', href: '/stats' },
    ],
  },
  {
    title: '자료 · 부서',
    items: [
      { label: '자료요구', href: '/docs' },
      { label: '소관부서', href: '/dept' },
      { label: '의원명부', href: '/members' },
      { label: '회의록', href: '/meetings' },
      { label: '보도자료', href: '/press' },
    ],
  },
  {
    title: '감사 진행',
    items: [
      { label: '지적사항', href: '/issues' },
      { label: '증인·참고인', href: '/witnesses' },
      { label: '결과보고서', href: '/report' },
      { label: '근거법령', href: '/laws' },
    ],
  },
  {
    title: '도구',
    items: [
      { label: '통합 검색', href: '/search' },
      { label: 'AI 질의서', href: '/query' },
      { label: '변경 이력·백업', href: '/history' },
    ],
  },
] as const;

function isItemActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export default function TopNav() {
  const pathname = usePathname();
  const { committee, setCommittee } = useCommittee();
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);

  // 라우트 변경 시 메뉴 닫기
  useEffect(() => {
    setOpenMenu(null);
    setMobileOpen(false);
  }, [pathname]);

  // 바깥 클릭 시 데스크톱 드롭다운 닫기
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const committeeSelect = (
    <label className="flex items-center gap-2 text-xs">
      <span className="text-white/70 md:text-gray-500 whitespace-nowrap font-medium">위원회</span>
      <select
        value={committee}
        onChange={(e) => setCommittee(e.target.value)}
        className="rounded px-2 py-1.5 text-sm bg-white text-gray-900 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1F4E79]/40 max-w-[10rem]"
      >
        {COMMITTEES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <header className="sticky top-0 z-40 print:hidden">
      {/* 상단 브랜드 바 */}
      <div className="bg-white border-b border-gray-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-20 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 sm:gap-4 min-w-0">
            {/* 경기도의회 공식 로고(엠블럼+워드마크) */}
            <Image
              src="/ggc-logo.png"
              alt="경기도의회"
              width={160}
              height={50}
              priority
              className="h-9 sm:h-11 w-auto shrink-0"
            />
            <span className="hidden sm:block h-9 w-px bg-gray-200" aria-hidden="true" />
            <span className="text-base sm:text-2xl font-extrabold text-[#1F4E79] leading-tight truncate">
              행정사무감사 자료관리
            </span>
          </Link>

          {/* 데스크톱: 위원회 선택 */}
          <div className="hidden md:block">{committeeSelect}</div>

          {/* 모바일: 햄버거 */}
          <button
            type="button"
            aria-label="메뉴 열기"
            onClick={() => setMobileOpen((s) => !s)}
            className="md:hidden rounded p-2 text-[#1F4E79] hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#1F4E79]/40"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {mobileOpen ? (
                <>
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </>
              ) : (
                <>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* 데스크톱: 가로 내비게이션 바 */}
      <nav
        ref={navRef}
        className="hidden md:block text-white"
        style={{ backgroundColor: '#1F4E79' }}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 flex">
          {NAV_SECTIONS.map((section, idx) => {
            const sectionActive = section.items.some((it) => isItemActive(pathname, it.href));
            const isOpen = openMenu === idx;
            return (
              <div
                key={section.title}
                className="relative"
                onMouseEnter={() => setOpenMenu(idx)}
                onMouseLeave={() => setOpenMenu((cur) => (cur === idx ? null : cur))}
              >
                <button
                  type="button"
                  onClick={() => setOpenMenu((cur) => (cur === idx ? null : idx))}
                  className={[
                    'px-5 py-3.5 text-sm font-semibold transition-colors',
                    sectionActive || isOpen ? 'bg-white/15' : 'hover:bg-white/10',
                  ].join(' ')}
                >
                  {section.title}
                </button>
                {/* 드롭다운 */}
                {isOpen && (
                  <div className="absolute left-0 top-full min-w-[12rem] rounded-b-lg border border-gray-200 bg-white py-1 shadow-lg">
                    {section.items.map(({ label, href }) => {
                      const active = isItemActive(pathname, href);
                      return (
                        <Link
                          key={href}
                          href={href}
                          className={[
                            'block px-4 py-2.5 text-sm transition-colors',
                            active
                              ? 'bg-[#1F4E79]/10 text-[#1F4E79] font-semibold'
                              : 'text-gray-700 hover:bg-gray-50',
                          ].join(' ')}
                        >
                          {label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      {/* 모바일: 펼침 메뉴 */}
      {mobileOpen && (
        <div className="md:hidden border-t border-white/10 text-white" style={{ backgroundColor: '#1F4E79' }}>
          <div className="px-4 py-3 border-b border-white/15">{committeeSelect}</div>
          <nav className="px-2 py-3 max-h-[70vh] overflow-y-auto">
            {NAV_SECTIONS.map((section) => (
              <div key={section.title} className="mb-2">
                <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-white/50">
                  {section.title}
                </p>
                {section.items.map(({ label, href }) => {
                  const active = isItemActive(pathname, href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={[
                        'block rounded px-3 py-2 text-sm font-medium transition-colors',
                        active ? 'bg-white/15 text-white' : 'text-white/80 hover:bg-white/10',
                      ].join(' ')}
                    >
                      {label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
