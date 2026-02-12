import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToolBadge } from '../ToolBadge';

describe('ToolBadge', () => {
  it('renders known tool with correct label', () => {
    render(<ToolBadge tool="web_search" />);
    expect(screen.getByText('Web')).toBeInTheDocument();
    expect(screen.getByTitle('Web Search')).toBeInTheDocument();
  });

  it('renders memory tool', () => {
    render(<ToolBadge tool="memory" />);
    expect(screen.getByText('Memory')).toBeInTheDocument();
  });

  it('renders code_exec tool', () => {
    render(<ToolBadge tool="code_exec" />);
    expect(screen.getByText('Code')).toBeInTheDocument();
  });

  it('renders skill tool', () => {
    render(<ToolBadge tool="skill" />);
    expect(screen.getByText('Skill')).toBeInTheDocument();
  });

  it('renders unknown tool with tool name as text', () => {
    render(<ToolBadge tool="custom_tool" />);
    expect(screen.getByText('custom_tool')).toBeInTheDocument();
  });

  it('applies badge-tool base class', () => {
    const { container } = render(<ToolBadge tool="web_search" />);
    expect(container.querySelector('.badge-tool')).toBeInTheDocument();
  });
});
