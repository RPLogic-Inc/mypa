import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommsPanel } from '../CommsPanel';

describe('CommsPanel', () => {
  it('shows stream empty state and no library toggle', () => {
    render(
      <CommsPanel
        convList={[]}
        teamList={[]}
        messages={[]}
        hasMore={false}
        unreadCounts={{ teams: [], conversations: [], total: 0 }}
        selected={null}
        contextTez={null}
        currentUserId="u1"
        onSelect={vi.fn()}
        onSend={vi.fn()}
        onLoadMore={vi.fn()}
        onViewContext={vi.fn()}
        onCloseContext={vi.fn()}
        onUpdateTezStatus={vi.fn()}
        onNewChat={vi.fn()}
        onNewTeam={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Inbox').length).toBeGreaterThan(0);
    expect(screen.getByText('Select a team or conversation to start messaging')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Library' })).not.toBeInTheDocument();
  });
});
