import { useState, useCallback, useEffect } from 'react';
import { onboarding, teams as teamsApi, userSettings } from '../services/api';

interface OnboardingScreenProps {
  userName: string;
  onComplete: () => void;
}

type Step = 'welcome' | 'team' | 'done';

export function OnboardingScreen({ userName, onComplete }: OnboardingScreenProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [teamName, setTeamName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [hasExistingTeam, setHasExistingTeam] = useState(false);

  // Check if user already belongs to a team (e.g., joined via invite)
  useEffect(() => {
    teamsApi.list().then(res => {
      if (res.data && res.data.length > 0) {
        setHasExistingTeam(true);
      }
    }).catch(() => {});
  }, []);

  const handleProfileDone = useCallback(async () => {
    try {
      await onboarding.completeStep('profile');
    } catch {
      // non-critical
    }
    // Skip team step if user already has a team (e.g., from invite)
    if (hasExistingTeam) {
      try {
        await onboarding.completeStep('team-tour');
      } catch { /* non-critical */ }
      setStep('done');
    } else {
      setStep('team');
    }
  }, [hasExistingTeam]);

  const handleCreateTeam = useCallback(async () => {
    const name = teamName.trim() || `${userName}'s Team`;
    setIsSubmitting(true);
    setError('');
    try {
      const team = await teamsApi.create(name);
      // Sync team to backend so PA context, briefing, CRM scoping know the team
      userSettings.registerTeam(team.data.id, team.data.name).catch(() => {});
      await onboarding.completeStep('team-tour');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create team');
      setIsSubmitting(false);
      return;
    }
    setStep('done');
    setIsSubmitting(false);
  }, [teamName, userName]);

  const handleSkipTeam = useCallback(async () => {
    try {
      await onboarding.completeStep('team-tour');
    } catch {
      // non-critical
    }
    setStep('done');
  }, []);

  const handleFinish = useCallback(() => {
    onComplete();
  }, [onComplete]);

  return (
    <div className="h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="w-full max-w-lg p-8">

        {step === 'welcome' && (
          <div className="text-center">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-3">
              Welcome, {userName}
            </h1>
            <p className="text-zinc-500 mb-8 leading-relaxed">
              Your Personal AI Assistant is ready. It can send messages, search your
              Library of Context, manage email and calendar, and coordinate with
              other PAs using the Tezit Protocol.
            </p>
            <div className="space-y-3 text-left mb-8">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                <span className="text-lg mt-0.5">&#9993;</span>
                <div>
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Tez Messaging</p>
                  <p className="text-xs text-zinc-500">Context-rich messages with searchable history and team memory</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                <span className="text-lg mt-0.5">&#128218;</span>
                <div>
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Library of Context</p>
                  <p className="text-xs text-zinc-500">Full-text search across all preserved context &mdash; voice, text, AI responses</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                <span className="text-lg mt-0.5">&#129302;</span>
                <div>
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">PA-to-PA Communication</p>
                  <p className="text-xs text-zinc-500">Your PA can send and receive structured messages with other PAs</p>
                </div>
              </div>
            </div>
            <button
              onClick={handleProfileDone}
              className="w-full py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
            >
              Continue
            </button>
          </div>
        )}

        {step === 'team' && (
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
              Create your first team
            </h2>
            <p className="text-zinc-500 mb-6 text-sm">
              Teams are shared spaces for Tez messages. Create one to start sending context-rich messages.
            </p>
            <input
              type="text"
              value={teamName}
              onChange={e => { setTeamName(e.target.value); setError(''); }}
              placeholder={`${userName}'s Team`}
              className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            />
            {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
            <button
              onClick={handleCreateTeam}
              disabled={isSubmitting}
              className="w-full py-3 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-40 hover:bg-blue-700 transition-colors mb-3"
            >
              {isSubmitting ? 'Creating...' : 'Create Team'}
            </button>
            <button
              onClick={handleSkipTeam}
              className="w-full py-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              Skip for now
            </button>
          </div>
        )}

        {step === 'done' && (
          <div className="text-center">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-3">
              You're all set
            </h2>
            <p className="text-zinc-500 mb-8 text-sm leading-relaxed">
              Head to the OpenClaw dashboard to chat with your PA, or use
              the Tez panel to send context-rich messages to your team.
            </p>
            <button
              onClick={handleFinish}
              className="w-full py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
            >
              Open MyPA
            </button>
          </div>
        )}

        {/* Progress dots */}
        <div className="flex justify-center gap-2 mt-8">
          {(['welcome', 'team', 'done'] as const).map(s => (
            <div
              key={s}
              className={`w-2 h-2 rounded-full transition-colors ${
                s === step ? 'bg-blue-600' : 'bg-zinc-300 dark:bg-zinc-700'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
