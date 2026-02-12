import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

describe('mypa SKILL CRM guidance', () => {
  it('documents CRM API-first routing and prohibits file-path fallback', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const skillPath = resolve(here, '../../../skills/mypa/SKILL.md');
    const skill = readFileSync(skillPath, 'utf8');

    expect(skill).toContain('CRM Intent Routing (CRITICAL)');
    expect(skill).toContain('GET /api/crm/status');
    expect(skill).toContain('You MUST NOT:');
    expect(skill).toContain('ask the user for a "CRM file", "CRM folder", or local CRM path');
    expect(skill).toContain('Add my wife, Natalie Williams to our CRM.');
    expect(skill).toContain('POST "$MYPA_API_URL/api/crm/people"');
  });
});
