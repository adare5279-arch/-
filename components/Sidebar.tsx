'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCommittee } from '@/lib/CommitteeContext';
import { COMMITTEES } from '@/lib/types';

const NAV_ITEMS = [
  { label: '대시보드', href: '/' },
  { label: '회의록', href: '/meetings' },
  { label: '의원명부', href: '/members' },
  { label: '자료요구', href: '/docs' },
  { label: 'AI 질의서', href: '/query' },
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
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        {NAV_ITEMS.map(({ label, href }) => {
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
      </nav>
    </aside>
  );
}
