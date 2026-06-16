'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { insertRows, updateRows, deleteRows } from '@/lib/dataApi';
import { exportSheet } from '@/lib/exportXlsx';
import type { FiscalIndicator } from '@/lib/types';
import Lofin365Links from '@/components/Lofin365Links';

const ORG = '경기도';
const fmtPct = (v: number | null) => (v == null ? '—' : `${v.toFixed(1)}%`);
const fmtMoney = (v: number | null) => (v == null ? '—' : v.toLocaleString('ko-KR'));

type Direction = 'up' | 'down' | 'zero'; // 높을수록/낮을수록/0에 가까울수록 좋음

type IndicatorMeta = {
  key: 'fin_independence' | 'fin_autonomy' | 'integrated_balance_ratio' | 'debt_ratio';
  avgKey: 'avg_independence' | 'avg_autonomy' | 'avg_integrated_balance_ratio' | 'avg_debt_ratio';
  label: string;
  formula: string;
  meaning: string;
  dir: Direction;
  // [good, warn] 임계값 — dir에 따라 해석
  good: number;
  warn: number;
  href: string;
};

const META: IndicatorMeta[] = [
  {
    key: 'fin_independence',
    avgKey: 'avg_independence',
    label: '재정자립도',
    formula: '(지방세 + 세외수입) ÷ 일반회계 예산규모 × 100',
    meaning: '자체수입으로 살림을 꾸리는 정도. 높을수록 자립 기반이 탄탄합니다.',
    dir: 'up',
    good: 50,
    warn: 30,
    href: 'https://www.lofin365.go.kr/portal/LF3140101.do',
  },
  {
    key: 'fin_autonomy',
    avgKey: 'avg_autonomy',
    label: '재정자주도',
    formula: '(자체수입 + 자주재원) ÷ 일반회계 예산규모 × 100',
    meaning: '교부세 등 자율 재원까지 포함해 실제로 자유롭게 쓸 수 있는 재원 비중입니다.',
    dir: 'up',
    good: 70,
    warn: 50,
    href: 'https://www.index.go.kr/unity/potal/main/EachDtlPageDetail.do?idx_cd=2857',
  },
  {
    key: 'integrated_balance_ratio',
    avgKey: 'avg_integrated_balance_ratio',
    label: '통합재정수지비율',
    formula: '통합재정수지(총수입 − 총지출) ÷ 총수입 × 100',
    meaning: '전체 재정의 흑자·적자 정도. 0 이상이면 여유, 큰 적자면 부담입니다.',
    dir: 'zero',
    good: 0,
    warn: -5,
    href: 'https://www.data.go.kr/data/15057078/openapi.do',
  },
  {
    key: 'debt_ratio',
    avgKey: 'avg_debt_ratio',
    label: '관리채무비율',
    formula: '관리채무액 ÷ 예산규모(또는 자산대비 부채) × 100',
    meaning: '빚 부담 정도. 낮을수록 건전하며 25% 초과 시 주의가 필요합니다.',
    dir: 'down',
    good: 25,
    warn: 40,
    href: 'https://www.data.go.kr/data/15057444/openapi.do',
  },
];

const COLORS = { good: '#2E7D32', warn: '#B45309', bad: '#C62828', none: '#9CA3AF' };

function statusOf(meta: IndicatorMeta, v: number | null): { color: string; label: string } {
  if (v == null) return { color: COLORS.none, label: '미입력' };
  if (meta.dir === 'up') {
    if (v >= meta.good) return { color: COLORS.good, label: '양호' };
    if (v >= meta.warn) return { color: COLORS.warn, label: '보통' };
    return { color: COLORS.bad, label: '주의' };
  }
  if (meta.dir === 'down') {
    if (v <= meta.good) return { color: COLORS.good, label: '양호' };
    if (v <= meta.warn) return { color: COLORS.warn, label: '보통' };
    return { color: COLORS.bad, label: '주의' };
  }
  // zero: 0 이상 양호, warn(음수)까지 보통, 그 이하 주의
  if (v >= meta.good) return { color: COLORS.good, label: '흑자' };
  if (v >= meta.warn) return { color: COLORS.warn, label: '경계' };
  return { color: COLORS.bad, label: '적자' };
}

