import { useState, useEffect } from 'react';

interface ActivityItem {
  id: string;
  type: string;
  text: string;
  timestamp: number;
}

interface ActivityBannerProps {
  items: ActivityItem[];
  sseConnected: boolean;
}

const ICONS: Record<string, string> = {
  new_tez: 'M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884zM18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z',
  new_message: 'M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7z',
  new_reply: 'M7.707 3.293A1 1 0 009 4v4h4a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2h1V4a1 1 0 011.707-.707z',
  tez_updated: 'M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4z',
};

export function ActivityBanner({ items, sseConnected }: ActivityBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (items.length <= 1) return;
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setCurrentIndex(prev => (prev + 1) % items.length);
        setVisible(true);
      }, 200);
    }, 5000);
    return () => clearInterval(interval);
  }, [items.length]);

  // Reset index if items shrink
  useEffect(() => {
    if (currentIndex >= items.length) setCurrentIndex(0);
  }, [items.length, currentIndex]);

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-1.5 bg-indigo-50 dark:bg-indigo-950/30 border-b border-indigo-100 dark:border-indigo-900/30">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${sseConnected ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-400'}`} />
        <span className="text-xs text-indigo-500 dark:text-indigo-400">
          {sseConnected ? 'PA monitoring your channels' : 'Connecting to live updates...'}
        </span>
      </div>
    );
  }

  const current = items[currentIndex % items.length];
  const iconPath = ICONS[current.type] ?? ICONS.new_message;

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 bg-indigo-50 dark:bg-indigo-950/30 border-b border-indigo-100 dark:border-indigo-900/30">
      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-indigo-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path d={iconPath} />
      </svg>
      <p className={`flex-1 text-xs text-indigo-600 dark:text-indigo-300 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}>
        {current.text}
      </p>
      {items.length > 1 && (
        <span className="text-[10px] text-indigo-400 dark:text-indigo-500 tabular-nums">
          {(currentIndex % items.length) + 1}/{items.length}
        </span>
      )}
    </div>
  );
}
