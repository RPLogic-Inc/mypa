import { useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { AppView, AppScope, UnreadCounts } from '../types';
import { isPersonalMode } from '../services/api';

interface ConnectedHub {
  hubHost: string;
  teamId: string;
  teamName: string;
}

interface SidebarProps {
  activeView: AppView;
  onChangeView: (view: AppView) => void;
  onLogout: () => void;
  unreadCounts: UnreadCounts | null;
  userName?: string;
  teamName?: string;
  scope?: AppScope;
  onSwitchScope?: (scope: AppScope) => void;
  connectedHubs?: ConnectedHub[];
}

const NAV_ITEMS: { view: AppView; label: string; icon: ReactNode }[] = [
  {
    view: 'chat',
    label: 'Chat',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path d="M10 2a8 8 0 00-5.293 14.024l-.737 2.213a.5.5 0 00.638.638l2.213-.737A8 8 0 1010 2z" />
      </svg>
    ),
  },
  {
    view: 'inbox',
    label: 'Inbox',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
        <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
      </svg>
    ),
  },
  {
    view: 'artifacts',
    label: 'Artifacts',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
        <path d="M8 11h4M8 14h2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    view: 'library',
    label: 'Library',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V14a1 1 0 11-2 0V4.804z" />
      </svg>
    ),
  },
];

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 px-2 py-1 rounded-md bg-zinc-800 dark:bg-zinc-700 text-white text-xs font-medium whitespace-nowrap shadow-lg pointer-events-none">
          {label}
          <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-zinc-800 dark:border-r-zinc-700" />
        </div>
      )}
    </div>
  );
}

/* ── Icon helpers for scope types ── */

function PersonalIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className ?? 'h-4 w-4'} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
    </svg>
  );
}

function AllTeamsIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className ?? 'h-4 w-4'} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" clipRule="evenodd" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className ?? 'h-3.5 w-3.5'} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  );
}

/* ── Scope label helpers ── */

function getScopeLabel(scope: AppScope): string {
  if (scope.type === 'personal') return 'Personal';
  if (scope.type === 'all') return 'All Teams';
  return scope.teamName || 'Team';
}

function getScopeShortLabel(scope: AppScope): string {
  if (scope.type === 'personal') return 'Me';
  if (scope.type === 'all') return 'All';
  return scope.teamName?.slice(0, 2).toUpperCase() || 'T';
}

function isScopeMatch(a: AppScope, b: AppScope): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'team' && b.type === 'team') return a.teamId === b.teamId;
  return true;
}

/* ── Desktop scope switcher dropdown ── */