type FormState = {
  year: string;
  fin_independence: string;
  fin_autonomy: string;
  integrated_balance_ratio: string;
  debt_ratio: string;
  avg_independence: string;
  avg_autonomy: string;
  avg_integrated_balance_ratio: string;
  avg_debt_ratio: string;
  own_revenue: string;
  budget_total: string;
  note: string;
  source_url: string;
};

const EMPTY_FORM: FormState = {
  year: String(new Date().getFullYear()),
  fin_independence: '',
  fin_autonomy: '',
  integrated_balance_ratio: '',
  debt_ratio: '',
  avg_independence: '',
  avg_autonomy: '',
  avg_integrated_balance_ratio: '',
  avg_debt_ratio: '',
  own_revenue: '',
  budget_total: '',
  note: '',
  source_url: 'https://www.lofin365.go.kr/portal/LF3140101.do',
};

const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s));

export default function FiscalPage() {
  const [rows, setRows] = useState<FiscalIndicator[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchRows = useCallback(async () => {
    const { data, error } = await supabase
      .from('fiscal_indicators')
      .select('*')
      .eq('org_name', ORG)
      .order('year', { ascending: false });
    if (error) {
      console.error('Error fetching fiscal_indicators:', error);
      setRows([]);
    } else {
      const list = (data as FiscalIndicator[]) ?? [];
      setRows(list);
      setSelectedYear((cur) => cur ?? (list[0]?.year ?? null));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await fetchRows();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchRows]);

  const current = useMemo(
    () => rows.find((r) => r.year === selectedYear) ?? null,
    [rows, selectedYear]
  );

  function openAdd() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(r: FiscalIndicator) {
    setEditId(r.id);
    setForm({
      year: String(r.year),
      fin_independence: r.fin_independence?.toString() ?? '',
      fin_autonomy: r.fin_autonomy?.toString() ?? '',
      integrated_balance_ratio: r.integrated_balance_ratio?.toString() ?? '',
      debt_ratio: r.debt_ratio?.toString() ?? '',
      avg_independence: r.avg_independence?.toString() ?? '',
      avg_autonomy: r.avg_autonomy?.toString() ?? '',
      avg_integrated_balance_ratio: r.avg_integrated_balance_ratio?.toString() ?? '',
      avg_debt_ratio: r.avg_debt_ratio?.toString() ?? '',
      own_revenue: r.own_revenue?.toString() ?? '',
      budget_total: r.budget_total?.toString() ?? '',
      note: r.note ?? '',
      source_url: r.source_url ?? '',
    });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const year = Number(form.year);
    if (!Number.isFinite(year)) return;
    setSaving(true);
    const payload = {
      org_name: ORG,
      year,
      fin_independence: numOrNull(form.fin_independence),
      fin_autonomy: numOrNull(form.fin_autonomy),
      integrated_balance_ratio: numOrNull(form.integrated_balance_ratio),
      debt_ratio: numOrNull(form.debt_ratio),
      avg_independence: numOrNull(form.avg_independence),
      avg_autonomy: numOrNull(form.avg_autonomy),
      avg_integrated_balance_ratio: numOrNull(form.avg_integrated_balance_ratio),
      avg_debt_ratio: numOrNull(form.avg_debt_ratio),
      own_revenue: numOrNull(form.own_revenue),
      budget_total: numOrNull(form.budget_total),
      note: form.note || null,
      source_url: form.source_url || null,
    };
    const { error } =
      editId == null
        ? await insertRows('fiscal_indicators', payload)
        : await updateRows('fiscal_indicators', payload, { id: editId });
    setSaving(false);
    if (error) {
      console.error('Error saving fiscal indicator:', error);
      alert(
        editId == null && error.message?.includes('duplicate')
          ? `${year}년 데이터가 이미 있습니다. 해당 연도를 수정해 주세요.`
          : '저장에 실패했습니다.'
      );
      return;
    }
    setShowForm(false);
    setSelectedYear(year);
    await fetchRows();
  }

  async function handleDelete(r: FiscalIndicator) {
    if (!confirm(`${r.year}년 재정지표를 삭제하시겠습니까?`)) return;
    const prev = rows;
    setRows((rs) => rs.filter((x) => x.id !== r.id));
    const { error } = await deleteRows('fiscal_indicators', { id: r.id });
    if (error) {
      console.error('Error deleting fiscal indicator:', error);
      setRows(prev);
    } else if (selectedYear === r.year) {
      setSelectedYear(null);
    }
  }

  async function handleSync(preview = false) {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch('/api/fiscal-sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ years: 6, preview }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setSyncMsg({ ok: false, text: json.error || `연동 실패 (${res.status})` });
        if (json.help) console.info('KOSIS 인증키 발급:', json.help);
        if (json.diagnostics) console.info('fiscal-sync 진단:', json.diagnostics);
        return;
      }
      if (preview) {
        console.info('fiscal-sync 미리보기:', json);
        const yrs = (json.planned ?? []).map((p: { year: number }) => p.year).join(', ');
        setSyncMsg({
          ok: true,
          text: `미리보기 완료: ${json.planned?.length ?? 0}개 연도(${yrs || '없음'}) 매칭. 자세한 내용은 콘솔 확인.`,
        });
        return;
      }
      setSyncMsg({
        ok: true,
        text: `KOSIS에서 ${json.upserted}개 연도(${(json.years ?? []).join(', ')}) 재정자립도·재정자주도를 불러왔습니다.`,
      });
      await fetchRows();
    } catch (e) {
      setSyncMsg({ ok: false, text: `연동 중 오류: ${String(e)}` });
    } finally {
      setSyncing(false);
    }
  }

  function handleExport() {
    exportSheet(`재정지표_${ORG}`, '재정지표', rows, [
      { header: '연도', value: (r) => r.year },
      { header: '재정자립도(%)', value: (r) => r.fin_independence ?? '' },
      { header: '재정자주도(%)', value: (r) => r.fin_autonomy ?? '' },
      { header: '통합재정수지비율(%)', value: (r) => r.integrated_balance_ratio ?? '' },
      { header: '관리채무비율(%)', value: (r) => r.debt_ratio ?? '' },
      { header: '시도평균 재정자립도(%)', value: (r) => r.avg_independence ?? '' },
      { header: '시도평균 재정자주도(%)', value: (r) => r.avg_autonomy ?? '' },
      { header: '자체수입(백만원)', value: (r) => r.own_revenue ?? '' },
      { header: '예산규모(백만원)', value: (r) => r.budget_total ?? '' },
      { header: '비고', value: (r) => r.note ?? '' },
    ]);
  }

  const setField =
    (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const inputCls =
    'w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E79]/40';

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-[#1F4E79]">재정지표 — {ORG}</h1>
          <p className="text-xs text-gray-500 mt-1">
            지방재정365 공시 기반 재정건전성 지표. 전국 시도 평균과 비교해 양호/주의를 자동 판정합니다.
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {rows.length > 0 && (
            <select
              value={selectedYear ?? ''}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            >
              {rows.map((r) => (
                <option key={r.id} value={r.year}>
                  {r.year}년
                </option>
              ))}
            </select>
          )}
          <button
            onClick={handleExport}
            disabled={rows.length === 0}
            className="rounded-lg border border-[#2E7D32] bg-white px-4 py-2 text-sm font-medium text-[#2E7D32] hover:bg-[#2E7D32] hover:text-white transition-colors disabled:opacity-40"
          >
            엑셀 저장
          </button>
          <button
            onClick={openAdd}
            className="rounded-lg bg-[#1F4E79] px-4 py-2 text-sm font-medium text-white hover:bg-[#163a5f] transition-colors"
          >
            + 연도 추가
          </button>
        </div>
      </div>

      <Lofin365Links />

      {/* 자동연동 */}
      <div className="rounded-lg border border-[#1F4E79]/30 bg-white p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-bold text-[#1F4E79]">재정지표 자동 불러오기</p>
            <p className="text-xs text-gray-500 mt-1">
              KOSIS(국가통계포털) OpenAPI에서 경기도 <b>재정자립도·재정자주도</b>를 연도별로 가져와
              자동 갱신합니다. (통합재정수지비율·관리채무비율 등 수기 입력값은 보존)
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleSync(true)}
              disabled={syncing}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              미리보기(진단)
            </button>
            <button
              onClick={() => handleSync(false)}
              disabled={syncing}
              className="rounded-lg bg-[#1F4E79] px-4 py-2 text-sm font-medium text-white hover:bg-[#163a5f] transition-colors disabled:opacity-50"
            >
              {syncing ? '불러오는 중...' : 'KOSIS 자동 불러오기'}
            </button>
          </div>
        </div>
        {syncMsg && (
          <p
            className={`text-xs mt-3 rounded px-3 py-2 ${
              syncMsg.ok ? 'bg-[#2E7D32]/10 text-[#2E7D32]' : 'bg-[#C62828]/10 text-[#C62828]'
            }`}
          >
            {syncMsg.text}
          </p>
        )}
        <p className="text-[11px] text-gray-400 mt-2">
          ※ 서버에 <code>KOSIS_API_KEY</code> 환경변수가 필요합니다(무료 발급: kosis.kr/openapi). 첫
          연동 시 &lsquo;미리보기(진단)&rsquo;로 매칭 결과를 확인한 뒤 통계표 코드를 조정할 수 있습니다.
        </p>
      </div>

      {showForm && (
        <form
          onSubmit={handleSave}
          className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#1F4E79]">
              {editId == null ? '재정지표 추가' : '재정지표 수정'}
            </h2>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-xs text-gray-500 hover:underline"
            >
              닫기
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="text-sm text-gray-700 flex flex-col gap-1">
              연도
              <input type="number" value={form.year} onChange={setField('year')} className={inputCls} />
            </label>
          </div>
          <p className="text-xs font-semibold text-gray-600">우리 지자체 지표 (%)</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="text-sm text-gray-700 flex flex-col gap-1">
              재정자립도
              <input value={form.fin_independence} onChange={setField('fin_independence')} className={inputCls} />
            </label>
            <label className="text-sm text-gray-700 flex flex-col gap-1">
              재정자주도
              <input value={form.fin_autonomy} onChange={setField('fin_autonomy')} className={inputCls} />
            </label>
            <label className="text-sm text-gray-700 flex flex-col gap-1">
              통합재정수지비율
              <input value={form.integrated_balance_ratio} onChange={setField('integrated_balance_ratio')} className={inputCls} />
            </label>
            <label className="text-sm text-gray-700 flex flex-col gap-1">
              관리채무비율
              <input value={form.debt_ratio} onChange={setField('debt_ratio')} className={inputCls} />
            </label>
          </div>
          <p className="text-xs font-semibold text-gray-600">전국 시도 평균 (%) — 선택</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="text-sm text-gray-700 flex flex-col gap-1">
              평균 재정자립도
              <input value={form.avg_independence} onChange={setField('avg_independence')} className={inputCls} />
            </label>
            <label className="text-sm text-gray-700 flex flex-col gap-1">
              평균 재정자주도
              <input value={form.avg_autonomy} onChange={setField('avg_autonomy')} className={inputCls} />
            </label>
            <label className="text-sm text-gray-700 flex flex-col gap-1">
              평균 통합재정수지비율
              <input value={form.avg_integrated_balance_ratio} onChange={setField('avg_integrated_balance_ratio')} className={inputCls} />
            </label>
            <label className="text-sm text-gray-700 flex flex-col gap-1">
              평균 관리채무비율
              <input value={form.avg_debt_ratio} onChange={setField('avg_debt_ratio')} className={inputCls} />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-gray-700 flex flex-col gap-1">
              자체수입 (백만원) — 선택
              <input value={form.own_revenue} onChange={setField('own_revenue')} className={inputCls} />
            </label>
            <label className="text-sm text-gray-700 flex flex-col gap-1">
              일반회계 예산규모 (백만원) — 선택
              <input value={form.budget_total} onChange={setField('budget_total')} className={inputCls} />
            </label>
          </div>
          <label className="text-sm text-gray-700 flex flex-col gap-1">
            출처 URL
            <input value={form.source_url} onChange={setField('source_url')} className={inputCls} />
          </label>
          <label className="text-sm text-gray-700 flex flex-col gap-1">
            비고
            <textarea value={form.note} onChange={setField('note')} className={inputCls} rows={2} />
          </label>
          <div className="flex justify-end">
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

      {loading ? (
        <p className="text-sm text-gray-500 py-8 text-center">불러오는 중...</p>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 text-center">
          <p className="text-sm text-gray-500">
            등록된 재정지표가 없습니다. 지방재정365에서 공시값을 확인해 &lsquo;+ 연도 추가&rsquo;로 입력하세요.
          </p>
        </div>
      ) : (
        <>
          {/* 지표 카드 */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {META.map((m) => {
              const v = current ? (current[m.key] as number | null) : null;
              const avg = current ? (current[m.avgKey] as number | null) : null;
              const st = statusOf(m, v);
              const diff = v != null && avg != null ? v - avg : null;
              // 게이지: dir에 따라 0~good*1.4 범위로 정규화
              const span = m.dir === 'zero' ? 1 : Math.max(m.good, m.warn) * 1.4;
              const ratio =
                v == null ? 0 : m.dir === 'zero' ? 0.5 : Math.min(1, Math.max(0, v / span));
              return (
                <div key={m.key} className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 flex flex-col">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700">{m.label}</span>
                    <span
                      className="text-[10px] font-bold rounded px-1.5 py-0.5 text-white"
                      style={{ backgroundColor: st.color }}
                    >
                      {st.label}
                    </span>
                  </div>
                  <p className="text-2xl font-bold mt-2" style={{ color: st.color }}>
                    {fmtPct(v)}
                  </p>
                  {m.dir !== 'zero' && (
                    <div className="mt-2 h-1.5 rounded bg-gray-100 overflow-hidden">
                      <div className="h-full rounded" style={{ width: `${ratio * 100}%`, backgroundColor: st.color }} />
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-2">
                    시도평균 {fmtPct(avg)}
                    {diff != null && (
                      <span
                        className="ml-1 font-medium"
                        style={{
                          color:
                            (m.dir === 'down' ? diff <= 0 : diff >= 0) ? COLORS.good : COLORS.bad,
                        }}
                      >
                        ({diff >= 0 ? '+' : ''}
                        {diff.toFixed(1)}p)
                      </span>
                    )}
                  </p>
                  <a
                    href={m.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-auto pt-2 text-xs text-[#1F4E79] hover:underline"
                  >
                    지방재정365 확인 ↗
                  </a>
                </div>
              );
            })}
          </div>

          {/* 지표 설명 */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
            <h2 className="text-sm font-bold text-[#1F4E79] mb-3">지표 산식 및 의미</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {META.map((m) => (
                <div key={m.key} className="border-l-2 border-[#1F4E79]/40 pl-3">
                  <p className="text-sm font-semibold text-gray-800">{m.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">산식: {m.formula}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{m.meaning}</p>
                </div>
              ))}
            </div>
            {current?.note && (
              <p className="text-xs text-[#B45309] mt-3">※ {current.note}</p>
            )}
          </div>

          {/* 연도별 추이 */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
            <h2 className="text-sm font-bold text-[#1F4E79] mb-3">연도별 추이</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-700">
                    <th className="py-2 px-3 font-semibold">연도</th>
                    <th className="py-2 px-3 font-semibold text-right">재정자립도</th>
                    <th className="py-2 px-3 font-semibold text-right">재정자주도</th>
                    <th className="py-2 px-3 font-semibold text-right">통합재정수지비율</th>
                    <th className="py-2 px-3 font-semibold text-right">관리채무비율</th>
                    <th className="py-2 px-3 font-semibold text-right">자체수입(백만원)</th>
                    <th className="py-2 px-3 font-semibold"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className={`border-b border-gray-100 transition-colors cursor-pointer ${
                        selectedYear === r.year ? 'bg-[#1F4E79]/5' : 'hover:bg-gray-50'
                      }`}
                      onClick={() => setSelectedYear(r.year)}
                    >
                      <td className="py-2 px-3 font-medium text-gray-800">{r.year}</td>
                      <td className="py-2 px-3 text-right" style={{ color: statusOf(META[0], r.fin_independence).color }}>
                        {fmtPct(r.fin_independence)}
                      </td>
                      <td className="py-2 px-3 text-right" style={{ color: statusOf(META[1], r.fin_autonomy).color }}>
                        {fmtPct(r.fin_autonomy)}
                      </td>
                      <td className="py-2 px-3 text-right" style={{ color: statusOf(META[2], r.integrated_balance_ratio).color }}>
                        {fmtPct(r.integrated_balance_ratio)}
                      </td>
                      <td className="py-2 px-3 text-right" style={{ color: statusOf(META[3], r.debt_ratio).color }}>
                        {fmtPct(r.debt_ratio)}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-700">{fmtMoney(r.own_revenue)}</td>
                      <td className="py-2 px-3 whitespace-nowrap text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(r);
                          }}
                          className="text-xs text-[#1F4E79] hover:underline mr-2"
                        >
                          수정
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(r);
                          }}
                          className="text-xs text-[#C62828] hover:underline"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
