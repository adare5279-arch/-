'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { insertRows, deleteRows } from '@/lib/dataApi';
import { useCommittee } from '@/lib/CommitteeContext';
import { SCHEDULE_KINDS } from '@/lib/types';
import type { ScheduleEvent, Meeting, MaterialRequest } from '@/lib/types';

type CalEvent = {
  date: string; // YYYY-MM-DD
  label: string;
  kind: string;
  color: string;
  overdue?: boolean;
  source: 'meeting' | 'deadline' | 'custom' | 'ggc';
  eventId?: number;
  href?: string; // GGC 일정: 클릭 시 열 원본 링크
};

const KIND_COLOR: Record<string, string> = {
  감사: '#1F4E79',
  회의: '#2E7D32',
  현장방문: '#B45309',
  일정: '#6A1B9A',
  마감: '#C62828',
  의정: '#0F766E', // 경기도의회 의정캘린더(기본)
};

// GGC 의정캘린더 API 응답
type GgcItem = { code: string; short: string; committee: string | null };
type GgcDay = { date: string; items: GgcItem[] };

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

const EMPTY_FORM = { date: '', title: '', kind: '감사', note: '' };

export default function CalendarPage() {
  const { committee } = useCommittee();

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // GGC 의정캘린더(기본 일정) — 현재 보고 있는 달을 서버 API로 가져온다
  const [ggcDays, setGgcDays] = useState<GgcDay[]>([]);
  const [ggcLoading, setGgcLoading] = useState(false);
  const [ggcSourceUrl, setGgcSourceUrl] = useState<string | null>(null);
  // 'committee' = 현재 위원회(+본회의)만, 'all' = 전체 위원회
  const [ggcScope, setGgcScope] = useState<'committee' | 'all'>('committee');

  const fetchEvents = useCallback(async () => {
    const { data } = await supabase
      .from('schedule_events')
      .select('*')
      .eq('committee', committee)
      .order('date');
    setEvents((data as ScheduleEvent[]) ?? []);
  }, [committee]);

  useEffect(() => {
    if (!committee) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [meetRes, reqRes, evRes] = await Promise.all([
        supabase.from('meetings').select('*').eq('committee', committee).order('date'),
        supabase.from('material_requests').select('*').eq('committee', committee),
        supabase.from('schedule_events').select('*').eq('committee', committee).order('date'),
      ]);
      if (cancelled) return;
      setMeetings((meetRes.data as Meeting[]) ?? []);
      setRequests((reqRes.data as MaterialRequest[]) ?? []);
      setEvents((evRes.data as ScheduleEvent[]) ?? []);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [committee]);

  // 보고 있는 달이 바뀔 때마다 GGC 의정캘린더를 불러온다 (위원회와 무관하게 월 단위 캐시)
  useEffect(() => {
    let cancelled = false;
    const year = cursor.getFullYear();
    const month = cursor.getMonth() + 1;
    (async () => {
      setGgcLoading(true);
      try {
        const res = await fetch(`/api/ggc-schedule?year=${year}&month=${month}`);
        const json = (await res.json()) as {
          days?: GgcDay[];
          sourceUrl?: string | null;
        };
        if (cancelled) return;
        setGgcDays(json.days ?? []);
        setGgcSourceUrl(json.sourceUrl ?? null);
      } catch {
        if (!cancelled) {
          setGgcDays([]);
          setGgcSourceUrl(null);
        }
      } finally {
        if (!cancelled) setGgcLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cursor]);

  const today = startOfDay(new Date());

  // 모든 이벤트를 날짜별로 집계
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    const push = (e: CalEvent) => {
      const arr = map.get(e.date) ?? [];
      arr.push(e);
      map.set(e.date, arr);
    };

    // GGC 의정캘린더(기본) — 위원회 필터 적용 후 날짜별로 추가
    for (const d of ggcDays) {
      for (const it of d.items) {
        const isPlenary = it.code === 'A011'; // 본회의는 위원회 무관
        if (
          ggcScope === 'committee' &&
          !isPlenary &&
          it.committee !== committee
        ) {
          continue;
        }
        push({
          date: d.date,
          label: it.short,
          kind: '의정',
          color: KIND_COLOR['의정'],
          source: 'ggc',
          href: `https://www.ggc.go.kr/site/main/schedule/list/${d.date}/ALL`,
        });
      }
    }

    for (const m of meetings) {
      if (!m.date) continue;
      push({
        date: m.date,
        label: '회의',
        kind: '회의',
        color: KIND_COLOR['회의'],
        source: 'meeting',
      });
    }

    for (const r of requests) {
      if (!r.due_date) continue;
      const done = r.status === '제출완료';
      const due = startOfDay(new Date(r.due_date));
      push({
        date: r.due_date,
        label: `마감: ${r.title}`,
        kind: '마감',
        color: KIND_COLOR['마감'],
        overdue: !done && due < today,
        source: 'deadline',
      });
    }

    for (const e of events) {
      push({
        date: e.date,
        label: e.title,
        kind: e.kind,
        color: KIND_COLOR[e.kind] ?? '#555',
        source: 'custom',
        eventId: e.id,
      });
    }

    return map;
  }, [meetings, requests, events, today, ggcDays, ggcScope, committee]);

  // 마감 알림: 미제출/부분제출/제출불가 중 마감일 기준
  const deadlineAlerts = useMemo(() => {
    const in7 = startOfDay(new Date());
    in7.setDate(in7.getDate() + 7);
    const items = requests
      .filter(r => r.due_date && r.status !== '제출완료')
      .map(r => {
        const due = startOfDay(new Date(r.due_date as string));
        const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
        return { r, due, diff };
      })
      .filter(({ due }) => due <= in7)
      .sort((a, b) => a.diff - b.diff);
    return items;
  }, [requests, today]);

  // 달력 그리드 (6주 = 42칸)
  const grid = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const startWeekday = first.getDay();
    const gridStart = new Date(year, month, 1 - startWeekday);
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      days.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
    }
    return days;
  }, [cursor]);

  const monthLabel = `${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월`;
  const todayStr = ymd(today);

  const goMonth = (delta: number) =>
    setCursor(c => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  const goToday = () => {
    const d = new Date();
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.date || !form.title.trim()) return;
    setSaving(true);
    const { error } = await insertRows('schedule_events', {
      committee,
      date: form.date,
      title: form.title.trim(),
      kind: form.kind,
      note: form.note || null,
    });
    setSaving(false);
    if (error) {
      console.error('Error inserting event:', error);
      alert('일정 저장에 실패했습니다.');
      return;
    }
    setForm(EMPTY_FORM);
    setShowForm(false);
    await fetchEvents();
  }

  async function handleDelete(id: number) {
    if (!confirm('이 일정을 삭제하시겠습니까?')) return;
    const prev = events;
    setEvents(es => es.filter(e => e.id !== id));
    const { error } = await deleteRows('schedule_events', { id });
    if (error) {
      console.error('Error deleting event:', error);
      setEvents(prev);
    }
  }

  const inputCls =
    'w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E79]/40';

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-[#1F4E79]">
          감사 일정{committee ? ` — ${committee}` : ''}
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          {/* GGC 의정캘린더 표시 범위 토글 */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            <button
              onClick={() => setGgcScope('committee')}
              className={`px-3 py-2 transition-colors ${
                ggcScope === 'committee'
                  ? 'bg-[#0F766E] text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
              title="현재 위원회와 본회의 일정만 표시"
            >
              현재 위원회
            </button>
            <button
              onClick={() => setGgcScope('all')}
              className={`px-3 py-2 border-l border-gray-200 transition-colors ${
                ggcScope === 'all'
                  ? 'bg-[#0F766E] text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
              title="전체 위원회 의정 일정 표시"
            >
              전체 위원회
            </button>
          </div>
          <button
            onClick={() => setShowForm(s => !s)}
            className="rounded-lg bg-[#1F4E79] px-4 py-2 text-sm font-medium text-white hover:bg-[#163a5f] transition-colors"
          >
            {showForm ? '닫기' : '+ 일정 추가'}
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
            <input
              type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className={inputCls}
              required
            />
          </label>
          <label className="text-sm text-gray-700 flex flex-col gap-1">
            구분
            <select
              value={form.kind}
              onChange={e => setForm(f => ({ ...f, kind: e.target.value }))}
              className={inputCls}
            >
              {SCHEDULE_KINDS.map(k => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-gray-700 flex flex-col gap-1 sm:col-span-2">
            일정명
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className={inputCls}
              placeholder="예: 행정사무감사 (보건복지국)"
              required
            />
          </label>
          <label className="text-sm text-gray-700 flex flex-col gap-1 sm:col-span-2">
            비고
            <input
              type="text"
              value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              className={inputCls}
            />
          </label>
          <div className="sm:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#1F4E79] px-4 py-2 text-sm font-medium text-white hover:bg-[#163a5f] transition-colors disabled:opacity-40"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      )}

      {/* 마감 알림 */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#1F4E79]">마감 알림</h2>
          <Link href="/docs" className="text-sm text-[#1F4E79] hover:underline">
            자료요구 관리 →
          </Link>
        </div>
        {deadlineAlerts.length === 0 ? (
          <p className="text-sm text-gray-400 py-3 text-center">
            7일 이내 마감 예정인 미제출 자료가 없습니다.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {deadlineAlerts.map(({ r, diff }) => {
              const overdue = diff < 0;
              const badge = overdue
                ? `${-diff}일 초과`
                : diff === 0
                ? '오늘 마감'
                : `D-${diff}`;
              return (
                <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
                  <span
                    className="inline-block min-w-[64px] text-center text-xs font-semibold rounded px-2 py-1 text-white"
                    style={{ backgroundColor: overdue ? '#C62828' : diff <= 2 ? '#B45309' : '#1F4E79' }}
                  >
                    {badge}
                  </span>
                  <span className="text-gray-800 flex-1 truncate">{r.title}</span>
                  <span className="text-gray-500 hidden sm:inline">{r.dept ?? ''}</span>
                  <span className="text-gray-400 w-24 text-right">{r.due_date}</span>
                  <span className="text-xs text-gray-500 w-16 text-right">{r.status}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 달력 */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-[#1F4E79]">{monthLabel}</h2>
            {ggcLoading && (
              <span className="text-xs text-[#0F766E]">의정캘린더 불러오는 중…</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => goMonth(-1)} className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-600 hover:bg-gray-50">←</button>
            <button onClick={goToday} className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50">오늘</button>
            <button onClick={() => goMonth(1)} className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-600 hover:bg-gray-50">→</button>
          </div>
        </div>

        {loading ? (
          <p className="text-gray-500 py-8 text-center text-sm">불러오는 중...</p>
        ) : (
          <div className="grid grid-cols-7 border-t border-l border-gray-200">
            {WEEKDAYS.map((w, i) => (
              <div
                key={w}
                className="border-r border-b border-gray-200 bg-gray-50 py-2 text-center text-xs font-semibold"
                style={{ color: i === 0 ? '#C62828' : i === 6 ? '#1F4E79' : '#374151' }}
              >
                {w}
              </div>
            ))}
            {grid.map((day, idx) => {
              const inMonth = day.getMonth() === cursor.getMonth();
              const ds = ymd(day);
              const isToday = ds === todayStr;
              const dayEvents = eventsByDate.get(ds) ?? [];
              const weekday = day.getDay();
              return (
                <div
                  key={idx}
                  className={[
                    'border-r border-b border-gray-200 min-h-[88px] p-1 align-top',
                    inMonth ? 'bg-white' : 'bg-gray-50/60',
                  ].join(' ')}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span
                      className={[
                        'text-xs px-1 rounded',
                        isToday ? 'bg-[#1F4E79] text-white font-bold' : '',
                      ].join(' ')}
                      style={{
                        color: isToday
                          ? '#fff'
                          : !inMonth
                          ? '#9ca3af'
                          : weekday === 0
                          ? '#C62828'
                          : weekday === 6
                          ? '#1F4E79'
                          : '#374151',
                      }}
                    >
                      {day.getDate()}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {dayEvents.slice(0, 4).map((e, i) => {
                      const cls =
                        'block text-left text-[10px] leading-tight rounded px-1 py-0.5 text-white truncate';
                      const style = {
                        backgroundColor: e.overdue ? '#7f1d1d' : e.color,
                      };
                      const prefix = e.kind === '마감' ? '⏰ ' : '';
                      // GGC 의정 일정: 원본 링크로 열기
                      if (e.source === 'ggc' && e.href) {
                        return (
                          <a
                            key={i}
                            href={e.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`${e.label} · 경기도의회 의정캘린더에서 보기`}
                            className={`${cls} hover:opacity-90`}
                            style={style}
                          >
                            {e.label}
                          </a>
                        );
                      }
                      return (
                        <button
                          key={i}
                          onClick={
                            e.source === 'custom' && e.eventId
                              ? () => handleDelete(e.eventId!)
                              : undefined
                          }
                          title={e.source === 'custom' ? `${e.label} (클릭하여 삭제)` : e.label}
                          className={cls}
                          style={style}
                        >
                          {prefix}
                          {e.label}
                        </button>
                      );
                    })}
                    {dayEvents.length > 4 && (
                      <span className="text-[10px] text-gray-400 px-1">
                        +{dayEvents.length - 4}건
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 범례 */}
        <div className="flex flex-wrap gap-3 pt-2 text-xs text-gray-500">
          {Object.entries(KIND_COLOR).map(([k, c]) => (
            <span key={k} className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: c }} />
              {k}
            </span>
          ))}
          <span className="text-gray-400">· 사용자 추가 일정은 클릭하면 삭제됩니다</span>
        </div>
        <p className="text-xs text-gray-400">
          기본 일정은 경기도의회{' '}
          {ggcSourceUrl ? (
            <a
              href={ggcSourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#0F766E] underline"
            >
              의정캘린더
            </a>
          ) : (
            '의정캘린더'
          )}
          에서 자동으로 가져옵니다. 의정 일정을 클릭하면 원본에서 세부 안건을 볼 수 있습니다.
        </p>
      </div>
    </div>
  );
}
