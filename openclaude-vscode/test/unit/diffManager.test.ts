import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DiffManager, buildDiffPreview, summarizeLineChanges } from '../../src/diff/diffManager';
import { DiffContentProvider } from '../../src/diff/diffContentProvider';

// Create minimal mocks for DiffManager dependencies
function createMockOutputChannel() {
  return {
    appendLine: vi.fn(),
    append: vi.fn(),
    clear: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
    name: 'test',
    replace: vi.fn(),
  } as unknown as import('vscode').OutputChannel;
}

describe('DiffManager.computeProposedContent', () => {
  let diffManager: DiffManager;

  beforeEach(() => {
    const original = new DiffContentProvider();
    original.scheme = 'openclaude-diff-original';
    const proposed = new DiffContentProvider();
    proposed.scheme = 'openclaude-diff-proposed';
    const outputChannel = createMockOutputChannel();
    diffManager = new DiffManager(original, proposed, outputChannel);
  });

  describe('FileWriteTool', () => {
    it('should return content field as the full proposed content', () => {
      const result = diffManager.computeProposedContent(
        'FileWriteTool',
        { content: 'new file content', file_path: '/test.ts' },
        'old content',
      );
      expect(result).toBe('new file content');
    });

    it('should handle empty content (truncate file)', () => {
      const result = diffManager.computeProposedContent(
        'FileWriteTool',
        { content: '', file_path: '/test.ts' },
        'old content',
      );
      expect(result).toBe('');
    });

    it('should handle missing content field', () => {
      const result = diffManager.computeProposedContent(
        'FileWriteTool',
        { file_path: '/test.ts' },
        'old content',
      );
      expect(result).toBe('');
    });

    it('should handle new file creation (empty original)', () => {
      const result = diffManager.computeProposedContent(
        'FileWriteTool',
        { content: 'brand new file', file_path: '/new.ts' },
        '',
      );
      expect(result).toBe('brand new file');
    });
  });

  describe('Write / NotebookEditTool', () => {
    it('should return content field as the full proposed content for Write', () => {
      const result = diffManager.computeProposedContent(
        'Write',
        { content: 'new file content', file_path: '/test.ts' },
        'old content',
      );
      expect(result).toBe('new file content');
    });

    it('should return content field as the full proposed content for NotebookEditTool', () => {
      const result = diffManager.computeProposedContent(
        'NotebookEditTool',
        { content: 'cell content', file_path: '/test.ipynb' },
        'old content',
      );
      expect(result).toBe('cell content');
    });
  });

  describe('FileEditTool', () => {
    it('should apply old_string -> new_string replacement', () => {
      const original = 'function hello() {\n  return "hello";\n}';
      const result = diffManager.computeProposedContent(
        'FileEditTool',
        {
          file_path: '/test.ts',
          old_string: 'return "hello"',
          new_string: 'return "world"',
        },
        original,
      );
      expect(result).toBe('function hello() {\n  return "world";\n}');
    });

    it('should handle new file creation (empty old_string, empty original)', () => {
      const result = diffManager.computeProposedContent(
        'FileEditTool',
        {
          file_path: '/new.ts',
          old_string: '',
          new_string: 'export const x = 1;',
        },
        '',
      );
      expect(result).toBe('export const x = 1;');
    });

    it('should prepend when old_string is empty but file exists', () => {
      const result = diffManager.computeProposedContent(
        'FileEditTool',
        {
          file_path: '/test.ts',
          old_string: '',
          new_string: '// header\n',
        },
        'const x = 1;',
      );
      expect(result).toBe('// header\nconst x = 1;');
    });

    it('should return original when old_string is not found', () => {
      const original = 'const x = 1;';
      const result = diffManager.computeProposedContent(
        'FileEditTool',
        {
          file_path: '/test.ts',
          old_string: 'const y = 2',
          new_string: 'const y = 3',
        },
        original,
      );
      expect(result).toBe(original);
    });

    it('should replace only the first occurrence', () => {
      const original = 'aaa bbb aaa';
      const result = diffManager.computeProposedContent(
        'FileEditTool',
        {
          file_path: '/test.ts',
          old_string: 'aaa',
          new_string: 'ccc',
        },
        original,
      );
      expect(result).toBe('ccc bbb aaa');
    });

    it('should handle deletion (new_string is empty)', () => {
      const original = 'line1\nline2\nline3';
      const result = diffManager.computeProposedContent(
        'FileEditTool',
        {
          file_path: '/test.ts',
          old_string: 'line2\n',
          new_string: '',
        },
        original,
      );
      expect(result).toBe('line1\nline3');
    });

    it('should handle multi-line replacements', () => {
      const original = 'function foo() {\n  // old\n  return 1;\n}';
      const result = diffManager.computeProposedContent(
        'FileEditTool',
        {
          file_path: '/test.ts',
          old_string: '  // old\n  return 1;',
          new_string: '  // new\n  return 42;',
        },
        original,
      );
      expect(result).toBe('function foo() {\n  // new\n  return 42;\n}');
    });

    it('should handle replacement at the start of the file', () => {
      const original = 'const x = 1;\nconst y = 2;';
      const result = diffManager.computeProposedContent(
        'FileEditTool',
        {
          file_path: '/test.ts',
          old_string: 'const x = 1;',
          new_string: 'const x = 99;',
        },
        original,
      );
      expect(result).toBe('const x = 99;\nconst y = 2;');
    });

    it('should handle replacement at the end of the file', () => {
      const original = 'const x = 1;\nconst y = 2;';
      const result = diffManager.computeProposedContent(
        'FileEditTool',
        {
          file_path: '/test.ts',
          old_string: 'const y = 2;',
          new_string: 'const y = 99;',
        },
        original,
      );
      expect(result).toBe('const x = 1;\nconst y = 99;');
    });
  });

  describe('Edit / MultiEdit', () => {
    it('should apply old_string -> new_string replacement for Edit', () => {
      const original = 'function hello() {\n  return "hello";\n}';
      const result = diffManager.computeProposedContent(
        'Edit',
        {
          file_path: '/test.ts',
          old_string: 'return "hello"',
          new_string: 'return "world"',
        },
        original,
      );
      expect(result).toBe('function hello() {\n  return "world";\n}');
    });

    it('should apply sequential edits for MultiEdit', () => {
      const original = 'const a = 1;\nconst b = 2;\n';
      const result = diffManager.computeProposedContent(
        'MultiEdit',
        {
          file_path: '/test.ts',
          edits: [
            { old_string: 'const a = 1;', new_string: 'const a = 10;' },
            { old_string: 'const b = 2;', new_string: 'const b = 20;' },
          ],
        },
        original,
      );
      expect(result).toBe('const a = 10;\nconst b = 20;\n');
    });
  });

  describe('Unknown tool', () => {
    it('should return original content unchanged', () => {
      const original = 'some content';
      const result = diffManager.computeProposedContent(
        'SomeOtherTool',
        { file_path: '/test.ts' },
        original,
      );
      expect(result).toBe(original);
    });
  });
});

