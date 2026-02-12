import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInputBar } from '../ChatInputBar';

function renderInputBar(overrides: Partial<Parameters<typeof ChatInputBar>[0]> = {}) {
  const defaults = {
    isStreaming: false,
    isListening: false,
    sttSupported: false,
    onSend: vi.fn(),
    onStop: vi.fn(),
    onStartListening: vi.fn(),
    onStopListening: vi.fn(),
  };
  const props = { ...defaults, ...overrides };
  return { ...render(<ChatInputBar {...props} />), ...props };
}

describe('ChatInputBar', () => {
  it('renders textarea with placeholder', () => {
    renderInputBar();
    expect(screen.getByPlaceholderText('Message your PA...')).toBeInTheDocument();
  });

  it('shows "Listening..." placeholder when listening', () => {
    renderInputBar({ isListening: true });
    expect(screen.getByPlaceholderText('Listening...')).toBeInTheDocument();
  });

  it('shows Send button when not streaming', () => {
    renderInputBar();
    expect(screen.getByText('Send')).toBeInTheDocument();
    expect(screen.queryByText('Stop')).not.toBeInTheDocument();
  });

  it('shows Stop button when streaming', () => {
    renderInputBar({ isStreaming: true });
    expect(screen.getByText('Stop')).toBeInTheDocument();
    expect(screen.queryByText('Send')).not.toBeInTheDocument();
  });

  it('calls onStop when Stop button clicked', async () => {
    const user = userEvent.setup();
    const { onStop } = renderInputBar({ isStreaming: true });

    await user.click(screen.getByText('Stop'));
    expect(onStop).toHaveBeenCalled();
  });

  it('calls onSend with trimmed text when Send clicked', async () => {
    const user = userEvent.setup();
    const { onSend } = renderInputBar();

    const textarea = screen.getByPlaceholderText('Message your PA...');
    await user.type(textarea, 'Hello world');
    await user.click(screen.getByText('Send'));
    expect(onSend).toHaveBeenCalledWith('Hello world', undefined);
  });

  it('clears input after sending', async () => {
    const user = userEvent.setup();
    renderInputBar();

    const textarea = screen.getByPlaceholderText('Message your PA...') as HTMLTextAreaElement;
    await user.type(textarea, 'Hello');
    await user.click(screen.getByText('Send'));
    expect(textarea.value).toBe('');
  });

  it('Send button is disabled when input is empty', () => {
    renderInputBar();
    expect(screen.getByText('Send')).toBeDisabled();
  });

  it('does not call onSend when input is empty', async () => {
    const user = userEvent.setup();
    const { onSend } = renderInputBar();

    await user.click(screen.getByText('Send'));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('sends on Enter key (without Shift)', async () => {
    const user = userEvent.setup();
    const { onSend } = renderInputBar();

    const textarea = screen.getByPlaceholderText('Message your PA...');
    await user.type(textarea, 'Hello{Enter}');
    expect(onSend).toHaveBeenCalledWith('Hello', undefined);
  });

  it('does not send on Shift+Enter (newline)', async () => {
    const user = userEvent.setup();
    const { onSend } = renderInputBar();

    const textarea = screen.getByPlaceholderText('Message your PA...');
    await user.type(textarea, 'Hello{Shift>}{Enter}{/Shift}');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('disables textarea when streaming', () => {
    renderInputBar({ isStreaming: true });
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('disables textarea when listening', () => {
    renderInputBar({ isListening: true });
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('shows mic button when sttSupported', () => {
    renderInputBar({ sttSupported: true });
    expect(screen.getByTitle('Voice input')).toBeInTheDocument();
  });

  it('hides mic button when sttSupported is false', () => {
    renderInputBar({ sttSupported: false });
    expect(screen.queryByTitle('Voice input')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Stop listening')).not.toBeInTheDocument();
  });

  it('calls onStartListening when mic clicked while not listening', async () => {
    const user = userEvent.setup();
    const { onStartListening } = renderInputBar({ sttSupported: true, isListening: false });

    await user.click(screen.getByTitle('Voice input'));
    expect(onStartListening).toHaveBeenCalled();
  });

  it('calls onStopListening when mic clicked while listening', async () => {
    const user = userEvent.setup();
    const { onStopListening } = renderInputBar({ sttSupported: true, isListening: true });

    await user.click(screen.getByTitle('Stop listening'));
    expect(onStopListening).toHaveBeenCalled();
  });

  it('hides mic button when streaming', () => {
    renderInputBar({ sttSupported: true, isStreaming: true });
    expect(screen.queryByTitle('Voice input')).not.toBeInTheDocument();
  });

  it('shows QuickActions when input is empty and not streaming', () => {
    renderInputBar();
    expect(screen.getByText('Research')).toBeInTheDocument();
  });

  it('hides QuickActions when streaming', () => {
    renderInputBar({ isStreaming: true });
    expect(screen.queryByText('Research')).not.toBeInTheDocument();
  });

  it('populates input when QuickAction is clicked', async () => {
    const user = userEvent.setup();
    renderInputBar();

    await user.click(screen.getByText('Research'));
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Research the following topic and create a brief: ');
  });
});
