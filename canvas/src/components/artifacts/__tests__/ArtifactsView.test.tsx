import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArtifactsView } from '../ArtifactsView';
import type { ArtifactRef } from '../../../types';

describe('ArtifactsView', () => {
  const artifacts: ArtifactRef[] = [
    {
      id: 'art-1',
      type: 'research',
      title: 'Q1 Analysis',
      content: 'Research content here',
      status: 'draft',
      createdAt: '2025-02-10T12:00:00Z',
    },
    {
      id: 'art-2',
      type: 'draft',
      title: 'Proposal Draft',
      content: 'Draft content here',
      status: 'published',
      createdAt: '2025-02-09T10:00:00Z',
    },
    {
      id: 'art-3',
      type: 'email',
      title: 'Email to Client',
      content: 'Email content',
      status: 'shared',
      createdAt: '2025-02-08T08:00:00Z',
    },
  ];

  it('renders the header', () => {
    render(<ArtifactsView artifacts={artifacts} />);
    expect(screen.getByText('Artifacts')).toBeInTheDocument();
  });

  it('renders all artifacts when no filter', () => {
    render(<ArtifactsView artifacts={artifacts} />);
    expect(screen.getByText('Q1 Analysis')).toBeInTheDocument();
    expect(screen.getByText('Proposal Draft')).toBeInTheDocument();
    expect(screen.getByText('Email to Client')).toBeInTheDocument();
  });

  it('renders filter buttons', () => {
    render(<ArtifactsView artifacts={artifacts} />);
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Research')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('filters by type when filter clicked', async () => {
    render(<ArtifactsView artifacts={artifacts} />);
    await userEvent.click(screen.getByText('Research'));
    expect(screen.getByText('Q1 Analysis')).toBeInTheDocument();
    expect(screen.queryByText('Proposal Draft')).not.toBeInTheDocument();
    expect(screen.queryByText('Email to Client')).not.toBeInTheDocument();
  });

  it('shows all again when All filter clicked', async () => {
    render(<ArtifactsView artifacts={artifacts} />);
    await userEvent.click(screen.getByText('Research'));
    await userEvent.click(screen.getByText('All'));
    expect(screen.getByText('Q1 Analysis')).toBeInTheDocument();
    expect(screen.getByText('Proposal Draft')).toBeInTheDocument();
    expect(screen.getByText('Email to Client')).toBeInTheDocument();
  });

  it('shows empty state when no artifacts', () => {
    render(<ArtifactsView artifacts={[]} />);
    expect(screen.getByText('No artifacts yet')).toBeInTheDocument();
  });

  it('opens detail panel when artifact clicked', async () => {
    render(<ArtifactsView artifacts={artifacts} />);
    const cards = screen.getAllByRole('button');
    const artCard = cards.find(b => b.textContent?.includes('Q1 Analysis'));
    expect(artCard).toBeDefined();
    await userEvent.click(artCard!);

    // Detail panel should show the Copy button (only visible in detail panel)
    expect(screen.getByText('Copy')).toBeInTheDocument();
    // Detail panel header shows artifact title as h3
    const headings = screen.getAllByText('Q1 Analysis');
    // At least 2: one in card, one in detail panel header
    expect(headings.length).toBeGreaterThanOrEqual(2);
  });

  it('closes detail panel when close button clicked', async () => {
    render(<ArtifactsView artifacts={artifacts} />);
    const cards = screen.getAllByRole('button');
    const artCard = cards.find(b => b.textContent?.includes('Q1 Analysis'));
    await userEvent.click(artCard!);

    // Detail panel is open — Copy button visible
    expect(screen.getByText('Copy')).toBeInTheDocument();

    // Click the close button (the X icon in the detail panel header)
    const allButtons = screen.getAllByRole('button');
    const closeBtn = allButtons.find(b => b.querySelector('svg path[d*="4.293"]'));
    expect(closeBtn).toBeDefined();
    await userEvent.click(closeBtn!);

    // Detail panel should be closed — Copy button gone
    expect(screen.queryByText('Copy')).not.toBeInTheDocument();
  });
});
