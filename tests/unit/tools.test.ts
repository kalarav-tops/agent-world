import { describe, expect, it } from 'vitest';
import { baseName, stationFor, summarizeTool } from '../../src/shared/tools';

describe('baseName', () => {
  it('handles posix and windows paths', () => {
    expect(baseName('/a/b/c.ts')).toBe('c.ts');
    expect(baseName('C:\\x\\y.tsx')).toBe('y.tsx');
    expect(baseName('')).toBe('');
  });
});

describe('summarizeTool', () => {
  it('prefers a Bash description over the command', () => {
    expect(summarizeTool('Bash', { command: 'ls -la', description: 'List files' })).toBe('List files');
    expect(summarizeTool('Bash', { command: 'git status\necho hi' })).toBe('git status');
  });

  it('names the file for file tools', () => {
    expect(summarizeTool('Read', { file_path: '/a/routes.js' })).toBe('routes.js');
    expect(summarizeTool('Edit', { file_path: '/a/index.tsx' })).toBe('index.tsx');
    expect(summarizeTool('Write', { file_path: '/a/new.ts' })).toBe('new.ts');
    expect(summarizeTool('NotebookEdit', { notebook_path: '/n/a.ipynb' })).toBe('a.ipynb');
  });

  it('describes searches', () => {
    expect(summarizeTool('Grep', { pattern: 'lazy\\(', path: '/src/app' })).toBe('"lazy\\(" in app');
    expect(summarizeTool('Grep', { pattern: 'x' })).toBe('"x"');
    expect(summarizeTool('Glob', { pattern: '**/*.ts' })).toBe('**/*.ts');
    expect(summarizeTool('WebSearch', { query: 'three.js lights' })).toBe('three.js lights');
  });

  it('shows the host for a fetch, and tolerates a bad url', () => {
    expect(summarizeTool('WebFetch', { url: 'https://docs.example.com/page' })).toBe('docs.example.com');
    expect(summarizeTool('WebFetch', { url: 'not a url' })).toBe('not a url');
  });

  it('describes agents, skills, questions and tasks', () => {
    expect(summarizeTool('Agent', { description: 'Review PR' })).toBe('Review PR');
    expect(summarizeTool('Skill', { skill: 'brainstorming' })).toBe('brainstorming');
    expect(summarizeTool('AskUserQuestion', { questions: [{ question: 'Which style?' }] })).toBe('Which style?');
    expect(summarizeTool('TaskCreate', { subject: 'Write tests' })).toBe('Write tests');
    expect(summarizeTool('SendMessage', { to: 'reviewer', message: 'go' })).toBe('to reviewer');
    expect(summarizeTool('SendMessage', {})).toBe('SendMessage');
  });

  it('labels MCP tools by server and tool', () => {
    expect(summarizeTool('mcp__github__create_pull_request', {})).toBe('github: create_pull_request');
  });

  it('falls back to the tool name and truncates long text', () => {
    expect(summarizeTool('Mystery', {})).toBe('Mystery');
    expect(summarizeTool('Bash', { description: 'x'.repeat(300) })).toHaveLength(120);
  });
});

describe('stationFor', () => {
  it('maps working tools to stations', () => {
    expect(stationFor('working', 'Edit')).toBe('bench');
    expect(stationFor('working', 'Grep')).toBe('microscope');
    expect(stationFor('working', 'Bash')).toBe('terminal');
    expect(stationFor('working', 'WebFetch')).toBe('library');
    expect(stationFor('working', 'mcp__github__get_me')).toBe('library');
    expect(stationFor('working', 'Agent')).toBe('portal');
    expect(stationFor('asking', 'AskUserQuestion')).toBe('helpdesk');
    expect(stationFor('working', 'Unknown')).toBe('whiteboard');
  });

  it('maps non-working statuses', () => {
    expect(stationFor('thinking', undefined)).toBe('whiteboard');
    expect(stationFor('done', undefined)).toBe('lounge');
    expect(stationFor('interrupted', undefined)).toBe('lounge');
    expect(stationFor('idle', undefined)).toBe('lounge');
  });
});
