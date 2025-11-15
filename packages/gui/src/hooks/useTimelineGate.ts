import { createEffect } from 'solid-js';
import { useNavigate, useLocation } from '@solidjs/router';
import { useUser } from '../providers/UserProvider';
import { useTimelineContext } from '../providers/TimelineProvider';

export const useTimelineGate = () => {
  const { context } = useTimelineContext();
  const { user } = useUser();
  const navigate = useNavigate();
  const location = useLocation();

  createEffect(() => {
    const currentUser = user();
    if (!currentUser) return;
    if (location.pathname.startsWith('/landing')) return;
    if (!currentUser.isAnon) return;
    if (context()) return;

    const params = new URLSearchParams();
    params.set('redirect', location.pathname + location.search);
    navigate(`/landing?${params.toString()}`, { replace: true });
  });
};
