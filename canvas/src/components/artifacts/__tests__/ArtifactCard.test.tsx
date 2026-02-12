import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArtifactCard } from '../ArtifactCard';
import type { ArtifactRef } from '../../../types';

describe('ArtifactCard', () => {
  const artifact: ArtifactRef = {
    id: 'art-1',
    type: 'research',
    title: 'Q1 Competitive Analysis',
    content: 'This is a detailed analysis of the competitive landscape for Q1. It covers market trends, key players, and emerging opportunities in the AI assistant space.',
    status: 'draft',
    createdAt: '2025-02-10T12:00:00Z',
  };

  it('renders artifact title', () => {
    render(<ArtifactCard artifact={artifact} onOpen={vi.fn()} />);
    expect(screen.getByText('Q1 Competitive Analysis')).toBeInTheDocument();
  });

  it('renders artifact type badge', () => {
    render(<ArtifactCard artifact={artifact} onOpen={vi.fn()} />);
    expect(screen.getByText('research')).toBeInTheDocument();
  });

  it('renders artifact status badge', () => {
    render(<ArtifactCard artifact={artifact} onOpen={vi.fn()} />);
    expect(screen.getByText('draft')).toBeInTheDocument();
  });

  it('renders content preview truncated to 120 chars', () => {
    render(<ArtifactCard artifact={artifact} onOpen={vi.fn()} />);
    // Content is > 120 chars so it should be truncated with ...
    const previewText = screen.getByText(/This is a detailed/);
    expect(previewText.textContent).toContain('...');
    expect(previewText.textContent!.length).toBeLessThanOrEqual(124); // 120 + "..."
  });

  it('renders short content without truncation', () => {
    const shortArtifact: ArtifactRef = {
      ...artifact,
      content: 'Short content.',
    };
    render(<ArtifactCard artifact={shortArtifact} onOpen={vi.fn()} />);
    expect(screen.getByText('Short content.')).toBeInTheDocument();
  });

  it('renders formatted date', () => {
    render(<ArtifactCard artifact={artifact} onOpen={vi.fn()} />);
    // Date format: "Feb 10" (short month + day)
    expect(screen.getByText('Feb 10')).toBeInTheDocument();
  });

  it('calls onOpen with artifact when clicked', async () => {
    const onOpen = vi.fn();
    render(<ArtifactCard artifact={artifact} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledWith(artifact);
  });
});
