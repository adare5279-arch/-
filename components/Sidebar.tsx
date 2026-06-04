'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCommittee } from '@/lib/CommitteeContext';
import { COMMITTEES } from '@/lib/types';

const NAV_SECTIONS = [
  {
    title: '종합 현황',
    items: [{ label: '대시보드', href: '/' }],
  },
  {
    title: '자료 · 부서',
    items: [
      { label: '자료요구', href: '/docs' },
      { label: '소관부서', href: '/dept' },
      { label: '의원명부', href: '/members' },
      { label: '회의록', href: '/meetings' },
    ],
  },
  {
    title: '감사 진행',
    items: [
      { label: '지적사항', href: '/issues' },
      { label: '증인·참고인', href: '/witnesses' },
      { label: '결과보고서', href: '/report' },
    ],
  },
  {
    title: '도구',
    items: [{ label: 'AI 질의서', href: '/query' }],
  },
] as const;

export default function Sidebar() {
  const pathname = usePathname();
  const { committee, setCommittee } = useCommittee();

  return (
    <aside
      className="w-64 min-h-screen flex flex-col"
      style={{ backgroundColor: '#1F4E79', color: '#ffffff' }}
    >
      {/* Brand block */}
      <div className="px-5 py-6 border-b border-white/20">
        <p className="text-xs text-white/70 font-medium mb-1">경기도의회</p>
        <p className="text-sm font-bold leading-snug">행정사무감사 자료관리</p>
      </div>

      {/* Committee selector */}
      <div className="px-4 py-4 border-b border-white/20">
        <label className="block text-xs text-white/70 mb-1 font-medium">
          위원회 선택
        </label>
        <select
          value={committee}
          onChange={(e) => setCommittee(e.target.value)}
          className="w-full rounded px-2 py-1.5 text-sm bg-white text-gray-900 border-0 focus:outline-none focus:ring-2 focus:ring-white/50"
        >
          {COMMITTEES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mb-2">
            <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-white/50">
              {section.title}
            </p>
            {section.items.map(({ label, href }) => {
              const isActive =
                href === '/' ? pathname === '/' : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={[
                    'block rounded px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-white/15 text-white'
                      : 'text-white/80 hover:bg-white/10 hover:text-white',
                  ].join(' ')}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
