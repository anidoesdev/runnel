import { describe, expect, it } from 'vitest';
import { SYSTEM_PROMPT } from './load-system-prompt.js';

describe('SYSTEM_PROMPT', () => {
  it('loads system.md and includes every section the build prompt requires', () => {
    expect(SYSTEM_PROMPT).toContain('## Data model');
    expect(SYSTEM_PROMPT).toContain('## Connection semantics');
    expect(SYSTEM_PROMPT).toContain('## Expression syntax');
    expect(SYSTEM_PROMPT).toContain('## Working order');
    expect(SYSTEM_PROMPT).toContain('## Common mistakes');
    expect(SYSTEM_PROMPT).toContain('## Tone');
  });

  it('references real tool names from the registry, not placeholders', () => {
    expect(SYSTEM_PROMPT).toContain('search_nodes');
    expect(SYSTEM_PROMPT).toContain('add_node');
    expect(SYSTEM_PROMPT).toContain('connect_nodes');
    expect(SYSTEM_PROMPT).toContain('get_workflow_outline');
    expect(SYSTEM_PROMPT).toContain('ask_user');
    expect(SYSTEM_PROMPT).toContain('list_credentials');
    expect(SYSTEM_PROMPT).toContain('request_credential');
  });

  it('documents the approval gates on remove_node and rename_node', () => {
    expect(SYSTEM_PROMPT).toContain('## Approval gates');
    expect(SYSTEM_PROMPT).toContain('remove_node');
    expect(SYSTEM_PROMPT).toContain('rename_node');
  });
});
