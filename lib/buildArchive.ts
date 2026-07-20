// 등록된 자료를 [부서 > 분류] 폴더 구조의 ZIP으로 묶어 내려받는 유틸.
// 첨부파일은 Supabase Storage 공개 URL에서 받아오고, 폴더별 목록(CSV)과
// 회의록 AI 정리본(txt)도 함께 포함한다.

import { supabase } from './supabaseClient';
import type { MaterialRequest, Issue, Witness, MeetingMinutes } from './types';

export type ArchiveCategories = {
  requests: boolean; // 자료요구
  issues: boolean; // 지적사항
  witnesses: boolean; // 증인·참고인
  minutes: boolean; // 회의록
};

export type ArchiveOptions = {
  committee: string;
  categories: ArchiveCategories;
  includeIndex: boolean;
  onProgress?: (done: number, total: number, label: string) => void;
};

export type ArchiveResult = {
  blob: Blob;
  fileName: string;
  fileCount: number; // 실제로 담은 파일 수
  itemCount: number; // 목록에 집계된 항목 수
  folderCount: number; // 생성된 [부서 > 분류] 폴더 수
  failures: number; // 다운로드 실패한 첨부 수
};

const COMMON = '공통(부서무관)'; // 증인·회의록 등 부서와 무관한 자료
const OTHER = '기타(소관 외 부서)'; // 위원회 소관 실국에 매칭되지 않는 부서

function sanitize(name: string, fallback = '무제'): string {
  const cleaned = (name || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || fallback).slice(0, 120);
}

