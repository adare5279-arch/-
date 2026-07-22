'use client';

import { useState } from 'react';

// 경기도의회 인터넷방송(생방송·영상회의록)
// live.ggc.go.kr 는 X-Frame-Options/CSP 프레임 제한이 없어 iframe 임베드가 가능하다.
const LIVE_BASE = 'https://live.ggc.go.kr';
const ONAIR_URL = `${LIVE_BASE}/onair/onair.do`;

type LinkCard = { label: string; href: string; desc: string };

const QUICK_LINKS: LinkCard[] = [
  {
    label: '생방송 일정',
    href: `${LIVE_BASE}/onair/schedule.do`,
    desc: '이번 달 생중계 예정 일정',
  },
  {
    label: '생방송 다시보기',
    href: `${LIVE_BASE}/etc/replay.do`,
    desc: '방송 종료분 되감기 보기',
  },
  {
    label: '영상회의록 — 본회의',
    href: 'https://kms.ggc.go.kr/caster/content/vms/plenarysessionVod.do',
    desc: '본회의 회의영상 VOD',
  },
  {
    label: '영상회의록 — 상임위원회',
    href: 'https://kms.ggc.go.kr/caster/content/vms/stdcommitteeVod.do?daesu=11',
    desc: '상임위원회 회의영상 VOD',
  },
  {
    label: '영상회의록 — 특별위원회',
    href: 'https://kms.ggc.go.kr/caster/content/vms/specialcommitteeVod.do?confcode=G&daesu=11',
    desc: '예결위·특위 회의영상 VOD',
  },
  {
    label: '대집행부질문 · 5분자유발언',
    href: `${LIVE_BASE}/etc/questionVodList.do`,
    desc: '주요 발언 영상 모음',
  },
];

export default function LivePage() {
  // 새로고침 시 iframe만 다시 로드하기 위한 키
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-[#1F4E79]">인터넷 의사중계</h1>
          <p className="text-xs text-gray-500 mt-1">
            경기도의회 본회의·상임위원회 회의를 실시간으로 시청합니다. 생중계는 회의 진행
            시간에만 송출되며, 종료된 회의는 영상회의록(VOD)에서 다시 볼 수 있습니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            새로고침
          </button>
          <a
            href={ONAIR_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-[#1F4E79] px-4 py-2 text-sm font-medium text-white hover:bg-[#163a5f] transition-colors"
          >
            새 창에서 열기 ↗
          </a>
        </div>
      </div>

      {/* 생방송 임베드 */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <iframe
          key={reloadKey}
          src={ONAIR_URL}
          title="경기도의회 인터넷 의사중계 생방송"
          className="w-full h-[78vh] min-h-[560px] border-0"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
      <p className="text-xs text-gray-400">
        위 화면은 경기도의회 인터넷방송(
        <a
          href={LIVE_BASE}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#1F4E79] underline"
        >
          live.ggc.go.kr
        </a>
        )을 그대로 불러온 것입니다. 화면 왼쪽의 위원회 목록에서 시청할 회의를 선택하세요.
        영상이 보이지 않으면 <strong>새 창에서 열기</strong>로 확인해 주세요.
      </p>

      {/* 바로가기 */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-3">
        <h2 className="text-base font-semibold text-[#1F4E79]">바로가기</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {QUICK_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg border border-gray-200 p-3 hover:border-[#1F4E79]/40 hover:shadow-sm transition-all"
            >
              <p className="text-sm font-medium text-[#1F4E79] flex items-center gap-1">
                {l.label}
                <span aria-hidden className="text-gray-400">
                  ↗
                </span>
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{l.desc}</p>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
