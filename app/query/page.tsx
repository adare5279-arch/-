'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useCommittee } from '@/lib/CommitteeContext';
import { exportSheet } from '@/lib/exportXlsx';
import type { Member, Meeting, Department, Issue, BudgetItem } from '@/lib/types';
import {
  buildRuleQuery,
  buildLLMPrompt,
  QUERY_SYSTEM_PROMPT,
  type QueryParams,
  type QtypeKey,
  type ToneKey,
  type LengthKey,
  type FmtKey,
  type EngineKey,
} from '@/lib/queryBuilder';

type FormState = Omit<QueryParams, 'comm'> & { engine: EngineKey };

type Mode = 'free' | 'budget';

const won = (n: number) => n.toLocaleString('ko-KR');
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

type Finding = {
  item: BudgetItem;
  tag: '저조집행' | '초과집행' | '불용과다' | '이월과다';
  rate: number;
  unused: number;
  question: string;
};

function buildFindings(items: BudgetItem[]): Finding[] {
  const out: Finding[] = [];
  for (const r of items) {
    if (r.budget <= 0) continue;
    const rate = r.executed / r.budget;
    const unused = Math.max(0, r.budget - r.executed - r.carryover);
    const head = `[${r.dept ?? '부서미상'}] '${r.program}' 사업(${r.year}년, 예산현액 ${won(
      r.budget
    )}천원)`;
    if (r.executed > r.budget) {
      out.push({
        item: r,
        tag: '초과집행',
        rate,
        unused,
        question: `${head}은 집행액이 ${won(r.executed)}천원으로 예산현액을 ${won(
          r.executed - r.budget
        )}천원 초과하였습니다. 초과 집행의 근거와 예산 전용·추경 등 적법한 절차를 거쳤는지 소명하여 주시기 바랍니다.`,
      });
    } else if (rate < 0.7) {
      out.push({
        item: r,
        tag: '저조집행',
        rate,
        unused,
        question: `${head}의 집행률이 ${pct(
          rate
        )}에 그쳤습니다. 집행이 부진한 사유와 사업 추진상의 애로사항, 향후 집행 계획을 구체적으로 답변하여 주시기 바랍니다.`,
      });
    }
    if (unused / r.budget >= 0.2) {
      out.push({
        item: r,
        tag: '불용과다',
        rate,
        unused,
        question: `${head}에서 불용액이 ${won(unused)}천원(예산의 ${pct(
          unused / r.budget
        )})에 달합니다. 예산 편성의 적정성과 불용 발생 원인, 재발 방지 대책을 밝혀 주시기 바랍니다.`,
      });
    }
    if (r.carryover / r.budget >= 0.2) {
      out.push({
        item: r,
        tag: '이월과다',
        rate,
        unused,
        question: `${head}의 이월액이 ${won(r.carryover)}천원(예산의 ${pct(
          r.carryover / r.budget
        )})으로 과다합니다. 이월 사유와 차년도 집행 가능성, 사업 지연에 따른 영향을 설명하여 주시기 바랍니다.`,
      });
    }
  }
  return out;
}

const TAG_COLOR: Record<Finding['tag'], string> = {
  저조집행: '#C62828',
  초과집행: '#6A1B9A',
  불용과다: '#B45309',
  이월과다: '#1565C0',
};

const DEFAULT_FORM: FormState = {
  dept: '',
  targetTitle: '실장',
  member: '',
  session: '',
  budget: '',
  topic: '',
  keywords: '',
  facts: '',
  context: '',
  qtype: 'policy',
  tone: 'firm',
  length: 'medium',
  fmt: 'oral',
  itemCount: 5,
  citeCount: 0,
  engine: 'rule',
};

