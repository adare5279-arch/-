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
  type: string;
  content: string;
  action: string | null;
  proc: string;
  created_at: string;
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
  created_at: string;
};

export const ISSUE_TYPES = ["위법", "부당", "개선", "권고", "주의"] as const;
export const ISSUE_PROCS = ["미처리", "처리중", "처리완료"] as const;
export const WITNESS_KINDS = ["증인", "참고인"] as const;
export const WITNESS_ATTENDS = ["출석예정", "출석완료", "불출석"] as const;
