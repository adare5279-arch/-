export type Member = {
  id: number;
  committee: string;
  name: string;
  role: string;
  party: string | null;
  district: string | null;
  photo_url: string | null;
};

export type Meeting = {
  id: number;
  committee: string;
  date: string;
  year: number;
};

export type Department = {
  id: number;
  committee: string;
  name: string;
  url: string | null;
};

export type MaterialRequest = {
  id: number;
  committee: string | null;
  member: string | null;
  dept_main: string | null;
  dept: string | null;
  title: string;
  req_date: string | null;
  due_date: string | null;
  status: string;
  note: string | null;
  file_url: string | null;
  file_name: string | null;
  created_at: string;
};

export const COMMITTEES = [
  "의회운영위원회",
  "기획재정위원회",
  "경제노동위원회",
  "안전행정위원회",
  "문화체육관광위원회",
  "농정해양위원회",
  "보건복지위원회",
  "건설교통위원회",
  "도시환경위원회",
  "미래과학협력위원회",
  "여성가족평생교육위원회",
  "교육기획위원회",
  "교육행정위원회",
] as const;

export const REQUEST_STATUSES = ["미제출", "제출완료", "부분제출", "제출불가"] as const;

export type Issue = {
  id: number;
  committee: string | null;
  date: string | null;
  dept: string | null;
  member: string | null;
  type: string;
  content: string;
  action: string | null;
  proc: string;
  request_id: number | null;
  file_url: string | null;
  file_name: string | null;
  created_at: string;
  // 시정요구 사후관리
  corr_due: string | null;        // 시정 기한
  corr_status: string | null;     // 이행 상태
  corr_reply: string | null;      // 부서 회신 내용
  corr_reply_date: string | null; // 회신일
};

export type Witness = {
  id: number;
  committee: string | null;
  kind: string;
  name: string;
  org: string | null;
  pos: string | null;
  dt: string | null;
  attend: string;
  phone: string | null;
  note: string | null;
  file_url: string | null;
  file_name: string | null;
  created_at: string;
};

export type ScheduleEvent = {
  id: number;
  committee: string | null;
  date: string;
  title: string;
  kind: string;
  note: string | null;
  created_at: string;
};

export const SCHEDULE_KINDS = ["감사", "회의", "현장방문", "일정"] as const;

export type MeetingStatement = {
  id: number;
  meeting_id: number;
  committee: string | null;
  speaker: string;
  role: string | null;
  summary: string | null;
  turns: number;
  chars: number;
  method: string; // 'ai' | 'rule'
  created_at: string;
};

export type MeetingMinutes = {
  id: number;
  committee: string | null;
  source: string; // 'audio' | 'doc'
  title: string | null;
  meeting_date: string | null;
  audio_url: string | null;
  audio_name: string | null;
  transcript: string | null;
  summary: string | null;
  created_at: string;
};

export type ActivityLog = {
  id: number;
  table_name: string;
  op: string;
  row_id: number | null;
  committee: string | null;
  summary: string | null;
  created_at: string;
};

export type BudgetItem = {
  id: number;
  committee: string | null;
  year: number;
  field: string | null;     // 분야 (예: 의정활동, 홍보 등)
  dept: string | null;      // 소관부서
  program: string;          // 사업명
  budget: number;           // 예산현액 (천원)
  executed: number;         // 집행액 (천원)
  carryover: number;        // 이월액 (천원)
  note: string | null;
  created_at: string;
};

// 재정건전성 지표 (지방재정365 공시 기반)
export type FiscalIndicator = {
  id: number;
  org_name: string;
  year: number;
  fin_independence: number | null;          // 재정자립도 %
  fin_autonomy: number | null;              // 재정자주도 %
  integrated_balance_ratio: number | null;  // 통합재정수지비율 %
  debt_ratio: number | null;                // 관리채무비율 %
  avg_independence: number | null;          // 전국 시도 평균
  avg_autonomy: number | null;
  avg_integrated_balance_ratio: number | null;
  avg_debt_ratio: number | null;
  own_revenue: number | null;               // 자체수입 (백만원)
  budget_total: number | null;              // 일반회계 예산규모 (백만원)
  note: string | null;
  source_url: string | null;
  created_at: string;
};

// 예산 분야 분류 (지방재정 세출예산 성질별 구분)
export const BUDGET_FIELDS = [
  "행정운영경비",
  "정책사업",
  "재무활동",
  "예비비",
  "기타",
] as const;

export const ISSUE_TYPES = ["위법", "부당", "개선", "권고", "주의"] as const;
export const ISSUE_PROCS = ["미처리", "처리중", "처리완료"] as const;
// 시정요구 사후관리 이행 상태
export const CORR_STATUSES = ["미조치", "조치중", "조치완료", "불수용"] as const;
export const WITNESS_KINDS = ["증인", "참고인"] as const;
export const WITNESS_ATTENDS = ["출석예정", "출석완료", "불출석"] as const;
