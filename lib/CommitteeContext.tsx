'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';
import { COMMITTEES } from '@/lib/types';

type CommitteeContextValue = {
  committee: string;
  setCommittee: (c: string) => void;
};

const CommitteeContext = createContext<CommitteeContextValue | null>(null);

// 저장된 위원회 복원은 페인트 전에 끝나야 한다.
// useEffect로 복원하면 (1) 기본 위원회로 한 번 조회하고 (2) 복원 후 다시 조회해서
// 모든 화면이 매번 두 배의 요청을 보낸다. 레이아웃 이펙트는 하위 페이지의
// 데이터 조회(useEffect)보다 먼저 실행되므로 조회가 한 번으로 끝난다.
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function CommitteeProvider({ children }: { children: React.ReactNode }) {
  // 복원 전에는 빈 문자열 — 페이지는 committee가 빈 값이면 조회를 건너뛴다.
  const [committee, setCommitteeState] = useState<string>('');

  useIsomorphicLayoutEffect(() => {
    const stored = localStorage.getItem('haengam_committee');
    setCommitteeState(
      stored && (COMMITTEES as readonly string[]).includes(stored)
        ? stored
        : COMMITTEES[0],
    );
  }, []);

  const setCommittee = (c: string) => {
    setCommitteeState(c);
    localStorage.setItem('haengam_committee', c);
  };

  return (
    <CommitteeContext.Provider value={{ committee, setCommittee }}>
      {children}
    </CommitteeContext.Provider>
  );
}

export function useCommittee(): CommitteeContextValue {
  const ctx = useContext(CommitteeContext);
  if (ctx === null) {
    throw new Error('useCommittee must be used within a CommitteeProvider');
  }
  return ctx;
}
