import { render } from '@solidjs/testing-library';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Component } from 'solid-js';
import { useTimelineGate } from '../hooks/useTimelineGate';

const navigateMock = vi.fn();
let locationState = { pathname: '/feed', search: '' };
vi.mock('@solidjs/router', () => ({
  useNavigate: () => navigateMock,
  useLocation: () => locationState,
}));

let currentTimelineContext: any = null;
vi.mock('../providers/TimelineProvider', () => ({
  useTimelineContext: () => ({
    context: () => currentTimelineContext,
  }),
}));

let currentUser: { isAnon: boolean } | null = { isAnon: true };
vi.mock('../providers/UserProvider', () => ({
  useUser: () => ({
    user: () => currentUser,
  }),
}));

const Harness: Component = () => {
  useTimelineGate();
  return <div>gate</div>;
};

describe('useTimelineGate', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    currentTimelineContext = null;
    currentUser = { isAnon: true };
    locationState = { pathname: '/feed', search: '' };
  });

  it('redirects anonymous users without context to landing', async () => {
    render(() => <Harness />);
    await Promise.resolve();

    expect(navigateMock).toHaveBeenCalledWith('/landing?redirect=%2Ffeed', { replace: true });
  });

  it('does not redirect when already on landing', async () => {
    locationState = { pathname: '/landing', search: '' };
    render(() => <Harness />);
    await Promise.resolve();

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('does not redirect when context exists', async () => {
    currentTimelineContext = {};
    render(() => <Harness />);
    await Promise.resolve();

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('does not redirect authenticated users', async () => {
    currentUser = { isAnon: false };
    render(() => <Harness />);
    await Promise.resolve();

    expect(navigateMock).not.toHaveBeenCalled();
  });
});
