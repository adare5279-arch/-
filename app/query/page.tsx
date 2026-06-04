'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useCommittee } from '@/lib/CommitteeContext';
import type { Member, Meeting, Department, Issue } from '@/lib/types';
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

  const [members, setMembers] = useState<Member[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedIssueIds, setSelectedIssueIds] = useState<number[]>([]);

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const outputRef = useRef<HTMLPreElement>(null);

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
    </div>
  );
}
