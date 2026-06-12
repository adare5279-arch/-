'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { insertRows, updateRows, deleteRows } from '@/lib/dataApi';
import { useCommittee } from '@/lib/CommitteeContext';
import { exportSheet, exportTemplate } from '@/lib/exportXlsx';
import { importExcel, type ImportField } from '@/lib/importXlsx';
import { extractText, UPLOAD_ACCEPT } from '@/lib/extractText';
import { downloadAsDoc, escapeHtml } from '@/lib/exportDoc';
import { ISSUE_TYPES, ISSUE_PROCS, CORR_STATUSES } from '@/lib/types';
import type { Issue, Department, MaterialRequest, Member } from '@/lib/types';

const IMPORT_FIELDS: ImportField[] = [
  { key: 'date', aliases: ['일자', 'date'], type: 'date' },
  { key: 'dept', aliases: ['부서', '담당부서', 'dept'] },
  { key: 'member', aliases: ['의원', '지적의원', '담당의원', 'member'] },
  { key: 'type', aliases: ['유형', 'type'], allowed: ISSUE_TYPES, fallback: '개선' },
  { key: 'content', aliases: ['지적내용', '내용', 'content'], required: true },
  { key: 'action', aliases: ['조치요구', '시정·조치요구', 'action'] },
  { key: 'proc', aliases: ['처리상태', '처리', 'proc'], allowed: ISSUE_PROCS, fallback: '미처리' },
];

const TEMPLATE_COLUMNS = [
  { header: '일자', value: () => '' },
  { header: '부서', value: () => '' },
  { header: '의원', value: () => '' },
  { header: '유형', value: () => '' },
  { header: '지적내용', value: () => '' },
  { header: '조치요구', value: () => '' },
  { header: '처리상태', value: () => '' },
];

const TYPE_COLOR: Record<string, string> = {
  '위법': '#C62828',
  '부당': '#B45309',
  '개선': '#1565C0',
  '권고': '#2E7D32',
  '주의': '#6A1B9A',
};
const PROC_COLOR: Record<string, string> = {
  '미처리': '#C62828',
  '처리중': '#B45309',
  '처리완료': '#2E7D32',
};
const CORR_COLOR: Record<string, string> = {
  '미조치': '#C62828',
  '조치중': '#B45309',
  '조치완료': '#2E7D32',
  '불수용': '#6A1B9A',
};

type FormState = {
  date: string;
  dept: string;
  member: string;
  type: string;
  content: string;
  action: string;
  proc: string;
  request_id: string;
  file_url: string;
  file_name: string;
};

const EMPTY_FORM: FormState = {
  date: '',
  dept: '',
  member: '',
  type: '개선',
  content: '',
  action: '',
  proc: '미처리',
  request_id: '',
  file_url: '',
  file_name: '',
};

type ViewMode = 'list' | 'dept' | 'member' | 'corr';

