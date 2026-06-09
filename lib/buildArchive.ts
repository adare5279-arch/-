// 등록된 자료를 [부서 > 분류] 폴더 구조의 ZIP으로 묶어 내려받는 유틸.
// 첨부파일은 Supabase Storage 공개 URL에서 받아오고, 폴더별 목록(CSV)과
// 회의록 AI 정리본(txt)도 함께 포함한다.

import JSZip from 'jszip';
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
  failures: number; // 다운로드 실패한 첨부 수
};

const NO_DEPT = '부서미지정(공통)';

function sanitize(name: string, fallback = '무제'): string {
  const cleaned = (name || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || fallback).slice(0, 120);
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
            dept: r.dept || r.dept_main || NO_DEPT,
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
            dept: r.dept || NO_DEPT,
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
            dept: NO_DEPT,
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
            dept: NO_DEPT,
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
  const zip = new JSZip();
  const root = zip.folder(sanitize(`행감자료_${committee}`)) ?? zip;

  // 다운로드 대상(파일 첨부) 총 개수
  const downloadable = entries.filter((e) => e.fileUrl);
  const total = downloadable.length;
  let done = 0;
  let fileCount = 0;
  let failures = 0;

  // 텍스트 파일(회의록 정리본) 먼저 기록
  for (const e of entries) {
    if (e.textFiles?.length) {
      const folder = root.folder(sanitize(e.dept))!.folder(e.category)!;
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
      const folder = root.folder(sanitize(e.dept))!.folder(e.category)!;
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
    failures,
  };
}
