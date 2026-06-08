'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useCommittee } from '@/lib/CommitteeContext';
import { exportSheet } from '@/lib/exportXlsx';
import { downloadAsDoc, escapeHtml } from '@/lib/exportDoc';
import { extractText, UPLOAD_ACCEPT } from '@/lib/extractText';
import {
  ISSUE_TYPES,
  ISSUE_PROCS,
  WITNESS_KINDS,
  WITNESS_ATTENDS,
  REQUEST_STATUSES,
} from '@/lib/types';
import type { Issue, Witness, MaterialRequest } from '@/lib/types';

type SectionKind = 'text' | 'issues' | 'witnesses';

type SectionDef = {
  key: string;
  no: string;
  title: string;
  kind: SectionKind;
  hint: string;
};

const SECTIONS: SectionDef[] = [
  { key: 'overview', no: 'Ⅰ', title: '감사 개요', kind: 'text', hint: '감사 목적·대상기관·기간·감사반 편성·중점사항' },
  { key: 'summary', no: 'Ⅱ', title: '감사 결과 총평', kind: 'text', hint: '감사 전반에 대한 종합 의견' },
  { key: 'corrections', no: 'Ⅲ', title: '시정 및 처리 요구사항', kind: 'issues', hint: '지적사항 화면 데이터가 표로 자동 삽입됩니다 (보충 설명만 업로드)' },
  { key: 'suggestions', no: 'Ⅳ', title: '건의사항', kind: 'text', hint: '집행부에 대한 건의사항' },
  { key: 'policy', no: 'Ⅴ', title: '정책제언', kind: 'text', hint: '정책연구과제·제언사항' },
  { key: 'witnesses', no: 'Ⅵ', title: '증인·참고인 채택 및 출석현황', kind: 'witnesses', hint: '증인·참고인 화면 데이터가 표로 자동 삽입됩니다 (보충 설명만 업로드)' },
  { key: 'schedule', no: 'Ⅶ', title: '행정사무감사 일정', kind: 'text', hint: '일자별 감사 일정' },
];

type SectionRow = {
  content: string;
  file_name: string | null;
  file_url: string | null;
};

type SectionMap = Record<string, SectionRow>;

const EMPTY_ROW: SectionRow = { content: '', file_name: null, file_url: null };

