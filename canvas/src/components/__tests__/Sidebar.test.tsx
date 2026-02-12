import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '../Sidebar';

describe('Sidebar', () => {
  const defaultProps = {
    activeView: 'chat' as const,
    onChangeView: vi.fn(),
    onLogout: vi.fn(),
    unreadCounts: null,
    userName: 'Rob Price',
  };

  it('renders all 4 nav items + settings', () => {
    render(<Sidebar {...defaultProps} />);
    // Each label appears in both desktop (aria-label) and mobile (text) nav
    expect(screen.getAllByRole('button', { name: 'Chat' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: 'Inbox' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: 'Artifacts' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: 'Library' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: 'Settings' }).length).toBeGreaterThanOrEqual(1);
  });

  it('marks active nav item', () => {
    render(<Sidebar {...defaultProps} activeView="inbox" />);
    const streamBtns = screen.getAllByRole('button', { name: 'Inbox' });
    // Desktop button should have nav-active class
    expect(streamBtns[0].className).toContain('nav-active');
  });

  it('calls onChangeView when nav item clicked', async () => {
    const onChange = vi.fn();
    render(<Sidebar {...defaultProps} onChangeView={onChange} />);
    const artifactsBtns = screen.getAllByRole('button', { name: 'Artifacts' });
    await userEvent.click(artifactsBtns[0]);
    expect(onChange).toHaveBeenCalledWith('artifacts');
  });

  it('calls onChangeView with settings when gear clicked', async () => {
    const onChange = vi.fn();
    render(<Sidebar {...defaultProps} onChangeView={onChange} />);
    const settingsBtns = screen.getAllByRole('button', { name: 'Settings' });
    await userEvent.click(settingsBtns[0]);
    expect(onChange).toHaveBeenCalledWith('settings');
  });

  it('displays user initials when userName provided', () => {
    render(<Sidebar {...defaultProps} userName="Rob Price" />);
    expect(screen.getByTitle('Rob Price')).toHaveTextContent('RP');
  });

  it('shows unread badge on Stream when unread > 0', () => {
    render(
      <Sidebar
        {...defaultProps}
        unreadCounts={{ teams: [], conversations: [], total: 5 }}
      />
    );
    expect(screen.getAllByText('5').length).toBeGreaterThanOrEqual(1);
  });

  it('shows 9+ when unread > 9', () => {
    render(
      <Sidebar
        {...defaultProps}
        unreadCounts={{ teams: [], conversations: [], total: 15 }}
      />
    );
    expect(screen.getAllByText('9+').length).toBeGreaterThanOrEqual(1);
  });

  it('does not show unread badge when count is 0', () => {
    render(
      <Sidebar
        {...defaultProps}
        unreadCounts={{ teams: [], conversations: [], total: 0 }}
      />
    );
    expect(screen.queryByText('0')).toBeNull();
  });
});
