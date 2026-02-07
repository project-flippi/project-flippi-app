import { useEffect, useState } from 'react';
import {
  defaultServiceStatus,
  type ServiceStatus,
} from '../../common/statusTypes';

export default function useServiceStatus(): ServiceStatus {
  const [status, setStatus] = useState<ServiceStatus>(defaultServiceStatus);

  useEffect(() => {
    window.flippiStatus
      .get()
      .then((s) => setStatus(s))
      .catch(() => {
        // keep defaults if fetch fails
      });

    const unsub = window.flippiStatus.onChanged((s) => setStatus(s));

    return () => {
      unsub();
    };
  }, []);

  return status;
}
