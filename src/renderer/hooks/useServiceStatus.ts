import { useEffect, useState } from 'react';
import { defaultServiceStatus, type ServiceStatus } from '../../common/statusTypes';

export function useServiceStatus(): ServiceStatus {
  const [status, setStatus] = useState<ServiceStatus>(defaultServiceStatus);

  useEffect(() => {
    let unsub: undefined | (() => void);

    window.flippiStatus
      .get()
      .then((s) => setStatus(s))
      .catch(() => {
        // keep defaults if fetch fails
      });

    unsub = window.flippiStatus.onChanged((s) => setStatus(s));

    return () => {
      if (unsub) unsub();
    };
  }, []);

  return status;
}
