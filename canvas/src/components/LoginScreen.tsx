import { useEffect, useMemo, useState } from 'react';
import { auth, teamInvitesApi, invitesApi, ApiError } from '../services/api';

interface LoginScreenProps {
  onLogin: (jwt: string, userId: string) => void;
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const segments = jwt.split('.');
  if (segments.length < 2) {
    throw new Error('Invalid JWT format');
  }
  const base64Url = segments[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const payloadJson = atob(padded);
  return JSON.parse(payloadJson);
}

function decodeUserId(jwt: string): string {
  const payload = decodeJwtPayload(jwt);
  const sub = payload.sub;
  if (!sub || typeof sub !== 'string') {
    throw new Error('Token must contain a "sub" claim');
  }
  return sub;
}

function getExistingSessionToken(): string | null {
  const keys = [
    'tezit_token',
    'mypa_access_token',
  ];

  for (const key of keys) {
    const token = localStorage.getItem(key);
    if (token) return token;
  }
  return null;
}

type AuthMode = 'login' | 'register' | 'forgot' | 'reset' | 'verify-email';

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [paDisplayName, setPaDisplayName] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [verifyStatus, setVerifyStatus] = useState<'pending' | 'success' | 'error' | null>(null);

  // Invite URL state
  const [inviteBanner, setInviteBanner] = useState<{
    teamName?: string;
    type: 'team' | 'pa';
    email?: string;
  } | null>(null);
  const [inviteValidating, setInviteValidating] = useState(false);

  // Parse ?reset=TOKEN or ?invite=TOKEN from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // Handle password reset link
    const resetParam = params.get('reset');
    if (resetParam) {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('reset');
      window.history.replaceState({}, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
      setResetToken(resetParam);
      setMode('reset');
      return;
    }

    // Handle email verification link
    const verifyParam = params.get('verify');
    if (verifyParam) {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('verify');
      window.history.replaceState({}, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
      setMode('verify-email');
      setVerifyStatus('pending');
      auth.confirmVerifyEmail(verifyParam)
        .then(() => {
          setVerifyStatus('success');
        })
        .catch(() => {
          setVerifyStatus('error');
        });
      return;
    }

    const inviteParam = params.get('invite');
    if (!inviteParam) return;

    // Clean the URL to remove the invite param
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('invite');
    window.history.replaceState({}, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);

    // Auto-fill and switch to register mode
    setInviteCode(inviteParam);
    setMode('register');

    // Determine invite type and validate
    // Team invites are 8-char alphanumeric codes; PA invites are 64-char hex tokens
    const isTeamInvite = inviteParam.length <= 16;
    setInviteValidating(true);

    if (isTeamInvite) {
      teamInvitesApi.validate(inviteParam)
        .then((result) => {
          if (result.valid && result.team) {
            setInviteBanner({ type: 'team', teamName: result.team.name, email: result.invite?.email || undefined });
            if (result.invite?.email) {
              setEmail(result.invite.email);
            }
          } else {
            setInviteBanner({ type: 'team' });
          }
        })
        .catch((err) => {
          // If validation fails, still show a generic banner
          if (err instanceof ApiError && err.message) {
            setError(err.message);
          }
          setInviteBanner({ type: 'team' });
        })
        .finally(() => setInviteValidating(false));
    } else {
      invitesApi.validate(inviteParam)
        .then((result) => {
          setInviteBanner({ type: 'pa', email: result.data.email });
          if (result.data.email) {
            setEmail(result.data.email);
          }
        })
        .catch((err) => {
          if (err instanceof ApiError && err.message) {
            setError(err.message);
          }
          setInviteBanner({ type: 'pa' });
        })
        .finally(() => setInviteValidating(false));
    }
  }, []);

  const authEndpoints = useMemo(() => {
    const endpoints = new Set<string>();
    const envAuthUrl = import.meta.env.VITE_AUTH_URL as string | undefined;
    if (envAuthUrl?.trim()) {
      endpoints.add(envAuthUrl.trim());
    }
    endpoints.add(`${window.location.origin}/api/auth/login`);
    const loginBaseDomain = import.meta.env.VITE_BASE_DOMAIN || 'mypa.chat';
    endpoints.add(`https://api.${loginBaseDomain}/api/auth/login`);
    return Array.from(endpoints);
  }, []);

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    setError('');
    setIsSubmitting(true);

    let lastError = 'Unable to sign in';