export default function QueryPage() {
  const { committee } = useCommittee();

  const [mode, setMode] = useState<Mode>('free');

  const [members, setMembers] = useState<Member[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedIssueIds, setSelectedIssueIds] = useState<number[]>([]);

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const outputRef = useRef<HTMLPreElement>(null);

  // 예산·결산 질의서 모드 상태
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
  const [budgetLoading, setBudgetLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState<string>('전체');
  const [selectedFindings, setSelectedFindings] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);

  // Fetch data when committee changes
  useEffect(() => {
    if (!committee) return;

    const fetchAll = async () => {
      const [{ data: mem }, { data: dep }, { data: mtg }, { data: iss }] = await Promise.all([
        supabase.from('members').select('*').eq('committee', committee),
        supabase.from('departments').select('*').eq('committee', committee),
        supabase.from('meetings').select('*').eq('committee', committee),
        supabase
          .from('issues')
          .select('*')
          .eq('committee', committee)
          .order('date', { ascending: false }),
      ]);
      setMembers((mem as Member[]) ?? []);
      setDepartments((dep as Department[]) ?? []);
      setMeetings((mtg as Meeting[]) ?? []);
      setIssues((iss as Issue[]) ?? []);
      setSelectedIssueIds([]);
    };

    fetchAll();
  }, [committee]);

  // 예산·결산 데이터 로드
  useEffect(() => {
    if (!committee) return;
    let cancelled = false;
    async function load() {
      setBudgetLoading(true);
      const { data, error } = await supabase
        .from('budget_items')
        .select('*')
        .eq('committee', committee)
        .order('year', { ascending: false });
      if (cancelled) return;
      if (error) {
        console.error('Error fetching budget_items:', error);
        setBudgetItems([]);
      } else {
        setBudgetItems((data as BudgetItem[]) ?? []);
      }
      setBudgetLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [committee]);

  const budgetYears = useMemo(
    () => Array.from(new Set(budgetItems.map((r) => r.year))).sort((a, b) => b - a),
    [budgetItems]
  );

  const scopedBudget = useMemo(
    () =>
      yearFilter === '전체'
        ? budgetItems
        : budgetItems.filter((r) => String(r.year) === yearFilter),
    [budgetItems, yearFilter]
  );

  const findings = useMemo(() => buildFindings(scopedBudget), [scopedBudget]);

  // 데이터/필터 변경 시 전체 선택
  useEffect(() => {
    setSelectedFindings(new Set(findings.map((_, i) => i)));
  }, [findings]);

  const chosenFindings = findings.filter((_, i) => selectedFindings.has(i));

  const budgetDocText = useMemo(() => {
    const header = `${committee} 행정사무감사 예산·결산 질의서\n${
      yearFilter === '전체' ? '' : `(${yearFilter}년 회계)\n`
    }\n`;
    const body = chosenFindings.map((f, i) => `${i + 1}. ${f.question}`).join('\n\n');
    return chosenFindings.length > 0 ? header + body : '';
  }, [chosenFindings, committee, yearFilter]);

  function toggleFinding(i: number) {
    setSelectedFindings((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function handleBudgetCopy() {
    if (!budgetDocText) return;
    try {
      await navigator.clipboard.writeText(budgetDocText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      alert('복사에 실패했습니다. 직접 선택해 복사해 주세요.');
    }
  }

  function handleBudgetDownloadTxt() {
    if (!budgetDocText) return;
    const blob = new Blob([budgetDocText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `예산결산_질의서_${committee}_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleBudgetExport() {
    exportSheet(`예산결산_질의서_${committee}`, '질의서', chosenFindings, [
      { header: '연번', value: (f) => chosenFindings.indexOf(f) + 1 },
      { header: '소관부서', value: (f) => f.item.dept ?? '' },
      { header: '사업명', value: (f) => f.item.program },
      { header: '유형', value: (f) => f.tag },
      { header: '집행률(%)', value: (f) => (f.rate * 100).toFixed(1) },
      { header: '질의 내용', value: (f) => f.question },
    ]);
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleIssue = (id: number) =>
    setSelectedIssueIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  // 선택한 부서가 있으면 해당 부서 지적사항을 우선 노출
  const relevantIssues = form.dept && form.dept !== '__custom__'
    ? issues.filter((it) => it.dept === form.dept)
    : issues;

  const selectedIssues = issues.filter((it) => selectedIssueIds.includes(it.id));

  const params: QueryParams = {
    comm: committee,
    dept: form.dept,
    targetTitle: form.targetTitle,
    member: form.member,
    session: form.session,
    budget: form.budget,
    topic: form.topic,
    keywords: form.keywords,
    facts: form.facts,
    context: form.context,
    qtype: form.qtype,
    tone: form.tone,
    length: form.length,
    fmt: form.fmt,
    itemCount: form.itemCount,
    citeCount: form.citeCount,
    pastIssues: selectedIssues,
  };

  const handleGenerate = async () => {
    if (!form.topic.trim()) {
      alert('질의 주제를 입력해 주세요.');
      return;
    }

    if (form.engine === 'rule') {
      setResult(buildRuleQuery(params, meetings));
      return;
    }

    // LLM path
    const prompt = buildLLMPrompt(params, meetings);
    setLoading(true);
    setResult('');
    try {
      const res = await fetch('/api/generate-query', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          engine: form.engine,
          prompt,
          system: QUERY_SYSTEM_PROMPT,
        }),
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (data.error) {
        setResult(`오류: ${data.error}`);
      } else {
        setResult(data.text ?? '');
      }
    } catch (e) {
      setResult(`오류: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result).catch(() => {
      /* ignore */
    });
  };

  const inputCls = 'border border-gray-300 rounded px-2 py-1 text-sm w-full';
  const labelCls = 'block text-xs text-gray-600 mb-0.5 font-medium';

  return (
    <div className="p-6 space-y-6">
      {/* Page heading */}
      <div>
        <h1 className="text-xl font-bold text-[#1F4E79]">AI 질의서 생성</h1>
        {committee && (
          <p className="text-sm text-gray-500 mt-0.5">{committee}</p>
        )}
      </div>

      {/* 모드 탭 */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { key: 'free' as Mode, label: '자유 질의서 (AI)' },
          { key: 'budget' as Mode, label: '예산·결산 질의서 (자동)' },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setMode(t.key)}
            className={[
              'px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors',
              mode === t.key
                ? 'border-[#1F4E79] text-[#1F4E79]'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mode === 'free' && (
      <>
      {/* Form card */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-4">
        {/* Row 1: comm + dept */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>위원회</label>
            <input
              className={`${inputCls} bg-gray-100 text-gray-500 cursor-not-allowed`}
              value={committee}
              readOnly
            />
          </div>
          <div>
            <label className={labelCls}>피감기관/부서</label>
            {departments.length > 0 ? (
              <select
                className={inputCls}
                value={form.dept}
                onChange={(e) => set('dept', e.target.value)}
              >
                <option value="">-- 부서 선택 --</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name}
                  </option>
                ))}
                <option value="__custom__">직접 입력</option>
              </select>
            ) : (
              <input
                className={inputCls}
                placeholder="부서명 직접 입력"
                value={form.dept}
                onChange={(e) => set('dept', e.target.value)}
              />
            )}
            {form.dept === '__custom__' && (
              <input
                className={`${inputCls} mt-1`}
                placeholder="부서명 직접 입력"
                onChange={(e) => set('dept', e.target.value)}
              />
            )}
          </div>
        </div>

        {/* Row 2: targetTitle + member */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>답변자 직위</label>
            <input
              className={inputCls}
              value={form.targetTitle}
              onChange={(e) => set('targetTitle', e.target.value)}
              placeholder="실장"
            />
          </div>
          <div>
            <label className={labelCls}>질의 의원</label>
            <select
              className={inputCls}
              value={form.member}
              onChange={(e) => set('member', e.target.value)}
            >
              <option value="">-- 의원 선택 (선택사항) --</option>
              {members.map((m) => (
                <option
                  key={m.id}
                  value={`${m.name}|${m.role}|${m.district ?? ''}|${m.party ?? ''}`}
                >
                  {m.name} ({m.role})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 3: session + budget */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>회기/일자</label>
            <input
              className={inputCls}
              value={form.session}
              onChange={(e) => set('session', e.target.value)}
              placeholder="예: 제2회 정례회 / 2024-10-15"
            />
          </div>
          <div>
            <label className={labelCls}>관련 예산</label>
            <input
              className={inputCls}
              value={form.budget}
              onChange={(e) => set('budget', e.target.value)}
              placeholder="예: 50억 원"
            />
          </div>
        </div>

        {/* Topic (required) */}
        <div>
          <label className={labelCls}>
            질의 주제 <span className="text-red-500">*</span>
          </label>
          <input
            className={inputCls}
            value={form.topic}
            onChange={(e) => set('topic', e.target.value)}
            placeholder="예: 노인복지시설 안전관리 실태"
          />
        </div>

        {/* Keywords */}
        <div>
          <label className={labelCls}>키워드 (쉼표 구분)</label>
          <input
            className={inputCls}
            value={form.keywords}
            onChange={(e) => set('keywords', e.target.value)}
            placeholder="예: 안전점검, 예산집행, 인력부족"
          />
        </div>

        {/* Facts + Context */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>사실관계 (수치·구체적 사실)</label>
            <textarea
              className={`${inputCls} h-24 resize-y`}
              value={form.facts}
              onChange={(e) => set('facts', e.target.value)}
              placeholder="예: 2023년 집행률 42%, 점검 미실시 시설 17개소"
            />
          </div>
          <div>
            <label className={labelCls}>사전 조사 메모</label>
            <textarea
              className={`${inputCls} h-24 resize-y`}
              value={form.context}
              onChange={(e) => set('context', e.target.value)}
              placeholder="현장 조사, 제보 내용 등 자유 기술"
            />
          </div>
        </div>

        {/* Past issues linkage */}
        {issues.length > 0 && (
          <div>
            <label className={labelCls}>
              기존 지적사항 연계{' '}
              {selectedIssueIds.length > 0 && (
                <span className="text-[#1F4E79]">({selectedIssueIds.length}건 선택)</span>
              )}
            </label>
            <p className="text-[11px] text-gray-400 mb-1">
              선택한 지적사항은 후속 점검·재발 여부 추궁 항목으로 질의서에 반영됩니다.
              {form.dept && form.dept !== '__custom__' && ` 현재 「${form.dept}」 부서 기준으로 필터링됩니다.`}
            </p>
            <div className="border border-gray-200 rounded max-h-44 overflow-auto divide-y divide-gray-100">
              {relevantIssues.length === 0 ? (
                <p className="text-xs text-gray-400 px-2 py-3">
                  해당 부서의 지적사항이 없습니다.
                </p>
              ) : (
                relevantIssues.map((it) => {
                  const checked = selectedIssueIds.includes(it.id);
                  const unresolved = it.proc !== '처리완료';
                  return (
                    <label
                      key={it.id}
                      className="flex items-start gap-2 px-2 py-1.5 text-xs cursor-pointer hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={checked}
                        onChange={() => toggleIssue(it.id)}
                      />
                      <span className="flex-1">
                        <span className="inline-flex items-center gap-1">
                          <span className="text-gray-400">{it.date ?? '날짜미상'}</span>
                          <span className="text-gray-300">·</span>
                          <span className="font-medium text-gray-700">{it.type}</span>
                          <span
                            className="rounded px-1 text-[10px] text-white"
                            style={{ backgroundColor: unresolved ? '#C62828' : '#2E7D32' }}
                          >
                            {it.proc}
                          </span>
                          {it.dept && <span className="text-gray-400">{it.dept}</span>}
                        </span>
                        <span className="block text-gray-800">{it.content}</span>
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Selects row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>질의 유형</label>
            <select
              className={inputCls}
              value={form.qtype}
              onChange={(e) => set('qtype', e.target.value as QtypeKey)}
            >
              <option value="policy">정책·사업</option>
              <option value="budget">예산·집행</option>
              <option value="safety">안전·재난</option>
              <option value="personnel">인사·조직</option>
              <option value="performance">성과·실적</option>
              <option value="response">민원·대응</option>
              <option value="contract">계약·용역</option>
              <option value="general">일반·기타</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>톤</label>
            <select
              className={inputCls}
              value={form.tone}
              onChange={(e) => set('tone', e.target.value as ToneKey)}
            >
              <option value="soft">완곡</option>
              <option value="firm">단호</option>
              <option value="sharp">날카로움</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>분량</label>
            <select
              className={inputCls}
              value={form.length}
              onChange={(e) => set('length', e.target.value as LengthKey)}
            >
              <option value="short">짧게</option>
              <option value="medium">보통</option>
              <option value="long">상세</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>형식</label>
            <select
              className={inputCls}
              value={form.fmt}
              onChange={(e) => set('fmt', e.target.value as FmtKey)}
            >
              <option value="oral">현장 구두질의</option>
              <option value="written">서면 질의서</option>
              <option value="speech">5분 자유발언</option>
            </select>
          </div>
        </div>

        {/* Count + Engine row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>지적사항 항목 수</label>
            <input
              type="number"
              min={1}
              max={7}
              className={inputCls}
              value={form.itemCount}
              onChange={(e) => set('itemCount', Math.min(7, Math.max(1, Number(e.target.value))))}
            />
          </div>
          <div>
            <label className={labelCls}>회의록 인용 수</label>
            <input
              type="number"
              min={0}
              max={10}
              className={inputCls}
              value={form.citeCount}
              onChange={(e) => set('citeCount', Math.max(0, Number(e.target.value)))}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>생성 엔진</label>
            <select
              className={inputCls}
              value={form.engine}
              onChange={(e) => set('engine', e.target.value as EngineKey)}
            >
              <option value="rule">규칙기반 (무료/즉시)</option>
              <option value="claude">Claude</option>
              <option value="openai">GPT (OpenAI)</option>
            </select>
          </div>
        </div>

        {/* Generate button */}
        <div className="pt-2">
          <button
            className="bg-[#1F4E79] text-white rounded px-4 py-2 text-sm font-medium hover:bg-[#163d5f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? '생성 중...' : '질의서 생성'}
          </button>
        </div>
      </div>

      {/* Output card */}
      {(result || loading) && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[#1F4E79]">생성된 질의서</h2>
            {result && (
              <button
                className="bg-[#1F4E79] text-white rounded px-3 py-1 text-xs font-medium hover:bg-[#163d5f] transition-colors"
                onClick={handleCopy}
              >
                복사
              </button>
            )}
          </div>
          {loading ? (
            <p className="text-sm text-gray-500 animate-pulse">AI가 질의서를 작성하고 있습니다...</p>
          ) : (
            <pre
              ref={outputRef}
              className="whitespace-pre-wrap text-sm text-gray-800 font-mono leading-relaxed border border-gray-100 rounded bg-gray-50 p-3 overflow-auto max-h-[70vh]"
            >
              {result}
            </pre>
          )}
        </div>
      )}
      </>
      )}

      {mode === 'budget' && (
      <>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-gray-500">
            저조집행·초과집행·불용/이월 과다 사업을 자동으로 찾아 질의 문안을 만듭니다. 데이터는{' '}
            <Link href="/settlement" className="text-[#1F4E79] underline">
              결산자료
            </Link>
            의 집행 입력을 기반으로 합니다.
          </p>
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="전체">전체 연도</option>
            {budgetYears.map((y) => (
              <option key={y} value={String(y)}>
                {y}년
              </option>
            ))}
          </select>
        </div>

        {budgetLoading ? (
          <p className="text-sm text-gray-500 py-8 text-center">불러오는 중...</p>
        ) : findings.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 text-center">
            <p className="text-sm text-[#2E7D32]">✓ 질의가 필요한 예산 이상 항목이 없습니다.</p>
            <p className="text-xs text-gray-500 mt-2">
              <Link href="/settlement" className="text-[#1F4E79] underline">
                결산자료
              </Link>
              에서 집행액을 입력하면 자동으로 질의 항목을 찾아냅니다.
            </p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-4">
            {/* 좌: 발견 항목 선택 */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-[#1F4E79]">
                  질의 후보 {findings.length}건 · 선택 {chosenFindings.length}건
                </h2>
                <div className="flex gap-2 text-xs">
                  <button
                    onClick={() => setSelectedFindings(new Set(findings.map((_, i) => i)))}
                    className="text-[#1F4E79] hover:underline"
                  >
                    전체선택
                  </button>
                  <button
                    onClick={() => setSelectedFindings(new Set())}
                    className="text-gray-500 hover:underline"
                  >
                    전체해제
                  </button>
                </div>
              </div>
              <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
                {findings.map((f, i) => (
                  <li
                    key={`${f.item.id}-${f.tag}`}
                    className="flex items-start gap-2 border border-gray-100 rounded p-2 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedFindings.has(i)}
                      onChange={() => toggleFinding(i)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="text-[10px] font-semibold rounded px-1.5 py-0.5 text-white"
                          style={{ backgroundColor: TAG_COLOR[f.tag] }}
                        >
                          {f.tag}
                        </span>
                        <span className="text-xs text-gray-500">{f.item.dept ?? '—'}</span>
                        <span className="text-sm text-gray-800 font-medium">{f.item.program}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        집행률 {pct(f.rate)} · 불용 {won(f.unused)}천원
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* 우: 생성된 질의서 */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-[#1F4E79]">생성된 질의서</h2>
                <div className="flex gap-2">
                  <button
                    onClick={handleBudgetCopy}
                    disabled={!budgetDocText}
                    className="rounded border border-[#1F4E79] px-3 py-1.5 text-xs font-medium text-[#1F4E79] hover:bg-[#1F4E79] hover:text-white transition-colors disabled:opacity-40"
                  >
                    {copied ? '복사됨 ✓' : '복사'}
                  </button>
                  <button
                    onClick={handleBudgetDownloadTxt}
                    disabled={!budgetDocText}
                    className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  >
                    TXT
                  </button>
                  <button
                    onClick={handleBudgetExport}
                    disabled={chosenFindings.length === 0}
                    className="rounded border border-[#2E7D32] px-3 py-1.5 text-xs font-medium text-[#2E7D32] hover:bg-[#2E7D32] hover:text-white transition-colors disabled:opacity-40"
                  >
                    엑셀
                  </button>
                </div>
              </div>
              {budgetDocText ? (
                <textarea
                  readOnly
                  value={budgetDocText}
                  className="flex-1 min-h-[55vh] w-full rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800 leading-relaxed focus:outline-none"
                />
              ) : (
                <p className="text-sm text-gray-400 py-8 text-center flex-1">
                  왼쪽에서 질의할 항목을 선택하세요.
                </p>
              )}
            </div>
          </div>
        )}
      </>
      )}
    </div>
  );
}
