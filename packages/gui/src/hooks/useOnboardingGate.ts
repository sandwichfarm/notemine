import { createEffect } from 'solid-js';
import { useLocation, useNavigate } from '@solidjs/router';
import { useUser } from '../providers/UserProvider';
import {
  getOnboardingCompletion,
  getOnboardingSnapshot,
  shouldForceOnboarding,
} from '../lib/onboarding-progress';
import { debug } from '../lib/debug';

const isBrowser = () => typeof window !== 'undefined';

export const useOnboardingGate = () => {
  const { user } = useUser();
  const navigate = useNavigate();
  const location = useLocation();

  createEffect(() => {
    if (!isBrowser()) return;
    const currentUser = user();
    const snapshot = getOnboardingSnapshot();
    const completion = getOnboardingCompletion();
    const forceOnboarding = shouldForceOnboarding(snapshot, completion, currentUser?.pubkey);
    const isOnboardingRoute = location.pathname === '/onboarding';

    if (forceOnboarding && !isOnboardingRoute) {
      debug('[OnboardingGate] redirecting to onboarding (incomplete flow detected)');
      navigate('/onboarding', { replace: true });
      return;
    }

    if (isOnboardingRoute && currentUser && !currentUser.isAnon) {
      if (!snapshot.hasDraft) {
        debug('[OnboardingGate] blocking onboarding for signed-in user without draft');
        navigate('/feed', { replace: true });
        return;
      }
      if (snapshot.pubkey && snapshot.pubkey !== currentUser.pubkey) {
        debug('[OnboardingGate] draft belongs to another key, redirecting to feed');
        navigate('/feed', { replace: true });
      }
    }
  });
};
