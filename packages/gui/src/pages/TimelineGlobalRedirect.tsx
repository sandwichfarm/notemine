import { Component, onCleanup } from 'solid-js';
import { useNavigate } from '@solidjs/router';

const TimelineGlobalRedirect: Component = () => {
  const navigate = useNavigate();
  const params = new URLSearchParams();
  params.set('notice', 'global-deprecated');
  params.set('redirect', '/feed');

  const timeout = setTimeout(() => {
    navigate(`/landing?${params.toString()}`, { replace: true });
  }, 2000);

  onCleanup(() => clearTimeout(timeout));

  return (
    <div class="card p-6 space-y-3 text-center">
      <h1 class="text-2xl font-bold">Global Timeline Removed</h1>
      <p class="text-text-secondary">
        The global proof-of-work feed has been retired. Anonymous browsing now starts from a curated Web-of-Trust seed.
      </p>
      <p class="text-sm text-text-tertiary">
        Redirecting you to the landing page…
      </p>
      <button
        class="btn mt-4"
        onClick={() => navigate(`/landing?${params.toString()}`, { replace: true })}
      >
        Go to Landing Now
      </button>
    </div>
  );
};

export default TimelineGlobalRedirect;
