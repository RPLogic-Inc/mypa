import { useState, useEffect, useCallback } from 'react';
import type { AppView } from '../types';

const VIEW_PATHS: Record<AppView, string> = {
  chat: '/chat',
  inbox: '/inbox',
  artifacts: '/artifacts',
  library: '/library',
  settings: '/settings',
};

function getBasePath(): string {
  const path = window.location.pathname;
  if (path.startsWith('/__openclaw__/canvas')) {
    return '/__openclaw__/canvas';
  }
  return '';
}

function pathToView(pathname: string): AppView {
  let path = pathname;
  if (path.startsWith('/__openclaw__/canvas')) {
    path = path.slice('/__openclaw__/canvas'.length);
  }
  path = path.replace(/\/$/, '') || '/';

  switch (path) {
    case '/inbox': return 'inbox';
    case '/stream': return 'inbox';  // backwards compat
    case '/comms': return 'inbox';   // backwards compat
    case '/artifacts': return 'artifacts';
    case '/library': return 'library';
    case '/settings': return 'settings';
    case '/':
    case '/chat':
    default: return 'chat';
  }
}

export function useRouter() {
  const [basePath] = useState(getBasePath);
  const [activeView, setActiveViewState] = useState<AppView>(() => pathToView(window.location.pathname));

  const setActiveView = useCallback((view: AppView) => {
    setActiveViewState(view);
    const url = basePath + VIEW_PATHS[view];
    window.history.pushState({ view }, '', url);
  }, [basePath]);

  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      if (e.state?.view) {
        setActiveViewState(e.state.view);
      } else {
        setActiveViewState(pathToView(window.location.pathname));
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Replace current history entry on mount so back button works from the start
  useEffect(() => {
    window.history.replaceState({ view: activeView }, '', window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { activeView, setActiveView };
}
