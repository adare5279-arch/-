'use client';

// Supabase Realtime 기반 실시간 동기화 훅.
// 같은 위원회의 다른 사용자가 해당 테이블 데이터를 변경하면 onChange(보통 refetch)를 호출한다.
// 쓰기는 게이트웨이(service_role)로 이뤄지므로, 변경 사항이 anon 구독자에게 브로드캐스트된다.
// (대상 테이블은 supabase_realtime publication에 등록되어 있어야 한다.)
import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { invalidateQueryCache } from './queryCache';

type Opts = {
  table: string;
  committee: string;
  onChange: () => void;
  enabled?: boolean;
};

export function useRealtimeSync({ table, committee, onChange, enabled = true }: Opts) {
  const [live, setLive] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const cbRef = useRef(onChange);
  cbRef.current = onChange;

  useEffect(() => {
    if (!enabled || !committee) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`rt-${table}-${committee}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `committee=eq.${committee}` },
        () => {
          setLastEventAt(Date.now());
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            // 다른 사용자의 변경이므로 캐시를 버리고 새로 읽는다
            invalidateQueryCache(table);
            cbRef.current();
          }, 400); // 연속 변경 디바운스
        },
      )
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [table, committee, enabled]);

  return { live, lastEventAt };
}
