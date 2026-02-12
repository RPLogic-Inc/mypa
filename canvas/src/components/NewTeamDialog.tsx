import { useState } from 'react';
import { teams, userSettings } from '../services/api';
import type { Team } from '../types';

interface NewTeamDialogProps {
  onClose: () => void;
  onCreate: (team: Team) => void;
}

export function NewTeamDialog({ onClose, onCreate }: NewTeamDialogProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setCreating(true);
    setError('');
    try {
      const res = await teams.create(trimmed);
      // Sync to backend so PA context/briefing know the team
      userSettings.registerTeam(res.data.id, res.data.name).catch(() => {});
      onCreate(res.data);
    } catch {
      setError('Failed to create team');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-xl w-full max-w-md p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">New Team</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-xl">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); setError(''); }}
            placeholder="Team name..."
            className="w-full px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={!name.trim() || creating}
            className="w-full py-2 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-40 hover:bg-blue-700 transition-colors"
          >
            {creating ? 'Creating...' : 'Create Team'}
          </button>
        </form>
      </div>
    </div>
  );
}
