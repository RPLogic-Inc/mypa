interface QuickActionsProps {
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

const ACTIONS = [
  { label: 'Research', prompt: 'Research the following topic and create a brief: ', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
  { label: 'Briefing', prompt: 'Create a briefing document about: ', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { label: 'Draft', prompt: 'Draft a document for: ', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
  { label: 'Team Update', prompt: 'Prepare a team update about: ', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { label: 'Calendar', prompt: 'Check my calendar and summarize my schedule for ', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { label: 'Email', prompt: 'Draft an email to ', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
];

export function QuickActions({ onSelect, disabled }: QuickActionsProps) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {ACTIONS.map(({ label, prompt, icon }) => (
        <button
          key={label}
          onClick={() => onSelect(prompt)}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                     border-zinc-200 text-zinc-600 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200
                     dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-indigo-950/50 dark:hover:text-indigo-300 dark:hover:border-indigo-800
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
          {label}
        </button>
      ))}
    </div>
  );
}