// 부서명 비교용 정규화: 괄호 보조설명·공백 제거
function normDept(s: string): string {
  return (s || '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, '')
    .trim();
}

// 자료의 부서 후보를 위원회 소관 실국 목록에 맞춰 분류한다.
// - 매칭되면 해당 소관 실국명, 부서가 비어 있으면 COMMON, 비었지 않지만 소관 외면 OTHER
function resolveBucket(candidates: (string | null | undefined)[], deptNames: string[]): string {
  const cands = candidates.map((c) => normDept(c ?? '')).filter(Boolean);
  if (cands.length === 0) return COMMON;
  for (const name of deptNames) {
    const core = normDept(name);
    if (!core) continue;
    if (cands.some((c) => c === core || c.includes(core) || core.includes(c))) return name;
  }
  return OTHER;
}

function csvCell(s: unknown): string {
  const v = s == null ? '' : String(s);
  return `"${v.replace(/"/g, '""')}"`;
}

type Entry = {
  dept: string;
  category: string;
  title: string;
  who: string; // 담당/의원/작성자
  date: string;
  status: string;
  fileUrl: string | null;
  fileName: string | null;
  textFiles?: { name: string; content: string }[]; // 회의록 정리본 등
};

export async function buildArchive(opts: ArchiveOptions): Promise<ArchiveResult> {
  const { committee, categories, includeIndex, onProgress } = opts;
  const entries: Entry[] = [];

  // 0) 위원회 소관 실국 목록 (분류 기준)
  const { data: deptRows } = await supabase
    .from('departments')
    .select('name')
    .eq('committee', committee);
  const deptNames = ((deptRows as { name: string }[]) ?? [])
    .map((d) => d.name)
    .filter(Boolean);

  // 1) 데이터 수집
  const tasks: Promise<void>[] = [];

  if (categories.requests) {
    tasks.push(
      (async () => {
        const { data } = await supabase
          .from('material_requests')
          .select('*')
          .eq('committee', committee);
        for (const r of (data as MaterialRequest[]) ?? []) {
          entries.push({
            dept: resolveBucket([r.dept_main, r.dept], deptNames),
            category: '자료요구',
            title: r.title,
            who: r.member ?? '',
            date: r.req_date ?? '',
            status: r.status ?? '',
            fileUrl: r.file_url,
            fileName: r.file_name,
          });
        }
      })(),
    );
  }

  if (categories.issues) {
    tasks.push(
      (async () => {
        const { data } = await supabase
          .from('issues')
          .select('*')
          .eq('committee', committee);
        for (const r of (data as Issue[]) ?? []) {
          entries.push({
            dept: resolveBucket([r.dept], deptNames),
            category: '지적사항',
            title: r.content?.slice(0, 60) || '지적사항',
            who: r.member ?? '',
            date: r.date ?? '',
            status: `${r.type ?? ''} / ${r.proc ?? ''}`,
            fileUrl: r.file_url,
            fileName: r.file_name,
          });
        }
      })(),
    );
  }

  if (categories.witnesses) {
    tasks.push(
      (async () => {
        const { data } = await supabase
          .from('witnesses')
          .select('*')
          .eq('committee', committee);
        for (const r of (data as Witness[]) ?? []) {
          entries.push({
            dept: COMMON,
            category: '증인·참고인',
            title: `${r.name}${r.org ? ` (${r.org})` : ''}`,
            who: r.kind ?? '',
            date: r.dt ?? '',
            status: r.attend ?? '',
            fileUrl: r.file_url,
            fileName: r.file_name,
          });
        }
      })(),
    );
  }

  if (categories.minutes) {
    tasks.push(
      (async () => {
        const { data } = await supabase
          .from('meeting_minutes')
          .select('*')
          .eq('committee', committee);
        for (const r of (data as MeetingMinutes[]) ?? []) {
          const label = r.source === 'audio' ? '녹음' : '문서';
          const texts: { name: string; content: string }[] = [];
          if (r.summary) {
            texts.push({
              name: `${sanitize(r.title ?? '회의록')}_AI정리.txt`,
              content: r.summary,
            });
          }
          entries.push({
            dept: COMMON,
            category: '회의록',
            title: `[${label}] ${r.title ?? '제목없음'}`,
            who: '',
            date: r.meeting_date ?? r.created_at?.slice(0, 10) ?? '',
            status: '',
            fileUrl: r.audio_url,
            fileName: r.audio_name,
            textFiles: texts,
          });
        }
      })(),
    );
  }

  await Promise.all(tasks);

  // 2) ZIP 구성
  const { default: JSZip } = await import('jszip'); // 용량이 커서 ZIP 생성 시점에만 로드
  const zip = new JSZip();
  const root = zip.folder(sanitize(`행감자료_${committee}`)) ?? zip;

  // 다운로드 대상(파일 첨부) 총 개수
  const downloadable = entries.filter((e) => e.fileUrl);
  const total = downloadable.length;
  let done = 0;
  let fileCount = 0;
  let failures = 0;

  // [부서 > 분류] 폴더를 항목 단위로 항상 생성.
  // JSZip은 파일이 들어가야 폴더가 만들어지므로, 첨부가 없어도 폴더별 '목록.csv'를
  // 넣어 폴더 구조가 반드시 나타나도록 한다.
  const groups = new Map<string, { dept: string; category: string; items: Entry[] }>();
  for (const e of entries) {
    const dept = sanitize(e.dept);
    const key = `${dept} ${e.category}`;
    const g = groups.get(key) ?? { dept, category: e.category, items: [] };
    g.items.push(e);
    groups.set(key, g);
  }
  let folderCount = 0;
  for (const g of groups.values()) {
    const folder = root.folder(g.dept)!.folder(sanitize(g.category))!;
    folderCount++;
    const head = ['제목', '담당/구분', '일자', '상태', '첨부파일'];
    const lines = [head.map(csvCell).join(',')];
    for (const e of g.items) {
      lines.push(
        [e.title, e.who, e.date, e.status, e.fileName ?? '(첨부 없음)'].map(csvCell).join(','),
      );
    }
    folder.file('목록.csv', '﻿' + lines.join('\r\n'));
    fileCount++;
  }

  // 텍스트 파일(회의록 정리본) 먼저 기록
  for (const e of entries) {
    if (e.textFiles?.length) {
      const folder = root.folder(sanitize(e.dept))!.folder(sanitize(e.category))!;
      for (const t of e.textFiles) {
        folder.file(t.name, t.content);
        fileCount++;
      }
    }
  }

  // 첨부파일 다운로드 후 담기
  for (let i = 0; i < downloadable.length; i++) {
    const e = downloadable[i];
    onProgress?.(done, total, e.fileName || e.title);
    try {
      const res = await fetch(e.fileUrl as string);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const folder = root.folder(sanitize(e.dept))!.folder(sanitize(e.category))!;
      const safe = sanitize(e.fileName || e.title, '첨부');
      folder.file(`${i + 1}_${safe}`, blob);
      fileCount++;
    } catch {
      failures++;
    }
    done++;
    onProgress?.(done, total, e.fileName || e.title);
  }

  // 3) 목록(CSV) — 부서/분류별 정렬
  // 자료가 없는 소관 실국도 폴더로 만들어 위원회 관할(소관 실국) 구조를 그대로 드러낸다
  const usedDepts = new Set(entries.map((e) => sanitize(e.dept)));
  for (const name of deptNames) {
    const safe = sanitize(name);
    if (usedDepts.has(safe)) continue;
    const emptyHead = ['분류', '제목', '담당/구분', '일자', '상태', '첨부파일'];
    const emptyCsv = [
      emptyHead.map(csvCell).join(','),
      ['', '(해당 자료 없음)', '', '', '', ''].map(csvCell).join(','),
    ];
    root.folder(safe)!.file('목록.csv', '﻿' + emptyCsv.join('\r\n'));
    folderCount++;
  }

  if (includeIndex) {
    const sorted = [...entries].sort(
      (a, b) =>
        a.dept.localeCompare(b.dept, 'ko') ||
        a.category.localeCompare(b.category, 'ko') ||
        a.date.localeCompare(b.date),
    );
    const header = ['부서', '분류', '제목', '담당/구분', '일자', '상태', '첨부파일'];
    const lines = [header.map(csvCell).join(',')];
    for (const e of sorted) {
      lines.push(
        [e.dept, e.category, e.title, e.who, e.date, e.status, e.fileName ?? '']
          .map(csvCell)
          .join(','),
      );
    }
    // Excel 한글 깨짐 방지용 BOM
    root.file('자료목록.csv', '﻿' + lines.join('\r\n'));
  }

  // 안내문
  root.file(
    '_안내.txt',
    [
      `경기도의회 행정사무감사 자료 정리`,
      `위원회: ${committee}`,
      `생성일시: ${new Date().toLocaleString('ko-KR')}`,
      `폴더 구조: 부서 > 분류(자료요구·지적사항·증인참고인·회의록)`,
      `총 항목: ${entries.length}건, 담긴 파일: 첨부 기준 ${total - failures}개`,
      failures ? `※ 일부 첨부(${failures}개)는 내려받지 못했습니다.` : ``,
    ]
      .filter(Boolean)
      .join('\r\n'),
  );

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const today = new Date().toISOString().slice(0, 10);
  return {
    blob,
    fileName: `행감자료_${sanitize(committee)}_${today}.zip`,
    fileCount,
    itemCount: entries.length,
    folderCount,
    failures,
  };
}