function ScopeSwitcher({
  scope,
  onSwitch,
  connectedHubs,
}: {
  scope: AppScope;
  onSwitch: (s: AppScope) => void;
  connectedHubs: ConnectedHub[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const select = useCallback(
    (s: AppScope) => {
      onSwitch(s);
      setOpen(false);
    },
    [onSwitch],
  );

  const hasHubs = connectedHubs.length > 0;

  return (
    <div ref={ref} className="relative mb-2 px-1">
      {/* Trigger pill */}
      <Tooltip label={getScopeLabel(scope)}>
        <button
          aria-label={`Scope: ${getScopeLabel(scope)}`}
          onClick={() => setOpen(o => !o)}
          className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-[10px] font-bold uppercase cursor-pointer hover:bg-indigo-200 dark:hover:bg-indigo-900/60 transition-colors"
        >
          {scope.type === 'personal' ? (
            <PersonalIcon className="h-4 w-4" />
          ) : scope.type === 'all' ? (
            <AllTeamsIcon className="h-4 w-4" />
          ) : (
            getScopeShortLabel(scope)
          )}
        </button>
      </Tooltip>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-full ml-2 top-0 z-50 w-52 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl animate-fade-in py-1">
          {/* Personal option */}
          <button
            onClick={() => select({ type: 'personal' })}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <PersonalIcon className="h-4 w-4 text-emerald-500 shrink-0" />
            <span className="flex-1 text-left truncate">Personal</span>
            {scope.type === 'personal' && <CheckIcon className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />}
          </button>

          {/* Divider + team hubs */}
          {hasHubs && (
            <>
              <div className="my-1 border-t border-zinc-200 dark:border-zinc-700" />
              {connectedHubs.map(hub => {
                const hubScope: AppScope = {
                  type: 'team',
                  teamId: hub.teamId,
                  hubHost: hub.hubHost,
                  teamName: hub.teamName,
                };
                const active = isScopeMatch(scope, hubScope);
                return (
                  <button
                    key={hub.teamId}
                    onClick={() => select(hubScope)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <span className="w-5 h-5 rounded bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 text-[9px] font-bold flex items-center justify-center shrink-0 uppercase">
                      {hub.teamName.slice(0, 2)}
                    </span>
                    <span className="flex-1 text-left truncate">{hub.teamName}</span>
                    {active && <CheckIcon className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />}
                  </button>
                );
              })}
            </>
          )}

          {/* All Teams option — only if there are hubs to aggregate */}
          {hasHubs && (
            <>
              <div className="my-1 border-t border-zinc-200 dark:border-zinc-700" />
              <button
                onClick={() => select({ type: 'all' })}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <AllTeamsIcon className="h-4 w-4 text-violet-500 shrink-0" />
                <span className="flex-1 text-left truncate">All Teams</span>
                {scope.type === 'all' && <CheckIcon className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Mobile scope badge (tap to cycle) ── */

function MobileScopeBadge({
  scope,
  onSwitch,
  connectedHubs,
}: {
  scope: AppScope;
  onSwitch: (s: AppScope) => void;
  connectedHubs: ConnectedHub[];
}) {
  const cycle = useCallback(() => {
    const scopes: AppScope[] = [
      { type: 'personal' },
      ...connectedHubs.map(h => ({
        type: 'team' as const,
        teamId: h.teamId,
        hubHost: h.hubHost,
        teamName: h.teamName,
      })),
    ];
    // Only add "all" if there are hubs
    if (connectedHubs.length > 0) {
      scopes.push({ type: 'all' });
    }

    const currentIdx = scopes.findIndex(s => isScopeMatch(s, scope));
    const nextIdx = (currentIdx + 1) % scopes.length;
    onSwitch(scopes[nextIdx]);
  }, [scope, onSwitch, connectedHubs]);

  return (
    <button
      onClick={cycle}
      className="absolute -top-5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[9px] font-semibold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/50 whitespace-nowrap z-10"
    >
      {getScopeLabel(scope)}
    </button>
  );
}

/* ── Main Sidebar component ── */

export function Sidebar({
  activeView,
  onChangeView,
  onLogout,
  unreadCounts,
  userName,
  teamName,
  scope,
  onSwitchScope,
  connectedHubs,
}: SidebarProps) {
  const totalUnread = unreadCounts?.total ?? 0;
  const showScopeSwitcher = isPersonalMode && scope && onSwitchScope;

  return (
    <>
      {/* Desktop: vertical sidebar */}
      <aside className="hidden md:flex w-14 flex-col items-center py-3 gap-1 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 shrink-0">
        {/* Scope switcher (personal mode only) */}
        {showScopeSwitcher ? (
          <ScopeSwitcher
            scope={scope}
            onSwitch={onSwitchScope}
            connectedHubs={connectedHubs ?? []}
          />
        ) : (
          /* Team indicator (team mode, or personal mode without scope) */
          teamName && (
            <div className="mb-2 px-1">
              <div
                className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-[10px] font-bold uppercase cursor-default"
                title={teamName}
              >
                {teamName.slice(0, 2)}
              </div>
            </div>
          )
        )}

        <nav className="flex flex-col items-center gap-1 flex-1">
          {NAV_ITEMS.map(({ view, label, icon }) => {
            const isActive = activeView === view;
            const showBadge = view === 'inbox' && totalUnread > 0;
            return (
              <Tooltip key={view} label={label}>
                <button
                  aria-label={label}
                  onClick={() => onChangeView(view)}
                  className={`nav-item ${isActive ? 'nav-active' : ''}`}
                >
                  {icon}
                  {showBadge && (
                    <span className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-medium">
                      {totalUnread > 9 ? '9+' : totalUnread}
                    </span>
                  )}
                </button>
              </Tooltip>
            );
          })}
        </nav>

        {/* Bottom: settings + avatar */}
        <div className="flex flex-col items-center gap-1.5 mt-auto">
          <Tooltip label="Settings">
            <button
              aria-label="Settings"
              onClick={() => onChangeView('settings')}
              className={`nav-item ${activeView === 'settings' ? 'nav-active' : ''}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
            </button>
          </Tooltip>
          <Tooltip label="Log out">
            <button
              aria-label="Log out"
              onClick={onLogout}
              className="w-8 h-8 rounded-full bg-indigo-600 text-white text-xs font-medium flex items-center justify-center ring-2 ring-indigo-200 dark:ring-indigo-900 hover:bg-red-600 hover:ring-red-200 dark:hover:ring-red-900 transition-colors"
              title={userName}
            >
              {userName ? getInitials(userName) : '?'}
            </button>
          </Tooltip>
        </div>
      </aside>

      {/* Mobile: bottom nav bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-sm px-2 py-1.5 relative">
        {/* Mobile scope badge (personal mode only) */}
        {showScopeSwitcher && (
          <MobileScopeBadge
            scope={scope}
            onSwitch={onSwitchScope}
            connectedHubs={connectedHubs ?? []}
          />
        )}
        {NAV_ITEMS.map(({ view, label, icon }) => {
          const isActive = activeView === view;
          const showBadge = view === 'inbox' && totalUnread > 0;
          return (
            <button
              key={view}
              onClick={() => onChangeView(view)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors relative ${
                isActive
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
              }`}
            >
              {icon}
              <span className="text-[10px] font-medium">{label}</span>
              {showBadge && (
                <span className="absolute top-0 right-1 bg-indigo-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-medium">
                  {totalUnread > 9 ? '9+' : totalUnread}
                </span>
              )}
            </button>
          );
        })}
        <button
          onClick={() => onChangeView('settings')}
          className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${
            activeView === 'settings'
              ? 'text-indigo-600 dark:text-indigo-400'
              : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
          </svg>
          <span className="text-[10px] font-medium">Settings</span>
        </button>
      </nav>
    </>
  );
}
