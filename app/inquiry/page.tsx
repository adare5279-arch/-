import { redirect } from 'next/navigation';

// 예산·결산 질의서는 도구 → 'AI 질의서'(/query)로 통합되었습니다.
// 기존 북마크 호환을 위해 영구 리다이렉트만 수행합니다.
export default function InquiryRedirect() {
  redirect('/query');
}
