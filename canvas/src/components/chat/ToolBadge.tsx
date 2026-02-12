const TOOL_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  web_search: { bg: 'badge-web', text: 'Web', label: 'Web Search' },
  memory: { bg: 'badge-memory', text: 'Memory', label: 'Memory' },
  code_exec: { bg: 'badge-code', text: 'Code', label: 'Code Execution' },
  skill: { bg: 'badge-skill', text: 'Skill', label: 'Skill' },
};

interface ToolBadgeProps {
  tool: string;
}

export function ToolBadge({ tool }: ToolBadgeProps) {
  const style = TOOL_STYLES[tool] ?? { bg: 'badge-skill', text: tool, label: tool };
  return (
    <span className={`badge-tool ${style.bg}`} title={style.label}>
      {style.text}
    </span>
  );
}
