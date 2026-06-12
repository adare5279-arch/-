import { createClient } from '@supabase/supabase-js';

// 서버 전용 Supabase 클라이언트.
// 백엔드 쓰기 게이트웨이(/api/data)에서만 사용한다.
// service role 키가 환경변수에 있으면 우선 사용(감사로그 무결성·RLS 우회),
// 없으면 anon 키로 폴백한다(현재 RLS가 쓰기를 허용하므로 동작 동일).
// ⚠️ 이 파일은 서버에서만 import 되어야 한다. 클라이언트 번들에 포함 금지.
const DEFAULT_URL = 'https://mrfcwyfpkreicemwxhrv.supabase.co';
const DEFAULT_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yZmN3eWZwa3JlaWNlbXd4aHJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNzYxMzksImV4cCI6MjA5NTk1MjEzOX0.dVmvEp32hYoydnrluwJMeJ9-RvTjVL_N5BB8pViCY0Q';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  DEFAULT_ANON_KEY;

export const supabaseServer = createClient(url, key, {
  auth: { persistSession: false },
});