export default function ReportPage() {
  const { committee } = useCommittee();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [witnesses, setWitnesses] = useState<Witness[]>([]);
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [sections, setSections] = useState<SectionMap>({});
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);

  const loadSections = useCallback(async () => {
    const { data } = await supabase
      .from('report_sections')
      .select('section_key, content, file_name, file_url')
      .eq('committee', committee);
    const map: SectionMap = {};
    (data ?? []).forEach((r) => {
      map[r.section_key] = {
        content: r.content ?? '',
        file_name: r.file_name ?? null,
        file_url: r.file_url ?? null,
      };
    });
    setSections(map);
  }, [committee]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [issRes, witRes, reqRes] = await Promise.all([
        supabase.from('issues').select('*').eq('committee', committee).order('date'),
        supabase.from('witnesses').select('*').eq('committee', committee).order('dt'),
        supabase.from('material_requests').select('*').eq('committee', committee),
      ]);
      if (cancelled) return;
      setIssues((issRes.data as Issue[]) ?? []);
      setWitnesses((witRes.data as Witness[]) ?? []);
      setRequests((reqRes.data as MaterialRequest[]) ?? []);
      await loadSections();
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [committee, loadSections]);

  const getRow = (key: string): SectionRow => sections[key] ?? EMPTY_ROW;

  function handleExport() {
    exportSheet(`결과보고서_${committee}`, '지적사항', issues, [
      { header: '일자', value: (r) => r.date ?? '' },
      { header: '부서', value: (r) => r.dept ?? '' },
      { header: '유형', value: (r) => r.type },
      { header: '지적내용', value: (r) => r.content },
      { header: '시정·조치요구', value: (r) => r.action ?? '' },
      { header: '처리상태', value: (r) => r.proc },
    ]);
  }

  const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0);

  // ── 자동 집계 ──────────────────────────────────────────────
  const typeCounts = ISSUE_TYPES.map((t) => ({
    type: t,
    count: issues.filter((i) => i.type === t).length,
  })).filter((x) => x.count > 0);

  const procCounts = ISSUE_PROCS.map((p) => ({
    proc: p,
    count: issues.filter((i) => i.proc === p).length,
  }));
  const issuesDone = issues.filter((i) => i.proc === '처리완료').length;
  const issueRate = pct(issuesDone, issues.length);

  const deptCounts = (() => {
    const map = new Map<string, number>();
    issues.forEach((i) => {
      const d = i.dept?.trim() || '미지정';
      map.set(d, (map.get(d) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([dept, count]) => ({ dept, count }))
      .sort((a, b) => b.count - a.count);
  })();

  const witnessKindCounts = WITNESS_KINDS.map((k) => ({
    kind: k,
    count: witnesses.filter((w) => w.kind === k).length,
  }));
  const witnessAttendCounts = WITNESS_ATTENDS.map((a) => ({
    attend: a,
    count: witnesses.filter((w) => w.attend === a).length,
  }));
  const witnessAttended = witnesses.filter((w) => w.attend === '출석완료').length;
  const witnessRate = pct(witnessAttended, witnesses.length);

  const reqStatusCounts = REQUEST_STATUSES.map((s) => ({
    status: s,
    count: requests.filter((r) => r.status === s).length,
  }));
  const reqSubmitted = requests.filter((r) => r.status === '제출완료').length;
  const reqRate = pct(reqSubmitted, requests.length);

  // 총평 초안 자동 생성 문구
  const autoSummary = (() => {
    const year = new Date().getFullYear();
    const parts: string[] = [];
    parts.push(`${committee}는 ${year}년도 행정사무감사를 실시하였다.`);
    if (issues.length > 0) {
      const typeStr = typeCounts.map((t) => `${t.type} ${t.count}건`).join(', ');
      parts.push(
        `감사 결과 총 ${issues.length}건의 지적사항을 발굴하였으며, 유형별로는 ${typeStr}이다.`
      );
      const proc = procCounts
        .filter((p) => p.count > 0)
        .map((p) => `${p.proc} ${p.count}건`)
        .join(', ');
      parts.push(`처리현황은 ${proc}으로, 처리율은 ${issueRate}%이다.`);
      if (deptCounts.length > 0) {
        const top = deptCounts[0];
        parts.push(`부서별로는 ${top.dept}이(가) ${top.count}건으로 가장 많은 지적을 받았다.`);
      }
    } else {
      parts.push('금번 감사에서 시정·처리를 요구하는 지적사항은 발굴되지 않았다.');
    }
    if (witnesses.length > 0) {
      parts.push(
        `증인·참고인은 총 ${witnesses.length}명을 채택하여 ${witnessAttended}명이 출석하였다(출석률 ${witnessRate}%).`
      );
    }
    if (requests.length > 0) {
      parts.push(
        `자료요구는 총 ${requests.length}건 중 ${reqSubmitted}건이 제출 완료되었다(제출률 ${reqRate}%).`
      );
    }
    parts.push(
      '본 위원회는 지적사항에 대한 집행부의 성실한 시정 조치와 그 결과의 차기 회기 보고를 요구한다.'
    );
    return parts.join(' ');
  })();

  function handleHwp() {
    const year = new Date().getFullYear();
    const esc = escapeHtml;
    const parts: string[] = [];

    // 표지
    parts.push(
      `<h1>${year}년도 행정사무감사 결과보고서</h1>`,
      `<p class="center" style="font-size:13pt;font-weight:bold;">${esc(committee)}</p>`,
      `<p class="center muted">작성일: ${new Date().toISOString().slice(0, 10)}</p>`,
      '<hr/>',
    );

    // 목차
    parts.push('<h2>목 차</h2>', '<p>');
    SECTIONS.forEach((s) => parts.push(`${s.no}. ${esc(s.title)}<br/>`));
    parts.push('</p>');

    // 요약
    parts.push(
      '<h2>감사 결과 요약</h2>',
      '<table><tr><th>구분</th><th>건수</th><th>처리·출석·제출</th></tr>',
      `<tr><td>지적사항</td><td class="center">${issues.length}건</td><td>처리완료 ${issuesDone}건 (${issueRate}%)</td></tr>`,
      `<tr><td>증인·참고인</td><td class="center">${witnesses.length}명</td><td>출석 ${witnessAttended}명 (${witnessRate}%)</td></tr>`,
      `<tr><td>자료요구</td><td class="center">${requests.length}건</td><td>제출 ${reqSubmitted}건 (${reqRate}%)</td></tr>`,
      '</table>',
    );

    const countTable = (title: string, rows: { label: string; count: number }[], foot?: string) => {
      const body = rows
        .map((r) => `<tr><td>${esc(r.label)}</td><td class="center">${r.count}</td></tr>`)
        .join('');
      return `<h3>${esc(title)}</h3><table><tr><th>구분</th><th>건수</th></tr>${body}</table>${
        foot ? `<p class="muted">${esc(foot)}</p>` : ''
      }`;
    };

    parts.push('<h2>감사 결과 자동 집계</h2>');
    parts.push(countTable('지적사항 유형별', ISSUE_TYPES.map((t) => ({ label: t, count: issues.filter((i) => i.type === t).length }))));
    parts.push(countTable('지적사항 처리상태별', procCounts.map((p) => ({ label: p.proc, count: p.count })), `처리율 ${issueRate}%`));
    parts.push(countTable('부서별 지적사항', deptCounts.map((d) => ({ label: d.dept, count: d.count }))));
    parts.push(countTable('자료요구 제출현황', reqStatusCounts.map((s) => ({ label: s.status, count: s.count })), `제출률 ${reqRate}%`));

    // 본문 섹션
    SECTIONS.forEach((s) => {
      parts.push(`<h2>${s.no}. ${esc(s.title)}</h2>`);
      const row = getRow(s.key);
      const text =
        s.key === 'summary' && !row.content.trim() ? autoSummary : row.content;
      if (text.trim()) parts.push(`<p>${esc(text)}</p>`);

      if (s.kind === 'issues') {
        if (issues.length === 0) parts.push('<p class="muted">등록된 지적사항이 없습니다.</p>');
        else {
          parts.push(
            '<table><tr><th>번호</th><th>부서</th><th>유형</th><th>지적내용</th><th>시정·조치요구</th><th>처리</th></tr>',
          );
          issues.forEach((r, i) =>
            parts.push(
              `<tr><td class="center">${i + 1}</td><td>${esc(r.dept ?? '')}</td><td>${esc(r.type)}</td><td>${esc(r.content)}</td><td>${esc(r.action ?? '')}</td><td>${esc(r.proc)}</td></tr>`,
            ),
          );
          parts.push('</table>');
        }
      }

      if (s.kind === 'witnesses') {
        if (witnesses.length === 0) parts.push('<p class="muted">등록된 증인·참고인이 없습니다.</p>');
        else {
          parts.push('<table><tr><th>구분</th><th>성명</th><th>소속·직위</th><th>일시</th><th>출석</th></tr>');
          witnesses.forEach((r) =>
            parts.push(
              `<tr><td>${esc(r.kind)}</td><td>${esc(r.name)}</td><td>${esc([r.org, r.pos].filter(Boolean).join(' / '))}</td><td>${esc(r.dt ?? '')}</td><td>${esc(r.attend)}</td></tr>`,
            ),
          );
          parts.push('</table>');
        }
      }
    });

    downloadAsDoc(`행정사무감사_결과보고서_${committee}`, parts.join('\n'), `${year}년도 행정사무감사 결과보고서`);
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500 py-4 text-center">불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Toolbar (hidden in print) */}
      <div className="flex items-center justify-between gap-3 flex-wrap print:hidden">
        <h1 className="text-xl font-bold text-[#1F4E79]">결과보고서</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setEditMode((e) => !e)}
            className={`rounded-lg px-4 py-2 text-sm font-medium border transition-colors ${
              editMode
                ? 'bg-[#B45309] text-white border-[#B45309]'
                : 'bg-white text-[#B45309] border-[#B45309] hover:bg-[#B45309] hover:text-white'
            }`}
          >
            {editMode ? '편집 종료' : '목차 편집·파일 업로드'}
          </button>
          <button
            onClick={handleExport}
            disabled={issues.length === 0}
            className="rounded-lg border border-[#2E7D32] bg-white px-4 py-2 text-sm font-medium text-[#2E7D32] hover:bg-[#2E7D32] hover:text-white transition-colors disabled:opacity-40"
          >
            엑셀 저장
          </button>
          <button
            onClick={handleHwp}
            className="rounded-lg border border-[#1F4E79] bg-white px-4 py-2 text-sm font-medium text-[#1F4E79] hover:bg-[#1F4E79] hover:text-white transition-colors"
          >
            한글(HWP) 다운로드
          </button>
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-[#1F4E79] px-4 py-2 text-sm font-medium text-white hover:bg-[#163a5f] transition-colors"
          >
            PDF 저장 / 인쇄
          </button>
        </div>
      </div>

      {editMode && (
        <div className="rounded-lg border border-[#B45309]/40 bg-[#FFF7ED] p-4 text-sm text-[#7C2D12] print:hidden">
          목차별로 파일(.txt/.csv/.docx/.pdf 등)을 업로드하면 본문이 자동 추출되어 아래 보고서에 반영됩니다.
          한글(.hwp)·이미지형 PDF 등 추출이 어려운 형식은 원본 파일이 첨부 링크로 보관되며, 본문은 직접 입력·수정할 수 있습니다.
          내용 수정 후 <strong>저장</strong>을 눌러 주세요.
        </div>
      )}

      {/* Report document */}
      <div className="report-doc bg-white rounded-lg border border-gray-200 shadow-sm p-8 space-y-8 print:border-0 print:shadow-none print:p-0">
        {/* Cover */}
        <div className="text-center border-b-2 border-gray-800 pb-5">
          <p className="text-sm text-gray-500">{new Date().getFullYear()}년도</p>
          <h2 className="text-3xl font-bold text-gray-900 mt-1">행정사무감사 결과보고서</h2>
          <p className="text-base font-medium text-gray-700 mt-3">{committee}</p>
          <p className="text-xs text-gray-400 mt-2">작성일: {new Date().toISOString().slice(0, 10)}</p>
        </div>

        {/* Table of contents */}
        <nav className="border border-gray-300 rounded p-4 print:break-inside-avoid">
          <p className="font-semibold text-gray-800 mb-2">목 차</p>
          <ol className="text-sm text-gray-700 space-y-1">
            {SECTIONS.map((s) => (
              <li key={s.key}>
                {s.no}. {s.title}
              </li>
            ))}
          </ol>
        </nav>

        {/* Summary box */}
        <section className="print:break-inside-avoid">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard label="지적사항" value={`${issues.length}건`} sub={`처리완료 ${issuesDone} (${issueRate}%)`} />
            <SummaryCard label="증인·참고인" value={`${witnesses.length}명`} sub={`출석 ${witnessAttended} (${witnessRate}%)`} />
            <SummaryCard label="자료요구" value={`${requests.length}건`} sub={`제출 ${reqSubmitted} (${reqRate}%)`} />
            <SummaryCard label="유형 분포" value={`${typeCounts.length}종`} sub={typeCounts.map((t) => `${t.type}${t.count}`).join(' ') || '—'} />
          </div>
        </section>

        {/* 자동 집계 현황 */}
        <section className="space-y-4 print:break-inside-avoid">
          <h3 className="text-lg font-bold text-gray-900 border-l-4 border-[#2E7D32] pl-3">
            감사 결과 자동 집계
          </h3>
          <p className="text-xs text-gray-400 print:hidden">
            지적사항·증인·자료요구 화면의 데이터를 실시간으로 집계한 표입니다.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <CountTable
              title="지적사항 유형별"
              rows={ISSUE_TYPES.map((t) => ({
                label: t,
                count: issues.filter((i) => i.type === t).length,
              }))}
              total={issues.length}
            />
            <CountTable
              title="지적사항 처리상태별"
              rows={procCounts.map((p) => ({ label: p.proc, count: p.count }))}
              total={issues.length}
              footnote={`처리율 ${issueRate}%`}
            />
            <CountTable
              title="부서별 지적사항"
              rows={deptCounts.map((d) => ({ label: d.dept, count: d.count }))}
              total={issues.length}
            />
            <CountTable
              title="증인·참고인 출석현황"
              rows={[
                ...witnessKindCounts.map((k) => ({ label: k.kind, count: k.count })),
                ...witnessAttendCounts.map((a) => ({ label: a.attend, count: a.count })),
              ]}
              total={witnesses.length}
              footnote={`출석률 ${witnessRate}%`}
            />
            <CountTable
              title="자료요구 제출현황"
              rows={reqStatusCounts.map((s) => ({ label: s.status, count: s.count }))}
              total={requests.length}
              footnote={`제출률 ${reqRate}%`}
            />
          </div>
        </section>

        {/* Sections */}
        {SECTIONS.map((s) => (
          <section key={s.key} className="space-y-3 print:break-inside-avoid">
            <h3 className="text-lg font-bold text-gray-900 border-l-4 border-[#1F4E79] pl-3">
              {s.no}. {s.title}
            </h3>

            {editMode && (
              <SectionEditor
                committee={committee}
                section={s}
                row={getRow(s.key)}
                onSaved={loadSections}
                autofill={s.key === 'summary' ? autoSummary : undefined}
              />
            )}

            {/* Rendered body */}
            <SectionBody
              section={s}
              row={getRow(s.key)}
              issues={issues}
              witnesses={witnesses}
            />
          </section>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────── Rendered body ───────────────────────── */

function SectionBody({
  section,
  row,
  issues,
  witnesses,
}: {
  section: SectionDef;
  row: SectionRow;
  issues: Issue[];
  witnesses: Witness[];
}) {
  const hasText = row.content.trim().length > 0;

  return (
    <div className="space-y-3">
      {hasText && (
        <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{row.content}</p>
      )}

      {row.file_url && (
        <p className="text-xs text-gray-500 print:hidden">
          첨부:{' '}
          <a href={row.file_url} target="_blank" rel="noopener noreferrer" className="text-[#1F4E79] underline">
            {row.file_name ?? '원본 파일'}
          </a>
        </p>
      )}

      {section.kind === 'issues' && (
        issues.length === 0 ? (
          <p className="text-sm text-gray-400">등록된 지적사항이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full text-sm border border-gray-400 border-collapse">
            <thead>
              <tr className="bg-gray-100 text-left">
                <th className="border border-gray-400 py-2 px-3 font-semibold w-10">번호</th>
                <th className="border border-gray-400 py-2 px-3 font-semibold whitespace-nowrap">부서</th>
                <th className="border border-gray-400 py-2 px-3 font-semibold whitespace-nowrap">유형</th>
                <th className="border border-gray-400 py-2 px-3 font-semibold">지적내용</th>
                <th className="border border-gray-400 py-2 px-3 font-semibold">시정·조치요구</th>
                <th className="border border-gray-400 py-2 px-3 font-semibold whitespace-nowrap">처리</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((r, idx) => (
                <tr key={r.id} className="align-top">
                  <td className="border border-gray-400 py-2 px-3 text-center text-gray-700">{idx + 1}</td>
                  <td className="border border-gray-400 py-2 px-3 text-gray-700 whitespace-nowrap">{r.dept ?? '—'}</td>
                  <td className="border border-gray-400 py-2 px-3 text-gray-700 whitespace-nowrap">{r.type}</td>
                  <td className="border border-gray-400 py-2 px-3 text-gray-800">{r.content}</td>
                  <td className="border border-gray-400 py-2 px-3 text-gray-700">{r.action ?? '—'}</td>
                  <td className="border border-gray-400 py-2 px-3 text-gray-700 whitespace-nowrap">{r.proc}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )
      )}

      {section.kind === 'witnesses' && (
        witnesses.length === 0 ? (
          <p className="text-sm text-gray-400">등록된 증인·참고인이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full text-sm border border-gray-400 border-collapse">
            <thead>
              <tr className="bg-gray-100 text-left">
                <th className="border border-gray-400 py-2 px-3 font-semibold whitespace-nowrap">구분</th>
                <th className="border border-gray-400 py-2 px-3 font-semibold whitespace-nowrap">성명</th>
                <th className="border border-gray-400 py-2 px-3 font-semibold">소속·직위</th>
                <th className="border border-gray-400 py-2 px-3 font-semibold whitespace-nowrap">일시</th>
                <th className="border border-gray-400 py-2 px-3 font-semibold whitespace-nowrap">출석</th>
              </tr>
            </thead>
            <tbody>
              {witnesses.map((r) => (
                <tr key={r.id}>
                  <td className="border border-gray-400 py-2 px-3 text-gray-700 whitespace-nowrap">{r.kind}</td>
                  <td className="border border-gray-400 py-2 px-3 text-gray-800 whitespace-nowrap">{r.name}</td>
                  <td className="border border-gray-400 py-2 px-3 text-gray-700">{[r.org, r.pos].filter(Boolean).join(' / ') || '—'}</td>
                  <td className="border border-gray-400 py-2 px-3 text-gray-700 whitespace-nowrap">{r.dt ?? '—'}</td>
                  <td className="border border-gray-400 py-2 px-3 text-gray-700 whitespace-nowrap">{r.attend}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )
      )}

      {section.kind === 'text' && !hasText && (
        <p className="text-sm text-gray-400">내용이 없습니다. 편집 모드에서 파일을 업로드하거나 직접 입력하세요.</p>
      )}
    </div>
  );
}

/* ───────────────────────── Editor ───────────────────────── */

function SectionEditor({
  committee,
  section,
  row,
  onSaved,
  autofill,
}: {
  committee: string;
  section: SectionDef;
  row: SectionRow;
  onSaved: () => Promise<void> | void;
  autofill?: string;
}) {
  const [content, setContent] = useState(row.content);
  const [fileName, setFileName] = useState<string | null>(row.file_name);
  const [fileUrl, setFileUrl] = useState<string | null>(row.file_url);
  const [status, setStatus] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setStatus('파일 처리 중...');
    try {
      // 1) Extract body text (best-effort)
      const result = await extractText(file);
      if (result.supported) {
        setContent(result.text);
        setStatus(`본문 추출 완료 (.${result.ext})`);
      } else {
        setStatus(`.${result.ext}는 본문 자동 추출 불가 — 원본만 첨부됩니다. 본문은 직접 입력하세요.`);
      }

      // 2) Upload original to storage (ascii-safe path)
      const ext = result.ext || 'bin';
      const path = `${section.key}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('report-files')
        .upload(path, file, { upsert: true, contentType: file.type || undefined });
      if (upErr) {
        console.error('storage upload error:', upErr);
        setStatus((s) => s + ' (원본 업로드 실패)');
      } else {
        const { data: pub } = supabase.storage.from('report-files').getPublicUrl(path);
        setFileUrl(pub.publicUrl);
        setFileName(file.name);
      }
    } catch (err) {
      console.error('file handling error:', err);
      setStatus('파일 처리 중 오류가 발생했습니다.');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSave() {
    setBusy(true);
    setStatus('저장 중...');
    const { error } = await supabase.from('report_sections').upsert(
      {
        committee,
        section_key: section.key,
        content,
        file_name: fileName,
        file_url: fileUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'committee,section_key' }
    );
    setBusy(false);
    if (error) {
      console.error('save error:', error);
      setStatus('저장 실패: ' + error.message);
      return;
    }
    setStatus('저장되었습니다.');
    await onSaved();
  }

  return (
    <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-3 space-y-2 print:hidden">
      <p className="text-xs text-gray-500">{section.hint}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={UPLOAD_ACCEPT}
          onChange={handleFile}
          disabled={busy}
          className="text-xs file:mr-2 file:rounded file:border-0 file:bg-[#1F4E79] file:px-3 file:py-1.5 file:text-white file:text-xs hover:file:bg-[#163a5f]"
        />
        {fileUrl && (
          <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#1F4E79] underline">
            {fileName ?? '원본'} ↗
          </a>
        )}
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={section.kind === 'text' ? 5 : 3}
        placeholder={section.kind === 'text' ? '본문을 입력하거나 파일을 업로드하세요.' : '표 위에 들어갈 보충 설명 (선택)'}
        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E79]/40"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleSave}
          disabled={busy}
          className="rounded bg-[#1F4E79] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#163a5f] transition-colors disabled:opacity-50"
        >
          저장
        </button>
        {autofill && (
          <button
            onClick={() => {
              if (content.trim() && !confirm('기존 내용을 자동 집계 문구로 덮어쓸까요?')) return;
              setContent(autofill);
              setStatus('자동 집계 문구를 채웠습니다. 검토 후 저장하세요.');
            }}
            disabled={busy}
            className="rounded border border-[#2E7D32] px-4 py-1.5 text-xs font-medium text-[#2E7D32] hover:bg-[#2E7D32] hover:text-white transition-colors disabled:opacity-50"
          >
            총평 초안 자동 생성
          </button>
        )}
        {status && <span className="text-xs text-gray-500">{status}</span>}
      </div>
    </div>
  );
}

/* ───────────────────────── Bits ───────────────────────── */

function CountTable({
  title,
  rows,
  total,
  footnote,
}: {
  title: string;
  rows: { label: string; count: number }[];
  total: number;
  footnote?: string;
}) {
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  return (
    <div className="print:break-inside-avoid">
      <div className="flex items-baseline justify-between mb-1">
        <h4 className="text-sm font-semibold text-gray-800">{title}</h4>
        {footnote && <span className="text-xs font-medium text-[#2E7D32]">{footnote}</span>}
      </div>
      <table className="w-full text-sm border border-gray-400 border-collapse">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="border border-gray-400 py-1.5 px-3 font-semibold">구분</th>
            <th className="border border-gray-400 py-1.5 px-3 font-semibold whitespace-nowrap w-16 text-right">건수</th>
            <th className="border border-gray-400 py-1.5 px-3 font-semibold whitespace-nowrap w-16 text-right">비율</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3} className="border border-gray-400 py-2 px-3 text-center text-gray-400">
                데이터 없음
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.label}>
                <td className="border border-gray-400 py-1.5 px-3 text-gray-700">{r.label}</td>
                <td className="border border-gray-400 py-1.5 px-3 text-right text-gray-800">{r.count}</td>
                <td className="border border-gray-400 py-1.5 px-3 text-right text-gray-500">{pct(r.count)}%</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 font-semibold">
            <td className="border border-gray-400 py-1.5 px-3 text-gray-800">합계</td>
            <td className="border border-gray-400 py-1.5 px-3 text-right text-gray-900">{total}</td>
            <td className="border border-gray-400 py-1.5 px-3 text-right text-gray-500">100%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-gray-200 rounded-lg p-3 flex flex-col gap-1 print:break-inside-avoid">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-2xl font-bold text-[#1F4E79]">{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  );
}