    for (const endpoint of authEndpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), password }),
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = body?.error?.message;
          if (typeof message === 'string' && message.trim()) {
            lastError = message;
          } else {
            lastError = `Sign in failed (${response.status})`;
          }
          continue;
        }

        const accessToken =
          body?.data?.tokens?.accessToken ??
          body?.data?.accessToken;
        const refreshToken =
          body?.data?.tokens?.refreshToken ??
          body?.data?.refreshToken;

        if (!accessToken || typeof accessToken !== 'string') {
          lastError = 'Sign in succeeded but no access token was returned';
          continue;
        }

        if (refreshToken && typeof refreshToken === 'string') {
          localStorage.setItem('tezit_refresh_token', refreshToken);
        }

        const userId = decodeUserId(accessToken);
        onLogin(accessToken, userId);
        return;
      } catch {
        lastError = 'Unable to reach the login service';
      }
    }

    setError(lastError);
    setIsSubmitting(false);
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) return;
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const result = await auth.register({
        name: name.trim(),
        email: email.trim(),
        password,
        ...(inviteCode.trim() ? { inviteCode: inviteCode.trim() } : {}),
      });

      const { tokens, user } = result.data;

      if (tokens.refreshToken) {
        localStorage.setItem('tezit_refresh_token', tokens.refreshToken);
      }

      // Set PA display name if provided
      if (paDisplayName.trim()) {
        localStorage.setItem('tezit_token', tokens.accessToken);
        try {
          await auth.updatePAPreferences({ paDisplayName: paDisplayName.trim() });
        } catch {
          // Non-critical — preferences can be set later
        }
      }

      onLogin(tokens.accessToken, user.id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setError(message);
      setIsSubmitting(false);
    }
  };

  const handleUseExistingSession = () => {
    setError('');
    const existing = getExistingSessionToken();
    if (!existing) {
      setError('No existing MyPA session found in this browser');
      return;
    }
    try {
      const userId = decodeUserId(existing);
      onLogin(existing, userId);
    } catch {
      setError('Found a saved token, but it is invalid or expired');
    }
  };

  const handleTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const jwt = token.trim();
    if (!jwt) return;

    try {
      const userId = decodeUserId(jwt);
      onLogin(jwt, userId);
    } catch {
      setError('Invalid JWT token');
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError('');
    setIsSubmitting(true);
    try {
      const result = await auth.forgotPassword(email.trim());
      setResetSuccess(result.message);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send reset email';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword.trim() || newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      const result = await auth.resetPassword(resetToken, newPassword);
      setResetSuccess(result.message);
      setMode('login');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to reset password';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setError('');
    setResetSuccess('');
  };

  return (
    <div className="h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="w-full max-w-md p-8">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
          {mode === 'login' ? 'Sign In' : mode === 'register' ? 'Create Account' : mode === 'forgot' ? 'Reset Password' : mode === 'verify-email' ? 'Email Verification' : 'New Password'}
        </h1>
        <p className="text-zinc-500 mb-6">
          {mode === 'login'
            ? 'Sign in with your MyPA account'
            : mode === 'register'
            ? 'Set up your Personal AI Assistant'
            : mode === 'forgot'
            ? 'We\'ll send you a link to reset your password'
            : mode === 'verify-email'
            ? 'Confirming your email address...'
            : 'Enter your new password below'}
        </p>

        {/* Invite banner */}
        {inviteBanner && (
          <div className="mb-4 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 px-4 py-3">
            {inviteValidating ? (
              <p className="text-sm text-blue-700 dark:text-blue-300">Validating invite...</p>
            ) : inviteBanner.teamName ? (
              <p className="text-sm text-blue-700 dark:text-blue-300">
                You've been invited to join <span className="font-semibold">{inviteBanner.teamName}</span>! Create an account to get started.
              </p>
            ) : inviteBanner.type === 'pa' ? (
              <p className="text-sm text-blue-700 dark:text-blue-300">
                You've been invited! Create an account to set up your Personal AI Assistant.
              </p>
            ) : (
              <p className="text-sm text-blue-700 dark:text-blue-300">
                You've been invited! Create an account to join.
              </p>
            )}
          </div>
        )}

        {/* Mode toggle — only for login/register */}
        {(mode === 'login' || mode === 'register') && (
          <div className="flex mb-6 bg-zinc-100 dark:bg-zinc-900 rounded-lg p-1">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === 'login'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === 'register'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              Create Account
            </button>
          </div>
        )}

        {mode === 'login' && (
          <>
            <form onSubmit={handleCredentialsSubmit} className="space-y-4">
              <div>
                <input
                  type="email"
                  value={email}
                  onChange={e => {
                    setEmail(e.target.value);
                    setError('');
                  }}
                  placeholder="Email"
                  autoComplete="email"
                  className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <input
                  type="password"
                  value={password}
                  onChange={e => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  placeholder="Password"
                  autoComplete="current-password"
                  className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {error && (
                <p className="text-sm text-red-500">{error}</p>
              )}

              <button
                type="submit"
                disabled={!email.trim() || !password.trim() || isSubmitting}
                className="w-full py-3 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-40 hover:bg-blue-700 transition-colors"
              >
                {isSubmitting ? 'Signing in...' : 'Sign In'}
              </button>

              <div className="flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="button"
                onClick={handleUseExistingSession}
                className="w-full py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Use Existing MyPA Session
              </button>
            </form>

            <button
              type="button"
              onClick={() => setShowAdvanced(v => !v)}
              className="mt-5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 underline"
            >
              {showAdvanced ? 'Hide advanced token login' : 'Advanced: paste JWT token'}
            </button>

            {showAdvanced && (
              <form onSubmit={handleTokenSubmit} className="space-y-4 mt-4">
                <div>
                  <textarea
                    value={token}
                    onChange={e => {
                      setToken(e.target.value);
                      setError('');
                    }}
                    placeholder="eyJhbGciOiJIUzI1NiIs..."
                    rows={4}
                    className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!token.trim()}
                  className="w-full py-3 rounded-lg bg-zinc-700 text-white font-medium disabled:opacity-40 hover:bg-zinc-800 transition-colors"
                >
                  Connect with Token
                </button>
              </form>
            )}
          </>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-4">
            <div>
              <input
                type="text"
                value={name}
                onChange={e => {
                  setName(e.target.value);
                  setError('');
                }}
                placeholder="Your name"
                autoComplete="name"
                className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <input
                type="email"
                value={email}
                onChange={e => {
                  setEmail(e.target.value);
                  setError('');
                }}
                placeholder="Email"
                autoComplete="email"
                className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <input
                type="password"
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  setError('');
                }}
                placeholder="Password (min 8 characters)"
                autoComplete="new-password"
                className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <input
                type="text"
                value={paDisplayName}
                onChange={e => {
                  setPaDisplayName(e.target.value);
                  setError('');
                }}
                placeholder="PA display name (e.g. &quot;Friday&quot;)"
                className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-zinc-400 mt-1">What should your AI assistant be called?</p>
            </div>
            <div>
              <input
                type="text"
                value={inviteCode}
                onChange={e => {
                  setInviteCode(e.target.value);
                  setError('');
                }}
                placeholder="Invite code (optional)"
                className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}

            <button
              type="submit"
              disabled={!name.trim() || !email.trim() || !password.trim() || isSubmitting}
              className="w-full py-3 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-40 hover:bg-blue-700 transition-colors"
            >
              {isSubmitting ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
        )}

        {mode === 'forgot' && (
          <>
            {resetSuccess ? (
              <div className="space-y-4">
                <p className="text-sm text-green-600 dark:text-green-400">{resetSuccess}</p>
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="w-full py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  Back to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit} className="space-y-4">
                <p className="text-sm text-zinc-500">Enter your email and we'll send you a reset link.</p>
                <div>
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError(''); }}
                    placeholder="Email"
                    autoComplete="email"
                    className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <button
                  type="submit"
                  disabled={!email.trim() || isSubmitting}
                  className="w-full py-3 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-40 hover:bg-blue-700 transition-colors"
                >
                  {isSubmitting ? 'Sending...' : 'Send Reset Link'}
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="w-full py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  Back to Sign In
                </button>
              </form>
            )}
          </>
        )}

        {mode === 'reset' && (
          <>
            {resetSuccess ? (
              <div className="space-y-4">
                <p className="text-sm text-green-600 dark:text-green-400">{resetSuccess}</p>
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="w-full py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
                >
                  Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetSubmit} className="space-y-4">
                <p className="text-sm text-zinc-500">Choose a new password for your account.</p>
                <div>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => { setNewPassword(e.target.value); setError(''); }}
                    placeholder="New password (min 8 characters)"
                    autoComplete="new-password"
                    className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <button
                  type="submit"
                  disabled={!newPassword.trim() || newPassword.length < 8 || isSubmitting}
                  className="w-full py-3 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-40 hover:bg-blue-700 transition-colors"
                >
                  {isSubmitting ? 'Resetting...' : 'Reset Password'}
                </button>
              </form>
            )}
          </>
        )}

        {mode === 'verify-email' && (
          <div className="space-y-4">
            {verifyStatus === 'pending' && (
              <p className="text-sm text-zinc-500">Verifying your email address...</p>
            )}
            {verifyStatus === 'success' && (
              <>
                <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 px-4 py-3">
                  <p className="text-sm text-green-700 dark:text-green-300">
                    Your email has been verified successfully!
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="w-full py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
                >
                  Sign In
                </button>
              </>
            )}
            {verifyStatus === 'error' && (
              <>
                <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-3">
                  <p className="text-sm text-red-700 dark:text-red-300">
                    This verification link is invalid or has expired. Please sign in and request a new one.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="w-full py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
                >
                  Sign In
                </button>
              </>
            )}
          </div>
        )}

        <p className="text-xs text-zinc-400 mt-6 text-center">
          {mode === 'login'
            ? 'Don\'t have an account? Switch to Create Account above.'
            : mode === 'register'
            ? 'After registration, you\'ll be taken to your OpenClaw dashboard.'
            : ''}
        </p>
      </div>
    </div>
  );
}
