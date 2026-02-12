import { useState, useCallback, useEffect } from 'react';
import { contacts, onboarding, auth as authApi } from '../services/api';
import { setCurrentUserId as setChatStorageUserId } from '../lib/chatStorage';

function getInitialToken(): string | null {
  const keys = ['tezit_token', 'mypa_access_token'];
  for (const key of keys) {
    const token = localStorage.getItem(key);
    if (token) return token;
  }
  return null;
}

export function useAuth() {
  const [token, setToken] = useState<string | null>(getInitialToken);
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentUserName, setCurrentUserName] = useState('');
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  // Default to true to avoid flash of verification banner before we know the real state
  const [emailVerified, setEmailVerified] = useState(true);

  const handleLogin = useCallback((jwt: string, userId: string) => {
    localStorage.setItem('tezit_token', jwt);
    setToken(jwt);
    setCurrentUserId(userId);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('tezit_token');
    setToken(null);
    setCurrentUserId('');
    setCurrentUserName('');
    setEmailVerified(true);
    setChatStorageUserId(null);
  }, []);

  const resendVerification = useCallback(async () => {
    try {
      await authApi.sendVerifyEmail();
      return true;
    } catch {
      return false;
    }
  }, []);

  // Decode token, register contact, check onboarding, check email verified
  useEffect(() => {
    if (!token) return;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const userId = payload.sub || '';
      setCurrentUserId(userId);
      setChatStorageUserId(userId);
      setCurrentUserName(payload.name || payload.email || '');

      // Register as relay contact
      contacts.register({
        displayName: payload.name || payload.email || payload.sub,
        email: payload.email,
      }).catch(() => {});
    } catch {
      // invalid token
    }

    onboarding.status().then(res => {
      setNeedsOnboarding(res.hasOnboarding && !res.isComplete);
    }).catch(() => {
      setNeedsOnboarding(false);
    });

    // Check email verification status via /auth/verify which returns emailVerified
    fetch(getBackendBaseUrl() + '/auth/verify', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.user && typeof data.user.emailVerified === 'boolean') {
          setEmailVerified(data.user.emailVerified);
        }
      })
      .catch(() => {
        // Non-critical — keep default (true) to avoid false banner
      });
  }, [token]);

  return {
    token,
    currentUserId,
    currentUserName,
    needsOnboarding,
    setNeedsOnboarding,
    emailVerified,
    setEmailVerified,
    resendVerification,
    handleLogin,
    handleLogout,
  };
}

/**
 * Get backend base URL (matching api.ts logic for consistency).
 */
function getBackendBaseUrl(): string {
  if (typeof window === 'undefined') return '/api';
  const host = window.location.hostname.toLowerCase();
  const baseDomain = import.meta.env.VITE_BASE_DOMAIN || 'mypa.chat';
  if (host === `oc.${baseDomain}` || host === `app.${baseDomain}`) return '/api';
  if (host.endsWith(`.${baseDomain}`)) return `https://api.${baseDomain}/api`;
  if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:3001/api';
  return '/api';
}
