import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuickActions } from '../QuickActions';

describe('QuickActions', () => {
  it('renders all action buttons', () => {
    render(<QuickActions onSelect={vi.fn()} />);
    expect(screen.getByText('Research')).toBeInTheDocument();
    expect(screen.getByText('Briefing')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Team Update')).toBeInTheDocument();
    expect(screen.getByText('Calendar')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('calls onSelect with correct prompt when clicked', async () => {
    const onSelect = vi.fn();
    render(<QuickActions onSelect={onSelect} />);
    await userEvent.click(screen.getByText('Research'));
    expect(onSelect).toHaveBeenCalledWith('Research the following topic and create a brief: ');
  });

  it('calls onSelect with email prompt', async () => {
    const onSelect = vi.fn();
    render(<QuickActions onSelect={onSelect} />);
    await userEvent.click(screen.getByText('Email'));
    expect(onSelect).toHaveBeenCalledWith('Draft an email to ');
  });

  it('disables buttons when disabled prop is true', () => {
    render(<QuickActions onSelect={vi.fn()} disabled />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach(btn => expect(btn).toBeDisabled());
  });

  it('buttons are enabled by default', () => {
    render(<QuickActions onSelect={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach(btn => expect(btn).toBeEnabled());
  });
});
