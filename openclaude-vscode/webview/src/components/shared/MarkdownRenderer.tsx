import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { Components } from 'react-markdown';
import { CodeBlock } from './CodeBlock';

let remarkMath: typeof import('remark-math').default | null = null;
let rehypeKatex: typeof import('rehype-katex').default | null = null;

try {
  remarkMath = require('remark-math');
  rehypeKatex = require('rehype-katex');
  require('katex/dist/katex.min.css');
} catch {
  // LaTeX packages not installed — math rendering disabled
}

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
}

export function MarkdownRenderer({ content, isStreaming = false }: MarkdownRendererProps) {
  const remarkPlugins: Array<typeof remarkGfm> = [remarkGfm];
  const rehypePlugins: Array<typeof rehypeHighlight> = [rehypeHighlight];

  if (remarkMath) remarkPlugins.push(remarkMath as typeof remarkGfm);
  if (rehypeKatex) rehypePlugins.push(rehypeKatex as typeof rehypeHighlight);

  return (
    <div className="markdown-body prose prose-sm max-w-none text-vscode-fg">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

const markdownComponents: Components = {
  pre({ children }) {
    return <>{children}</>;
  },

  code({ className, children, ...props }) {
    const isInline = !className && typeof children === 'string' && !children.includes('\n');

    if (isInline) {
      return (
        <code
          className="px-1.5 py-0.5 rounded text-xs font-mono bg-[var(--vscode-textCodeBlock-background)]"
          {...props}
        >
          {children}
        </code>
      );
    }

    const codeText = extractTextContent(children);

    return (
      <CodeBlock className={className} language={undefined}>
        {codeText}
      </CodeBlock>
    );
  },

  a({ href, children }) {
    return (
      <a
        href={href}
        className="text-vscode-link hover:underline"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    );
  },

  table({ children }) {
    return (
      <div className="overflow-x-auto my-2">
        <table className="min-w-full border-collapse border border-vscode-border text-sm">
          {children}
        </table>
      </div>
    );
  },

  th({ children }) {
    return (
      <th className="border border-vscode-border px-3 py-1.5 text-left font-semibold bg-[var(--vscode-editorGroupHeader-tabsBackground)]">
        {children}
      </th>
    );
  },

  td({ children }) {
    return (
      <td className="border border-vscode-border px-3 py-1.5">
        {children}
      </td>
    );
  },

  li({ children, ...props }) {
    const isTaskItem = props.className?.includes('task-list-item');
    return (
      <li className={isTaskItem ? 'list-none' : undefined}>
        {children}
      </li>
    );
  },

  blockquote({ children }) {
    return (
      <blockquote className="border-l-4 border-vscode-link pl-4 my-2 opacity-80 italic">
        {children}
      </blockquote>
    );
  },
};

function extractTextContent(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(extractTextContent).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    return extractTextContent((children as React.ReactElement).props.children);
  }
  return String(children ?? '');
}
