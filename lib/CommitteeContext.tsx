'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { COMMITTEES } from '@/lib/types';

type CommitteeContextValue = {
  committee: string;
  setCommittee: (c: string) => void;
};

const CommitteeContext = createContext<CommitteeContextValue | null>(null);

export function CommitteeProvider({ children }: { children: React.ReactNode }) {
  const [committee, setCommitteeState] = useState<string>(COMMITTEES[0]);

  useEffect(() => {
    const stored = localStorage.getItem('haengam_committee');
    if (stored && (COMMITTEES as readonly string[]).includes(stored)) {
      setCommitteeState(stored);
    }
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
