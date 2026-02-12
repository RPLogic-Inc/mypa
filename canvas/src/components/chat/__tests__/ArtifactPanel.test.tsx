import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArtifactPanel } from '../ArtifactPanel';
import type { ArtifactRef } from '../../../types';

const sampleArtifact: ArtifactRef = {
  id: 'art-1',
  type: 'research',
  title: 'Market Analysis',
  content: 'This is the research content about markets.',
  status: 'draft',
  createdAt: '2026-02-10T12:00:00Z',
};

function renderPanel(overrides: Partial<Parameters<typeof ArtifactPanel>[0]> = {}) {
  const defaults = {
    artifact: sampleArtifact,
    onClose: vi.fn(),
    onUpdate: vi.fn(),
  };
  const props = { ...defaults, ...overrides };
  return { ...render(<ArtifactPanel {...props} />), ...props };
}

describe('ArtifactPanel', () => {
  it('renders artifact title', () => {
    renderPanel();
    expect(screen.getByText('Market Analysis')).toBeInTheDocument();
  });

  it('renders artifact content', () => {
    renderPanel();
    expect(screen.getByText('This is the research content about markets.')).toBeInTheDocument();
  });

  it('renders type badge', () => {
    renderPanel();
    expect(screen.getByText('research')).toBeInTheDocument();
  });

  it('renders status badge', () => {
    renderPanel();
    expect(screen.getByText('draft')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel();

    await user.click(screen.getByTitle('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows Edit and Copy buttons in view mode', () => {
    renderPanel();
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Copy')).toBeInTheDocument();
  });

  it('switches to edit mode when Edit clicked', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByText('Edit'));
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    expect(screen.queryByText('Copy')).not.toBeInTheDocument();
  });

  it('shows textarea in edit mode with content', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByText('Edit'));
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toBe('This is the research content about markets.');
  });

  it('calls onUpdate with modified content on Save', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderPanel();

    await user.click(screen.getByText('Edit'));
    const textarea = screen.getByRole('textbox');
    await user.clear(textarea);
    await user.type(textarea, 'Updated content');
    await user.click(screen.getByText('Save'));

    expect(onUpdate).toHaveBeenCalledWith({
      ...sampleArtifact,
      content: 'Updated content',
    });
  });

  it('exits edit mode after Save', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByText('Edit'));
    await user.click(screen.getByText('Save'));

    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.queryByText('Save')).not.toBeInTheDocument();
  });

  it('reverts content on Cancel', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByText('Edit'));
    const textarea = screen.getByRole('textbox');
    await user.clear(textarea);
    await user.type(textarea, 'Changed');
    await user.click(screen.getByText('Cancel'));

    // Back in view mode showing original content
    expect(screen.getByText('This is the research content about markets.')).toBeInTheDocument();
  });

  it('copies content to clipboard when Copy clicked', async () => {
    const user = userEvent.setup();
    const writeSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeSpy },
    });
    renderPanel();

    await user.click(screen.getByText('Copy'));
    expect(writeSpy).toHaveBeenCalledWith('This is the research content about markets.');
  });
});