export default function IssuesPage() {
  const { committee } = useCommittee();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileMsg, setFileMsg] = useState('');
  const [importing, setImporting] = useState(false);
  // AI 초안
  const [aiSource, setAiSource] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 검색·필터
  const [q, setQ] = useState('');
  const [deptFilter, setDeptFilter] = useState('전체');
  const [memberFilter, setMemberFilter] = useState('전체');
  const [typeFilter, setTypeFilter] = useState('전체');
  const [procFilter, setProcFilter] = useState('전체');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const fetchIssues = useCallback(async () => {
    const { data, error } = await supabase
      .from('issues')
      .select('*')
      .eq('committee', committee)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching issues:', error);
      setIssues([]);
    } else {
      setIssues((data as Issue[]) ?? []);
    }
  }, [committee]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [deptRes, reqRes, memRes] = await Promise.all([
        supabase.from('departments').select('*').eq('committee', committee).order('name'),
        supabase
          .from('material_requests')
          .select('*')
          .eq('committee', committee)
          .order('created_at', { ascending: false }),
        supabase.from('members').select('*').eq('committee', committee),
      ]);
      if (cancelled) return;
      setDepartments((deptRes.data as Department[]) ?? []);
      setRequests((reqRes.data as MaterialRequest[]) ?? []);
      setMembers((memRes.data as Member[]) ?? []);
      await fetchIssues();
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [committee, fetchIssues]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileBusy(true);
    setFileMsg('파일 분석 중...');
    try {
      const { text, supported, ext } = await extractText(file);
      const path = `issues/${crypto.randomUUID()}.${ext || 'bin'}`;
      const { error: upErr } = await supabase.storage
        .from('report-files')
        .upload(path, file, { upsert: true });
      let fileUrl = '';
      if (upErr) {
        console.error('Storage upload error:', upErr);
      } else {
        fileUrl = supabase.storage.from('report-files').getPublicUrl(path).data.publicUrl;
      }
      setForm((f) => ({
        ...f,
        content:
          supported && text ? (f.content ? `${f.content}\n${text}` : text) : f.content,
        file_url: fileUrl,
        file_name: file.name,
      }));
      setFileMsg(
        supported
          ? `본문 추출 완료 (.${ext})`
          : `원본 첨부됨 (.${ext}) — 본문은 직접 입력하세요`
      );
    } catch (err) {
      console.error('File processing error:', err);
      setFileMsg('파일 처리 중 오류가 발생했습니다.');
    } finally {
      setFileBusy(false);
    }
  }

  async function handleAiDraft() {
    const source = (aiSource.trim() || form.content.trim());
    if (!source) {
      setAiMsg('회의 발언·자료 내용 등 원문을 먼저 입력하세요.');
      return;
    }
    setAiBusy(true);
    setAiMsg('AI가 지적사항 초안을 작성하는 중...');
    try {
      const system =
        '당신은 지방의회 행정사무감사 보좌 전문위원입니다. 주어진 회의 발언·제출자료·메모를 근거로 ' +
        '행정사무감사 지적사항 초안을 작성합니다. 반드시 아래 JSON 형식만 출력하세요. ' +
        '추측은 피하고 원문에 근거하며, 문장은 공문 어투(~함, ~필요)로 간결하게 작성합니다.\n' +
        '{"type":"위법|부당|개선|권고|주의 중 하나","content":"지적내용(2~4문장)","action":"시정·조치요구(1~2문장)"}';
      const prompt = `다음 원문을 근거로 지적사항 초안을 JSON으로 작성하세요.\n\n[원문]\n${source}`;
      const res = await fetch('/api/generate-query', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ engine: 'claude', system, prompt }),
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || data.error) {
        setAiMsg(data.error || 'AI 호출에 실패했습니다.');
        return;
      }
      const raw = (data.text ?? '').trim();
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) {
        setAiMsg('AI 응답을 해석하지 못했습니다. 다시 시도해주세요.');
        return;
      }
      const parsed = JSON.parse(m[0]) as { type?: string; content?: string; action?: string };
      const allowedType = (ISSUE_TYPES as readonly string[]).includes(parsed.type ?? '')
        ? (parsed.type as string)
        : form.type;
      setForm((f) => ({
        ...f,
        type: allowedType,
        content: parsed.content?.trim() || f.content,
        action: parsed.action?.trim() || f.action,
      }));
      setAiMsg('초안이 채워졌습니다. 내용을 검토·수정한 뒤 저장하세요.');
    } catch (err) {
      console.error('AI draft error:', err);
      setAiMsg('AI 초안 생성 중 오류가 발생했습니다.');
    } finally {
      setAiBusy(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.content.trim()) return;
    setSaving(true);
    const { error } = await insertRows('issues', {
      committee,
      date: form.date || null,
      dept: form.dept || null,
      member: form.member || null,
      type: form.type,
      content: form.content.trim(),
      action: form.action || null,
      proc: form.proc,
      request_id: form.request_id ? Number(form.request_id) : null,
      file_url: form.file_url || null,
      file_name: form.file_name || null,
    });
    setSaving(false);
    if (error) {
      console.error('Error inserting issue:', error);
      alert('저장에 실패했습니다.');
      return;
    }
    setForm(EMPTY_FORM);
    setFileMsg('');
    setShowForm(false);
    await fetchIssues();
  }

  async function updateProc(id: number, proc: string) {
    const prev = issues;
    setIssues((rs) => rs.map((r) => (r.id === id ? { ...r, proc } : r)));
    const { error } = await updateRows('issues', { proc }, { id });
    if (error) {
      console.error('Error updating proc:', error);
      setIssues(prev);
    }
  }

  async function updateCorr(id: number, patch: Partial<Issue>) {
    const prev = issues;
    setIssues((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await updateRows('issues', patch, { id });
    if (error) {
      console.error('Error updating corrective tracking:', error);
      setIssues(prev);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('이 지적사항을 삭제하시겠습니까?')) return;
    const prev = issues;
    setIssues((rs) => rs.filter((r) => r.id !== id));
    const { error } = await deleteRows('issues', { id });
    if (error) {
      console.error('Error deleting issue:', error);
      setIssues(prev);
    }
  }

  const filtered = issues.filter((r) => {
    if (deptFilter !== '전체' && r.dept !== deptFilter) return false;
    if (memberFilter !== '전체' && r.member !== memberFilter) return false;
    if (typeFilter !== '전체' && r.type !== typeFilter) return false;
    if (procFilter !== '전체' && r.proc !== procFilter) return false;
    if (fromDate && (!r.date || r.date < fromDate)) return false;
    if (toDate && (!r.date || r.date > toDate)) return false;
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      const hay = `${r.content} ${r.action ?? ''} ${r.dept ?? ''} ${r.member ?? ''}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  const requestMap = new Map(requests.map((r) => [r.id, r]));

  // 의원 선택 옵션: 등록된 의원 + 지적사항에 입력된 의원명(미등록 포함)
  const memberOptions = (() => {
    const set = new Set<string>();
    for (const m of members) set.add(m.name);
    for (const r of issues) if (r.member) set.add(r.member);
    return [...set].sort((a, b) => a.localeCompare(b, 'ko'));
  })();

  // 부서별 / 의원별 그룹핑
  const groups = (() => {
    if (viewMode !== 'dept' && viewMode !== 'member') return [];
    const key = viewMode === 'dept' ? 'dept' : 'member';
    const map = new Map<string, Issue[]>();
    for (const r of filtered) {
      const g = (r[key] as string | null) || '(미지정)';
      const arr = map.get(g);
      if (arr) arr.push(r);
      else map.set(g, [r]);
    }
    return [...map.entries()]
      .map(([name, rows]) => ({
        name,
        rows,
        done: rows.filter((x) => x.proc === '처리완료').length,
      }))
      // 미지정은 맨 뒤, 그 외 건수 많은 순
      .sort((a, b) => {
        if (a.name === '(미지정)') return 1;
        if (b.name === '(미지정)') return -1;
        return b.rows.length - a.rows.length;
      });
  })();

  const filterActive =
    q.trim() !== '' ||
    deptFilter !== '전체' ||
    memberFilter !== '전체' ||
    typeFilter !== '전체' ||
    procFilter !== '전체' ||
    fromDate !== '' ||
    toDate !== '';

  function resetFilters() {
    setQ('');
    setDeptFilter('전체');
    setMemberFilter('전체');
    setTypeFilter('전체');
    setProcFilter('전체');
    setFromDate('');
    setToDate('');
  }

  function handleExport() {
    exportSheet(`지적사항_${committee}`, '지적사항', filtered, [
      { header: '일자', value: (r) => r.date ?? '' },
      { header: '부서', value: (r) => r.dept ?? '' },
      { header: '의원', value: (r) => r.member ?? '' },
      { header: '유형', value: (r) => r.type },
      { header: '지적내용', value: (r) => r.content },
      { header: '조치요구', value: (r) => r.action ?? '' },
      { header: '처리상태', value: (r) => r.proc },
      { header: '시정기한', value: (r) => r.corr_due ?? '' },
      { header: '이행상태', value: (r) => r.corr_status ?? '' },
      { header: '회신일', value: (r) => r.corr_reply_date ?? '' },
      { header: '부서회신', value: (r) => r.corr_reply ?? '' },
      { header: '관련 자료요구', value: (r) => (r.request_id ? requestMap.get(r.request_id)?.title ?? '' : '') },
      { header: '첨부파일', value: (r) => r.file_name ?? '' },
      { header: '첨부링크', value: (r) => r.file_url ?? '' },
    ]);
  }

  function handleTemplate() {
    exportTemplate(`지적사항_양식`, '지적사항', TEMPLATE_COLUMNS);
  }

  // 부서별/의원별 지적사항 리포트 (한글·워드에서 열리는 .doc)
  function downloadGroupReport(unit: '부서' | '의원', name: string, rows: Issue[]) {
    const done = rows.filter((r) => r.proc === '처리완료').length;
    const corrDone = rows.filter((r) => r.corr_status === '조치완료').length;
    const today = new Date().toISOString().slice(0, 10);
    const tableRows = rows
      .map((r, i) => {
        const overdue =
          r.corr_due && r.corr_status !== '조치완료' && r.corr_due < today;
        return `<tr>
          <td class="center">${i + 1}</td>
          <td class="center">${escapeHtml(r.date ?? '-')}</td>
          <td class="center">${escapeHtml(r.type)}</td>
          <td>${escapeHtml(r.content)}</td>
          <td>${escapeHtml(r.action ?? '-')}</td>
          <td class="center">${escapeHtml(r.corr_status ?? '-')}</td>
          <td class="center">${escapeHtml(r.corr_due ?? '-')}${overdue ? ' (초과)' : ''}</td>
          <td>${escapeHtml(r.corr_reply ?? '-')}</td>
        </tr>`;
      })
      .join('');
    const body = `
      <h1>${escapeHtml(committee ?? '')} 행정사무감사<br/>${escapeHtml(unit)}별 지적사항 정리</h1>
      <p class="center muted">${escapeHtml(unit)}: <b>${escapeHtml(name)}</b> · 출력일 ${today}</p>
      <p>총 지적사항 <b>${rows.length}건</b> · 처리완료 ${done}건 · 시정 조치완료 ${corrDone}건</p>
      <table>
        <thead>
          <tr>
            <th class="center" style="width:4%">연번</th>
            <th class="center" style="width:9%">일자</th>
            <th class="center" style="width:7%">유형</th>
            <th>지적내용</th>
            <th>조치요구</th>
            <th class="center" style="width:8%">이행상태</th>
            <th class="center" style="width:10%">시정기한</th>
            <th>부서회신</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
      <p class="muted">※ 본 리포트는 행정사무감사 자료관리 시스템에서 자동 생성되었습니다.</p>`;
    downloadAsDoc(
      `${committee ?? ''}_${unit}별_${name}_지적사항`,
      body,
      `${unit}별 지적사항 - ${name}`,
    );
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      await importExcel({
        file,
        label: '지적사항',
        base: { committee },
        fields: IMPORT_FIELDS,
        insert: (records) => insertRows('issues', records),
        onDone: fetchIssues,
      });
    } finally {
      setImporting(false);
    }
  }

  const setField = (k: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const inputCls =
    'w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E79]/40';

  const tableHead = (
    <thead>
      <tr className="border-b border-gray-200 text-left text-gray-700">
        <th className="py-2 px-3 font-semibold whitespace-nowrap">일자</th>
        <th className="py-2 px-3 font-semibold whitespace-nowrap">부서</th>
        <th className="py-2 px-3 font-semibold whitespace-nowrap">의원</th>
        <th className="py-2 px-3 font-semibold whitespace-nowrap">유형</th>
        <th className="py-2 px-3 font-semibold">지적내용</th>
        <th className="py-2 px-3 font-semibold">조치요구</th>
        <th className="py-2 px-3 font-semibold whitespace-nowrap">관련 자료요구</th>
        <th className="py-2 px-3 font-semibold whitespace-nowrap">첨부</th>
        <th className="py-2 px-3 font-semibold whitespace-nowrap">처리</th>
        <th className="py-2 px-3 font-semibold whitespace-nowrap"></th>
      </tr>
    </thead>
  );

  function renderRow(r: Issue) {
    return (
      <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50 align-top">
        <td className="py-2 px-3 text-gray-800 whitespace-nowrap">{r.date ?? '—'}</td>
        <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{r.dept ?? '—'}</td>
        <td className="py-2 px-3 text-gray-700 whitespace-nowrap">{r.member ?? '—'}</td>
        <td className="py-2 px-3">
          <span
            className="inline-block text-xs font-medium rounded px-2 py-0.5 text-white"
            style={{ backgroundColor: TYPE_COLOR[r.type] ?? '#555' }}
          >
            {r.type}
          </span>
        </td>
        <td className="py-2 px-3 text-gray-800 max-w-xs">{r.content}</td>
        <td className="py-2 px-3 text-gray-600 max-w-xs">{r.action ?? '—'}</td>
        <td className="py-2 px-3 text-gray-600 max-w-[12rem]">
          {r.request_id && requestMap.has(r.request_id) ? (
            <span
              className="inline-block text-xs rounded bg-[#1F4E79]/10 text-[#1F4E79] px-2 py-0.5 truncate max-w-full"
              title={requestMap.get(r.request_id)!.title}
            >
              🔗 {requestMap.get(r.request_id)!.title}
            </span>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>
        <td className="py-2 px-3 whitespace-nowrap">
          {r.file_url ? (
            <a
              href={r.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#1F4E79] underline hover:opacity-80"
              title={r.file_name ?? ''}
            >
              파일
            </a>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>
        <td className="py-2 px-3">
          <select
            value={r.proc}
            onChange={(e) => updateProc(r.id, e.target.value)}
            className="text-xs font-medium rounded px-2 py-1 text-white border-0 focus:outline-none cursor-pointer"
            style={{ backgroundColor: PROC_COLOR[r.proc] ?? '#555' }}
          >
            {ISSUE_PROCS.map((p) => (
              <option key={p} value={p} className="bg-white text-gray-900">{p}</option>
            ))}
          </select>
        </td>
        <td className="py-2 px-3 whitespace-nowrap">
          <button
            onClick={() => handleDelete(r.id)}
            className="text-xs text-[#C62828] hover:underline"
          >
            삭제
          </button>
        </td>
      </tr>
    );
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  const corrInputCls =
    'w-full rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#1F4E79]/40';

  const corrHead = (
    <thead>
      <tr className="border-b border-gray-200 text-left text-gray-700">
        <th className="py-2 px-3 font-semibold whitespace-nowrap">일자</th>
        <th className="py-2 px-3 font-semibold whitespace-nowrap">부서</th>
        <th className="py-2 px-3 font-semibold">지적내용 / 조치요구</th>
        <th className="py-2 px-3 font-semibold whitespace-nowrap">시정기한</th>
        <th className="py-2 px-3 font-semibold whitespace-nowrap">이행상태</th>
        <th className="py-2 px-3 font-semibold whitespace-nowrap">회신일</th>
        <th className="py-2 px-3 font-semibold">부서 회신</th>
      </tr>
    </thead>
  );

  function renderCorrRow(r: Issue) {
    const overdue =
      !!r.corr_due && r.corr_status !== '조치완료' && r.corr_due < todayStr;
    return (
      <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50 align-top">
        <td className="py-2 px-3 text-gray-800 whitespace-nowrap">{r.date ?? '—'}</td>
        <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{r.dept ?? '—'}</td>
        <td className="py-2 px-3 text-gray-800 max-w-sm">
          <p>{r.content}</p>
          {r.action && <p className="text-xs text-gray-500 mt-0.5">조치요구: {r.action}</p>}
        </td>
        <td className="py-2 px-3 whitespace-nowrap">
          <input
            type="date"
            value={r.corr_due ?? ''}
            onChange={(e) => updateCorr(r.id, { corr_due: e.target.value || null })}
            className={`${corrInputCls} ${overdue ? 'border-[#C62828] text-[#C62828]' : ''}`}
          />
          {overdue && <span className="block text-[10px] text-[#C62828] mt-0.5">기한 초과</span>}
        </td>
        <td className="py-2 px-3">
          <select
            value={r.corr_status ?? ''}
            onChange={(e) => updateCorr(r.id, { corr_status: e.target.value || null })}
            className="text-xs font-medium rounded px-2 py-1 text-white border-0 focus:outline-none cursor-pointer"
            style={{ backgroundColor: r.corr_status ? CORR_COLOR[r.corr_status] ?? '#555' : '#9CA3AF' }}
          >
            <option value="" className="bg-white text-gray-900">미지정</option>
            {CORR_STATUSES.map((s) => (
              <option key={s} value={s} className="bg-white text-gray-900">{s}</option>
            ))}
          </select>
        </td>
        <td className="py-2 px-3 whitespace-nowrap">
          <input
            type="date"
            value={r.corr_reply_date ?? ''}
            onChange={(e) => updateCorr(r.id, { corr_reply_date: e.target.value || null })}
            className={corrInputCls}
          />
        </td>
        <td className="py-2 px-3 min-w-[12rem]">
          <textarea
            defaultValue={r.corr_reply ?? ''}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (r.corr_reply ?? '')) updateCorr(r.id, { corr_reply: v || null });
            }}
            rows={2}
            placeholder="부서 회신·이행 결과 입력 후 클릭 해제 시 저장"
            className={corrInputCls}
          />
        </td>
      </tr>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-[#1F4E79]">
          지적사항{committee ? ` — ${committee}` : ''}
        </h1>
        <div className="flex gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            onClick={handleTemplate}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            양식 다운로드
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="rounded-lg border border-[#1F4E79] bg-white px-4 py-2 text-sm font-medium text-[#1F4E79] hover:bg-[#1F4E79] hover:text-white transition-colors disabled:opacity-40"
          >
            {importing ? '가져오는 중...' : '엑셀 불러오기'}
          </button>
          <button
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="rounded-lg border border-[#2E7D32] bg-white px-4 py-2 text-sm font-medium text-[#2E7D32] hover:bg-[#2E7D32] hover:text-white transition-colors disabled:opacity-40"
          >
            엑셀 저장
          </button>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-lg bg-[#1F4E79] px-4 py-2 text-sm font-medium text-white hover:bg-[#163a5f] transition-colors"
          >
            {showForm ? '닫기' : '+ 지적사항 추가'}
          </button>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleAdd}
          className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 grid gap-3 sm:grid-cols-2"
        >
          <label className="text-sm text-gray-700 flex flex-col gap-1">
            일자
            <input type="date" value={form.date} onChange={setField('date')} className={inputCls} />
          </label>
          <label className="text-sm text-gray-700 flex flex-col gap-1">
            부서
            <select value={form.dept} onChange={setField('dept')} className={inputCls}>
              <option value="">선택 안 함</option>
              {departments.map((d) => (
                <option key={d.id} value={d.name}>{d.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-gray-700 flex flex-col gap-1">
            지적 의원
            <input
              value={form.member}
              onChange={setField('member')}
              list="issue-member-list"
              placeholder="의원명 (직접 입력 또는 선택)"
              className={inputCls}
            />
            <datalist id="issue-member-list">
              {members.map((m) => (
                <option key={m.id} value={m.name} />
              ))}
            </datalist>
          </label>
          <label className="text-sm text-gray-700 flex flex-col gap-1">
            유형
            <select value={form.type} onChange={setField('type')} className={inputCls}>
              {ISSUE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-gray-700 flex flex-col gap-1">
            처리상태
            <select value={form.proc} onChange={setField('proc')} className={inputCls}>
              {ISSUE_PROCS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-gray-700 flex flex-col gap-1 sm:col-span-2">
            관련 자료요구 (선택)
            <select value={form.request_id} onChange={setField('request_id')} className={inputCls}>
              <option value="">연계 안 함</option>
              {requests.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}{r.member ? ` (${r.member})` : ''}
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-400">
              이 지적사항이 어떤 자료요구에서 비롯되었는지 연결합니다.
            </span>
          </label>
          <div className="sm:col-span-2 rounded-lg border border-dashed border-[#1F4E79]/40 bg-[#1F4E79]/5 p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-sm font-medium text-[#1F4E79]">
                파일 첨부 (한글·엑셀·워드·PDF 등)
              </span>
              <input
                type="file"
                accept={UPLOAD_ACCEPT}
                onChange={handleFile}
                disabled={fileBusy}
                className="text-xs file:mr-2 file:rounded file:border-0 file:bg-[#1F4E79] file:px-3 file:py-1.5 file:text-white file:cursor-pointer disabled:opacity-50"
              />
            </div>
            <p className="text-xs text-gray-500">
              txt/csv/docx/pdf/xlsx/hwp는 본문이 자동 추출되어 아래 지적내용에 채워집니다.
              .hwpx·.doc 등은 원본 파일이 첨부 링크로 보관됩니다.
            </p>
            {fileMsg && (
              <p className={`text-xs ${fileBusy ? 'text-[#B45309]' : 'text-[#2E7D32]'}`}>
                {fileMsg}
              </p>
            )}
            {form.file_name && (
              <p className="text-xs text-gray-600">
                첨부:{' '}
                {form.file_url ? (
                  <a
                    href={form.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#1F4E79] underline"
                  >
                    {form.file_name}
                  </a>
                ) : (
                  form.file_name
                )}
              </p>
            )}
          </div>
          <div className="sm:col-span-2 rounded-lg border border-dashed border-[#6A1B9A]/40 bg-[#6A1B9A]/5 p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-sm font-medium text-[#6A1B9A]">AI 지적사항 초안 (선택)</span>
              <button
                type="button"
                onClick={handleAiDraft}
                disabled={aiBusy}
                className="rounded bg-[#6A1B9A] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition disabled:opacity-50"
              >
                {aiBusy ? '생성 중...' : 'AI 초안 생성'}
              </button>
            </div>
            <textarea
              value={aiSource}
              onChange={(e) => setAiSource(e.target.value)}
              className={inputCls}
              rows={3}
              placeholder="회의 발언·제출자료·메모 등 원문을 붙여넣으면 유형·지적내용·조치요구 초안을 자동 작성합니다. (비워두면 아래 지적내용을 근거로 사용)"
            />
            <p className="text-xs text-gray-500">
              AI 초안은 참고용입니다. 생성 후 반드시 사실관계를 검토·수정한 뒤 저장하세요.
            </p>
            {aiMsg && (
              <p className={`text-xs ${aiBusy ? 'text-[#B45309]' : 'text-[#2E7D32]'}`}>{aiMsg}</p>
            )}
          </div>
          <label className="text-sm text-gray-700 flex flex-col gap-1 sm:col-span-2">
            지적내용
            <textarea value={form.content} onChange={setField('content')} className={inputCls} rows={2} required />
          </label>
          <label className="text-sm text-gray-700 flex flex-col gap-1 sm:col-span-2">
            조치요구
            <textarea value={form.action} onChange={setField('action')} className={inputCls} rows={2} />
          </label>
          <div className="sm:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#1F4E79] px-4 py-2 text-sm font-medium text-white hover:bg-[#163a5f] transition-colors disabled:opacity-50"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 flex flex-wrap items-end gap-2">
        <label className="text-xs text-gray-600 flex flex-col gap-1 grow min-w-[160px]">
          검색
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="지적내용·조치요구·부서"
            className={inputCls}
          />
        </label>
        <label className="text-xs text-gray-600 flex flex-col gap-1">
          부서
          <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className={inputCls}>
            <option value="전체">전체</option>
            {departments.map((d) => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600 flex flex-col gap-1">
          의원
          <select value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)} className={inputCls}>
            <option value="전체">전체</option>
            {memberOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600 flex flex-col gap-1">
          유형
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={inputCls}>
            <option value="전체">전체</option>
            {ISSUE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600 flex flex-col gap-1">
          처리
          <select value={procFilter} onChange={(e) => setProcFilter(e.target.value)} className={inputCls}>
            <option value="전체">전체</option>
            {ISSUE_PROCS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600 flex flex-col gap-1">
          시작일
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} />
        </label>
        <label className="text-xs text-gray-600 flex flex-col gap-1">
          종료일
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputCls} />
        </label>
        {filterActive && (
          <button
            onClick={resetFilters}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
          >
            초기화
          </button>
        )}
      </div>

      {/* 보기 방식: 목록 / 부서별 / 의원별 */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">정리 방식</span>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {([
            ['list', '목록'],
            ['dept', '부서별'],
            ['member', '의원별'],
            ['corr', '사후관리'],
          ] as [ViewMode, string][]).map(([mode, label], i) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 transition-colors ${i > 0 ? 'border-l border-gray-200' : ''} ${
                viewMode === mode
                  ? 'bg-[#1F4E79] text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        {loading ? (
          <p className="text-sm text-gray-500 py-4 text-center">불러오는 중...</p>
        ) : issues.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">등록된 지적사항이 없습니다.</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">검색 조건에 맞는 지적사항이 없습니다.</p>
        ) : viewMode === 'list' ? (
          <div className="overflow-x-auto">
            <p className="text-sm text-gray-600 mb-3">
              총 {filtered.length}건{filterActive ? ` (전체 ${issues.length}건)` : ''}
            </p>
            <table className="w-full text-sm border-collapse">
              {tableHead}
              <tbody>{filtered.map(renderRow)}</tbody>
            </table>
          </div>
        ) : viewMode === 'corr' ? (
          <div className="overflow-x-auto">
            <p className="text-sm text-gray-600 mb-3">
              시정요구 사후관리 · 총 {filtered.length}건
              {(() => {
                const od = filtered.filter(
                  (r) => r.corr_due && r.corr_status !== '조치완료' && r.corr_due < todayStr,
                ).length;
                const dn = filtered.filter((r) => r.corr_status === '조치완료').length;
                return ` · 조치완료 ${dn}건${od ? ` · 기한초과 ${od}건` : ''}`;
              })()}
            </p>
            <table className="w-full text-sm border-collapse">
              {corrHead}
              <tbody>{filtered.map(renderCorrRow)}</tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-sm text-gray-600">
              총 {filtered.length}건{filterActive ? ` (전체 ${issues.length}건)` : ''} ·{' '}
              {viewMode === 'dept' ? '부서별' : '의원별'} {groups.length}개 그룹
            </p>
            {groups.map((g) => (
              <div key={g.name} className="rounded-lg border border-gray-200">
                <div className="flex items-center justify-between gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200">
                  <span className="font-semibold text-[#1F4E79]">{g.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-600">
                      {g.rows.length}건 · 처리완료 {g.done}건
                    </span>
                    <button
                      onClick={() =>
                        downloadGroupReport(viewMode === 'dept' ? '부서' : '의원', g.name, g.rows)
                      }
                      className="rounded border border-[#1F4E79] px-2 py-1 text-xs font-medium text-[#1F4E79] hover:bg-[#1F4E79] hover:text-white transition-colors whitespace-nowrap"
                    >
                      리포트 다운로드
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    {tableHead}
                    <tbody>{g.rows.map(renderRow)}</tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
