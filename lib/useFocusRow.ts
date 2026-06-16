'use client';

import { useEffect, useState } from 'react';

// 다른 화면(예: AI 데모의 근거 인용)에서 `?focus=<id>` 로 진입했을 때,
// 데이터 로딩이 끝나면 해당 행으로 스크롤하고 잠시 강조 표시한다.
// 사용처는 행 요소에 id={`row-${id}`} 를 달고, 반환된 focusId 와 비교해 강조 클래스를 준다.
export function useFocusRow(ready: boolean): number | null {
  const [focusId, setFocusId] = useState<number | null>(null);

  useEffect(() => {
    if (!ready) return;
    const raw = new URLSearchParams(window.location.search).get('focus');
    const id = raw ? Number(raw) : NaN;
    if (!Number.isFinite(id)) return;

    setFocusId(id);
    // 행이 그려진 뒤 스크롤
    const scrollTimer = setTimeout(() => {
      const el = document.getElementById(`row-${id}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    // 일정 시간 후 강조 해제
    const clearTimer = setTimeout(() => setFocusId(null), 4000);

    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(clearTimer);
    };
  }, [ready]);

  return focusId;
}
