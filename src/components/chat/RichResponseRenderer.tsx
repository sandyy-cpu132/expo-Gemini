/**
 * RichResponseRenderer
 * High-fidelity modular response renderer for local AI outputs.
 * Parses and renders Markdown, syntax-highlighted code blocks with line numbers & copy,
 * LaTeX mathematical expressions, structured tables, task lists, and clickable citations.
 */

import React, { useState } from 'react';
import {
  Check,
  Copy,
  ChevronDown,
  ChevronRight,
  FileText,
  AlertTriangle,
  Info,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { Citation } from '../../types';

interface RichResponseRendererProps {
  content: string;
  citations?: Citation[];
  onCitationClick?: (citation: Citation) => void;
  isStreaming?: boolean;
}

export const RichResponseRenderer: React.FC<RichResponseRendererProps> = ({
  content,
  citations = [],
  onCitationClick,
  isStreaming = false,
}) => {
  return (
    <div className="text-[14.5px] leading-relaxed text-slate-800 dark:text-slate-100 font-sans space-y-3 break-words">
      {parseBlocks(content, citations, onCitationClick)}

      {/* Render Citations Tray if available */}
      {citations.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-slate-800/60">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1.5 uppercase tracking-wider">
            <FileText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            Verified Local Sources ({citations.length})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {citations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onCitationClick?.(c)}
                className="text-left p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/20 transition-all group"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-medium text-xs text-slate-800 dark:text-slate-200 truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                    [{c.id}] {c.documentName}
                  </span>
                  <ExternalLink className="w-3 h-3 text-slate-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                {c.sectionHeader && (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    § {c.sectionHeader}
                  </div>
                )}
                <div className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2 mt-1 italic">
                  "{c.excerpt}"
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {isStreaming && (
        <span className="inline-block w-2 h-4 ml-0.5 bg-emerald-500 animate-pulse rounded-sm align-middle" />
      )}
    </div>
  );
};