describe('DiffManager.isFileEditToolRequest', () => {
  let diffManager: DiffManager;

  beforeEach(() => {
    const original = new DiffContentProvider();
    original.scheme = 'openclaude-diff-original';
    const proposed = new DiffContentProvider();
    proposed.scheme = 'openclaude-diff-proposed';
    const outputChannel = createMockOutputChannel();
    diffManager = new DiffManager(original, proposed, outputChannel);
  });

  it('should return true for FileEditTool', () => {
    expect(
      diffManager.isFileEditToolRequest({
        subtype: 'can_use_tool',
        tool_name: 'FileEditTool',
        input: {},
        tool_use_id: 'test',
      }),
    ).toBe(true);
  });

  it('should return true for FileWriteTool', () => {
    expect(
      diffManager.isFileEditToolRequest({
        subtype: 'can_use_tool',
        tool_name: 'FileWriteTool',
        input: {},
        tool_use_id: 'test',
      }),
    ).toBe(true);
  });

  it('should return true for Edit', () => {
    expect(
      diffManager.isFileEditToolRequest({
        subtype: 'can_use_tool',
        tool_name: 'Edit',
        input: {},
        tool_use_id: 'test',
      }),
    ).toBe(true);
  });

  it('should return true for MultiEdit', () => {
    expect(
      diffManager.isFileEditToolRequest({
        subtype: 'can_use_tool',
        tool_name: 'MultiEdit',
        input: {},
        tool_use_id: 'test',
      }),
    ).toBe(true);
  });

  it('should return true for Write', () => {
    expect(
      diffManager.isFileEditToolRequest({
        subtype: 'can_use_tool',
        tool_name: 'Write',
        input: {},
        tool_use_id: 'test',
      }),
    ).toBe(true);
  });

  it('should return false for other tools', () => {
    expect(
      diffManager.isFileEditToolRequest({
        subtype: 'can_use_tool',
        tool_name: 'BashTool',
        input: {},
        tool_use_id: 'test',
      }),
    ).toBe(false);
  });
});

describe('summarizeLineChanges', () => {
  it('counts a single-line replacement as one addition and one deletion', () => {
    expect(
      summarizeLineChanges(
        'const value = 1;\nreturn value;\n',
        'const value = 2;\nreturn value;\n',
      ),
    ).toEqual({ additions: 1, deletions: 1 });
  });

  it('counts prepends as pure additions', () => {
    expect(
      summarizeLineChanges(
        'const value = 1;\n',
        '// header\nconst value = 1;\n',
      ),
    ).toEqual({ additions: 1, deletions: 0 });
  });

  it('returns zero deltas when content is unchanged', () => {
    expect(summarizeLineChanges('const value = 1;\n', 'const value = 1;\n')).toEqual({
      additions: 0,
      deletions: 0,
    });
  });
});

describe('buildDiffPreview', () => {
  it('returns removed and added blocks with nearby context', () => {
    expect(
      buildDiffPreview(
        'line 1\nline 2\nline 3\nline 4\n',
        'line 1\nline two\nline 3\nline 4\n',
      ),
    ).toEqual({
      contextBefore: ['line 1'],
      removed: ['line 2'],
      added: ['line two'],
      contextAfter: ['line 3', 'line 4'],
      truncated: false,
    });
  });
});
