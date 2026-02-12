import { useState, useCallback } from 'react';
import type { AppScope } from '../types';
import { isPersonalMode } from '../services/api';

const SCOPE_KEY = 'mypa_active_scope';

function loadScope(): AppScope {
  if (!isPersonalMode) return { type: 'team' };
  try {
    const stored = localStorage.getItem(SCOPE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore parse errors
  }
  return { type: 'personal' };
}

export function useScope() {
  const [scope, setScope] = useState<AppScope>(loadScope);

  const switchScope = useCallback((newScope: AppScope) => {
    setScope(newScope);
    if (isPersonalMode) {
      localStorage.setItem(SCOPE_KEY, JSON.stringify(newScope));
    }
  }, []);

  // In team mode, scope is always "team" — no switching
  const canSwitch = isPersonalMode;

  return { scope, switchScope, canSwitch };
}
