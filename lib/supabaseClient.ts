import { createClient } from "@supabase/supabase-js";
import { cachedFetch } from "./queryCache";

// 아래 두 값은 브라우저에 공개되도록 설계된 값(NEXT_PUBLIC_, anon 키)입니다.
// 로그인 없는 앱이라 anon 키는 RLS 정책으로만 보호되며 공개돼도 무방합니다.
// Vercel 등 배포 환경에 환경변수를 설정하면 그 값이 우선 사용되고,
// 없으면 아래 기본값(현재 Supabase 프로젝트)으로 동작합니다.
// ⚠️ ANTHROPIC/OPENAI 등 서버 전용 비밀키는 절대 이곳에 넣지 마세요.
const DEFAULT_URL = "https://mrfcwyfpkreicemwxhrv.supabase.co";
const DEFAULT_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yZmN3eWZwa3JlaWNlbXd4aHJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNzYxMzksImV4cCI6MjA5NTk1MjEzOX0.dVmvEp32hYoydnrluwJMeJ9-RvTjVL_N5BB8pViCY0Q";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;

// 조회 응답은 짧게 캐시한다(화면 재방문 시 즉시 표시). 쓰기·실시간 변경 시 무효화됨.
export const supabase = createClient(url, anonKey, {
  global: { fetch: cachedFetch },
});