// --- Block Parser ---
function parseBlocks(
  text: string,
  citations: Citation[],
  onCitationClick?: (citation: Citation) => void
): React.ReactNode[] {
  const blocks: React.ReactNode[] = [];
  const lines = text.split('\n');

  let inCodeBlock = false;
  let codeLang = '';
  let codeLines: string[] = [];

  let inTable = false;
  let tableRows: string[] = [];

  let inMathBlock = false;
  let mathLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced Code Block Handler ```lang
    if (line.trim().startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLang = line.trim().slice(3).trim();
        codeLines = [];
        continue;
      } else {
        inCodeBlock = false;
        blocks.push(
          <CodeBlock
            key={`code-${i}`}
            code={codeLines.join('\n')}
            language={codeLang || 'plaintext'}
          />
        );
        codeLines = [];
        continue;
      }
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Math display block $$
    if (line.trim() === '$$') {
      if (!inMathBlock) {
        inMathBlock = true;
        mathLines = [];
        continue;
      } else {
        inMathBlock = false;
        blocks.push(<MathDisplayBlock key={`math-${i}`} formula={mathLines.join('\n')} />);
        mathLines = [];
        continue;
      }
    }

    if (inMathBlock) {
      mathLines.push(line);
      continue;
    }

    // Markdown Table Handler
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      inTable = true;
      tableRows.push(line);
      continue;
    } else if (inTable) {
      inTable = false;
      blocks.push(<TableBlock key={`table-${i}`} rawRows={tableRows} />);
      tableRows = [];
    }

    // Headings
    if (line.startsWith('# ')) {
      blocks.push(
        <h1
          key={`h1-${i}`}
          className="text-xl font-bold tracking-tight text-slate-900 dark:text-white pt-2 pb-1 border-b border-slate-200/50 dark:border-slate-800"
        >
          {renderInline(line.slice(2), citations, onCitationClick)}
        </h1>
      );
      continue;
    }
    if (line.startsWith('## ')) {
      blocks.push(
        <h2
          key={`h2-${i}`}
          className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white pt-2 pb-0.5"
        >
          {renderInline(line.slice(3), citations, onCitationClick)}
        </h2>
      );
      continue;
    }
    if (line.startsWith('### ')) {
      blocks.push(
        <h3
          key={`h3-${i}`}
          className="text-[15px] font-semibold text-slate-800 dark:text-slate-100 pt-1"
        >
          {renderInline(line.slice(4), citations, onCitationClick)}
        </h3>
      );
      continue;
    }

    // Horizontal Rule
    if (/^(---|___|\*\*\*)$/.test(line.trim())) {
      blocks.push(
        <hr key={`hr-${i}`} className="border-t border-slate-200 dark:border-slate-800 my-3" />
      );
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      blocks.push(
        <blockquote
          key={`quote-${i}`}
          className="pl-3 py-1 my-1 italic border-l-2 border-emerald-500/70 text-slate-600 dark:text-slate-300 bg-emerald-500/5 rounded-r"
        >
          {renderInline(line.slice(2), citations, onCitationClick)}
        </blockquote>
      );
      continue;
    }

    // Task list items
    if (/^\s*-\s*\[([ xX])\]\s+(.*)/.test(line)) {
      const match = line.match(/^\s*-\s*\[([ xX])\]\s+(.*)/);
      if (match) {
        const isChecked = match[1].toLowerCase() === 'x';
        blocks.push(
          <div key={`task-${i}`} className="flex items-center gap-2.5 py-0.5">
            <span
              className={`w-4 h-4 rounded flex items-center justify-center border text-[10px] ${
                isChecked
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900'
              }`}
            >
              {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
            </span>
            <span
              className={`text-sm ${
                isChecked ? 'line-through text-slate-400 dark:text-slate-500' : ''
              }`}
            >
              {renderInline(match[2], citations, onCitationClick)}
            </span>
          </div>
        );
        continue;
      }
    }

    // Bullet lists
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      const content = line.trim().slice(2);
      blocks.push(
        <div key={`bullet-${i}`} className="flex items-start gap-2 ml-2 my-0.5">
          <span className="text-emerald-500 mt-1.5 text-xs">•</span>
          <span className="flex-1">{renderInline(content, citations, onCitationClick)}</span>
        </div>
      );
      continue;
    }

    // Numbered lists
    const numMatch = line.trim().match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      blocks.push(
        <div key={`num-${i}`} className="flex items-start gap-2.5 ml-2 my-0.5">
          <span className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0">
            {numMatch[1]}.
          </span>
          <span className="flex-1">{renderInline(numMatch[2], citations, onCitationClick)}</span>
        </div>
      );
      continue;
    }

    // Empty lines
    if (!line.trim()) {
      blocks.push(<div key={`blank-${i}`} className="h-1" />);
      continue;
    }

    // Regular paragraph
    blocks.push(
      <p key={`p-${i}`} className="my-1">
        {renderInline(line, citations, onCitationClick)}
      </p>
    );
  }

  // Flush trailing table if any
  if (inTable && tableRows.length > 0) {
    blocks.push(<TableBlock key="table-tail" rawRows={tableRows} />);
  }
  if (inCodeBlock && codeLines.length > 0) {
    blocks.push(
      <CodeBlock key="code-tail" code={codeLines.join('\n')} language={codeLang || 'plaintext'} />
    );
  }

  return blocks;
}

// --- Inline Elements Parser (Bold, Italic, Code, Math $x$, Citations [ref-1]) ---
function renderInline(
  text: string,
  citations: Citation[],
  onCitationClick?: (citation: Citation) => void
): React.ReactNode {
  // Regex to match inline code `...`, inline math $...$, bold **...**, italic *...*, citations [ref-X]
  const parts: React.ReactNode[] = [];
  let remaining = text;

  let keyCounter = 0;
  while (remaining.length > 0) {
    // 1. Citation reference e.g. [ref-1]
    const citeMatch = remaining.match(/^\[(ref-\d+)\]/i);
    if (citeMatch) {
      const citeId = citeMatch[1];
      const foundCitation = citations.find((c) => c.id.toLowerCase() === citeId.toLowerCase());
      parts.push(
        <button
          key={`cite-${keyCounter++}`}
          type="button"
          onClick={() => foundCitation && onCitationClick?.(foundCitation)}
          className="inline-flex items-center px-1.5 py-0.2 mx-0.5 text-xs font-mono font-medium rounded-md bg-emerald-100/80 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900 border border-emerald-300/60 dark:border-emerald-700/60 transition-colors"
          title={foundCitation ? `${foundCitation.documentName}: "${foundCitation.excerpt}"` : citeId}
        >
          {citeId}
        </button>
      );
      remaining = remaining.slice(citeMatch[0].length);
      continue;
    }

    // 2. Inline code `...`
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      parts.push(
        <code
          key={`inline-code-${keyCounter++}`}
          className="px-1.5 py-0.5 text-[13px] font-mono rounded bg-slate-100 dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 border border-slate-200 dark:border-slate-700"
        >
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // 3. Inline LaTeX math $...$
    const mathMatch = remaining.match(/^\$([^$]+)\$/);
    if (mathMatch) {
      parts.push(
        <span
          key={`inline-math-${keyCounter++}`}
          className="px-1.5 py-0.5 mx-0.5 font-serif italic text-indigo-700 dark:text-indigo-300 bg-indigo-50/70 dark:bg-indigo-950/40 rounded border border-indigo-200/50 dark:border-indigo-800/50"
        >
          {mathMatch[1]}
        </span>
      );
      remaining = remaining.slice(mathMatch[0].length);
      continue;
    }

    // 4. Bold **...**
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      parts.push(
        <strong key={`bold-${keyCounter++}`} className="font-semibold text-slate-900 dark:text-white">
          {boldMatch[1]}
        </strong>
      );
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // 5. Italic *...*
    const italicMatch = remaining.match(/^\*([^*]+)\*/);
    if (italicMatch) {
      parts.push(
        <em key={`italic-${keyCounter++}`} className="italic">
          {italicMatch[1]}
        </em>
      );
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Default character
    parts.push(remaining[0]);
    remaining = remaining.slice(1);
  }

  return parts;
}

// --- Code Block with Syntax Bar & Copy ---
const CodeBlock: React.FC<{ code: string; language: string }> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = code.split('\n');

  return (
    <div className="rounded-xl overflow-hidden border border-slate-700/60 bg-slate-950 text-slate-100 my-3 shadow-md">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-slate-900 border-b border-slate-800 text-xs font-mono">
        <span className="text-slate-400 lowercase">{language || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="p-3 overflow-x-auto text-xs font-mono leading-relaxed">
        <table className="border-collapse w-full">
          <tbody>
            {lines.map((ln, idx) => (
              <tr key={idx} className="hover:bg-slate-900/40">
                <td className="pr-3 text-right select-none text-slate-600 text-[11px] w-6 align-top">
                  {idx + 1}
                </td>
                <td className="whitespace-pre text-slate-200">{ln || ' '}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- Math Display Equation Block ---
const MathDisplayBlock: React.FC<{ formula: string }> = ({ formula }) => {
  return (
    <div className="my-3 py-3 px-4 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/30 text-indigo-900 dark:text-indigo-200 text-center font-serif text-base italic overflow-x-auto shadow-sm">
      {formula}
    </div>
  );
};

// --- Table Block ---
const TableBlock: React.FC<{ rawRows: string[] }> = ({ rawRows }) => {
  if (rawRows.length < 2) return null;

  const parseRow = (rowStr: string) =>
    rowStr
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());

  const headers = parseRow(rawRows[0]);
  const rows = rawRows.slice(2).map(parseRow);

  return (
    <div className="overflow-x-auto my-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-xs">
        <thead className="bg-slate-100 dark:bg-slate-900">
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-950">
          {rows.map((row, rIdx) => (
            <tr
              key={rIdx}
              className={rIdx % 2 === 0 ? 'bg-transparent' : 'bg-slate-50/50 dark:bg-slate-900/40'}
            >
              {row.map((cell, cIdx) => (
                <td
                  key={cIdx}
                  className="px-3 py-2 text-slate-700 dark:text-slate-300 whitespace-nowrap"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
