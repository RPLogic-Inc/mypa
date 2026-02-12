import { useState } from 'react';
import { contacts, conversations } from '../services/api';
import type { Contact, Conversation } from '../types';

interface NewChatDialogProps {
  onClose: () => void;
  onCreate: (conv: Conversation) => void;
  currentUserId: string;
}

export function NewChatDialog({ onClose, onCreate, currentUserId }: NewChatDialogProps) {
  const [mode, setMode] = useState<'dm' | 'group'>('dm');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Contact[]>([]);
  const [groupName, setGroupName] = useState('');
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (query.trim().length < 2) return;
    setSearching(true);
    setError('');
    try {
      const res = await contacts.search(query.trim());
      setResults(res.data.filter(c => c.id !== currentUserId));
    } catch {
      setError('Search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleSelectDm = async (contact: Contact) => {
    try {
      setCreating(true);
      const res = await conversations.create({
        type: 'dm',
        memberIds: [contact.id],
      });
      onCreate(res.data);
    } catch {
      setError('Failed to create conversation');
    } finally {
      setCreating(false);
    }
  };

  const toggleSelected = (contact: Contact) => {
    setSelected(prev => {
      const exists = prev.some(c => c.id === contact.id);
      if (exists) return prev.filter(c => c.id !== contact.id);
      return [...prev, contact];
    });
  };

  const removeSelected = (id: string) => {
    setSelected(prev => prev.filter(c => c.id !== id));
  };

  const createGroup = async () => {
    if (creating) return;
    const name = groupName.trim();
    if (!name) { setError('Group name is required'); return; }
    if (selected.length < 1) { setError('Select at least 1 contact'); return; }

    setCreating(true);
    setError('');
    try {
      const res = await conversations.create({
        type: 'group',
        name,
        memberIds: selected.map(c => c.id),
      });
      onCreate(res.data);
    } catch {
      setError('Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-xl w-full max-w-md p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
            {mode === 'dm' ? 'New Message' : 'New Group'}
          </h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-xl">&times;</button>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1 mb-4">
          <button
            onClick={() => { setMode('dm'); setError(''); setSelected(prev => prev.slice(0, 1)); }}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              mode === 'dm'
                ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                : 'hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
            }`}
          >
            Direct Message
          </button>
          <button
            onClick={() => { setMode('group'); setError(''); }}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              mode === 'group'
                ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                : 'hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
            }`}
          >
            Group
          </button>
        </div>

        {mode === 'group' && (
          <div className="mb-4 space-y-2">
            <input
              type="text"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="Group name..."
              className="w-full px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selected.map(c => (
                  <span key={c.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                    {c.displayName}
                    <button onClick={() => removeSelected(c.id)} className="text-zinc-400 hover:text-zinc-600">&times;</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search contacts by name or email..."
            className="flex-1 px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          <button
            onClick={handleSearch}
            disabled={query.trim().length < 2 || searching || creating}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-40 hover:bg-blue-700 transition-colors"
          >
            {searching ? '...' : 'Search'}
          </button>
        </div>

        {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

        <div className="max-h-60 overflow-y-auto space-y-1">
          {results.map(contact => (
            <button
              key={contact.id}
              onClick={() => mode === 'dm' ? handleSelectDm(contact) : toggleSelected(contact)}
              className="w-full text-left px-4 py-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{contact.displayName}</div>
                {mode === 'group' && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    selected.some(c => c.id === contact.id)
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'
                  }`}>
                    {selected.some(c => c.id === contact.id) ? 'Selected' : 'Select'}
                  </span>
                )}
              </div>
              {contact.email && (
                <div className="text-xs text-zinc-400">{contact.email}</div>
              )}
              <div className="text-xs text-zinc-400">{contact.tezAddress}</div>
            </button>
          ))}
          {results.length === 0 && query.length >= 2 && !searching && (
            <p className="text-sm text-zinc-400 text-center py-4">No contacts found</p>
          )}
        </div>

        {mode === 'group' && (
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              disabled={creating}
              className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={createGroup}
              disabled={creating || selected.length < 1 || !groupName.trim()}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-40 hover:bg-blue-700 transition-colors"
            >
              {creating ? 'Creating...' : 'Create Group'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
