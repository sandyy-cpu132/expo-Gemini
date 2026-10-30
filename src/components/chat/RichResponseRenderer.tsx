/**
 * RichResponseRenderer for React Native
 * Parses Markdown-style text, headings, bullet lists, code blocks with syntax styling,
 * blockquotes, and clickable citation references without any DOM elements.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { theme } from '../../theme/theme';
import { Citation } from '../../types';

interface RichResponseRendererProps {
  content: string;
  citations?: Citation[];
  onCitationPress?: (citation: Citation) => void;
  isStreaming?: boolean;
}

export const RichResponseRenderer: React.FC<RichResponseRendererProps> = ({
  content,
  citations = [],
  onCitationPress,
  isStreaming = false,
}) => {
  const blocks = parseMarkdownBlocks(content);

  return (
    <View style={styles.container}>
      {blocks.map((block, idx) => {
        if (block.type === 'code') {
          return (
            <View key={idx} style={styles.codeContainer}>
              <View style={styles.codeHeader}>
                <Text style={styles.codeLanguage}>{block.language || 'code'}</Text>
              </View>
              <View style={styles.codeBody}>
                <Text style={styles.codeText} selectable>
                  {block.content}
                </Text>
              </View>
            </View>
          );
        }

        if (block.type === 'h1') {
          return (
            <Text key={idx} style={styles.h1}>
              {renderInlineText(block.content, citations, onCitationPress)}
            </Text>
          );
        }

        if (block.type === 'h2') {
          return (
            <Text key={idx} style={styles.h2}>
              {renderInlineText(block.content, citations, onCitationPress)}
            </Text>
          );
        }

        if (block.type === 'h3') {
          return (
            <Text key={idx} style={styles.h3}>
              {renderInlineText(block.content, citations, onCitationPress)}
            </Text>
          );
        }

        if (block.type === 'quote') {
          return (
            <View key={idx} style={styles.quoteBox}>
              <Text style={styles.quoteText}>
                {renderInlineText(block.content, citations, onCitationPress)}
              </Text>
            </View>
          );
        }

        if (block.type === 'bullet') {
          return (
            <View key={idx} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bodyText}>
                {renderInlineText(block.content, citations, onCitationPress)}
              </Text>
            </View>
          );
        }

        return (
          <Text key={idx} style={styles.bodyText}>
            {renderInlineText(block.content, citations, onCitationPress)}
          </Text>
        );
      })}

      {/* Citations Tray */}
      {citations.length > 0 && (
        <View style={styles.citationsContainer}>
          <Text style={styles.citationsHeader}>
            LOCAL SOURCES ({citations.length})
          </Text>
          <View style={styles.citationsGrid}>
            {citations.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => onCitationPress?.(c)}
                style={({ pressed }) => [
                  styles.citationCard,
                  pressed && styles.citationCardPressed,
                ]}
              >
                <Text style={styles.citationBadge}>[{c.id}] {c.documentName}</Text>
                {c.sectionHeader ? (
                  <Text style={styles.citationSection} numberOfLines={1}>
                    § {c.sectionHeader}
                  </Text>
                ) : null}
                <Text style={styles.citationExcerpt} numberOfLines={2}>
                  "{c.excerpt}"
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {isStreaming && <View style={styles.streamingCursor} />}
    </View>
  );
};

interface Block {
  type: 'p' | 'h1' | 'h2' | 'h3' | 'quote' | 'bullet' | 'code';
  content: string;
  language?: string;
}

function parseMarkdownBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.split('\n');

  let inCode = false;
  let codeLang = '';
  let codeBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith('```')) {
      if (!inCode) {
        inCode = true;
        codeLang = line.trim().slice(3).trim();
        codeBuffer = [];
        continue;
      } else {
        inCode = false;
        blocks.push({
          type: 'code',
          content: codeBuffer.join('\n'),
          language: codeLang,
        });
        codeBuffer = [];
        continue;
      }
    }

    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) continue;

    if (line.startsWith('# ')) {
      blocks.push({ type: 'h1', content: line.slice(2).trim() });
    } else if (line.startsWith('## ')) {
      blocks.push({ type: 'h2', content: line.slice(3).trim() });
    } else if (line.startsWith('### ')) {
      blocks.push({ type: 'h3', content: line.slice(4).trim() });
    } else if (line.startsWith('> ')) {
      blocks.push({ type: 'quote', content: line.slice(2).trim() });
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      blocks.push({ type: 'bullet', content: trimmed.slice(2).trim() });
    } else {
      blocks.push({ type: 'p', content: line });
    }
  }

  if (inCode && codeBuffer.length > 0) {
    blocks.push({ type: 'code', content: codeBuffer.join('\n'), language: codeLang });
  }

  return blocks;
}

function renderInlineText(
  text: string,
  citations: Citation[],
  onCitationPress?: (citation: Citation) => void
): React.ReactNode {
  // Simple token regex for inline code `...` and citations [ref-X]
  const regex = /(\[ref-\d+\]|`[^`]+`)/gi;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (!part) return null;

    if (/^\[ref-\d+\]$/i.test(part)) {
      const citeId = part.slice(1, -1);
      const found = citations.find((c) => c.id.toLowerCase() === citeId.toLowerCase());
      return (
        <Text
          key={index}
          onPress={() => found && onCitationPress?.(found)}
          style={styles.citationInline}
        >
          {part}
        </Text>
      );
    }

    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <Text key={index} style={styles.inlineCode}>
          {part.slice(1, -1)}
        </Text>
      );
    }

    return <Text key={index}>{part}</Text>;
  });
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  bodyText: {
    fontSize: 14.5,
    lineHeight: 22,
    color: '#e2e8f0',
  },
  h1: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
    marginTop: 6,
    marginBottom: 2,
  },
  h2: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
    marginTop: 4,
    marginBottom: 2,
  },
  h3: {
    fontSize: 14.5,
    fontWeight: '600',
    color: '#34d399',
    marginTop: 2,
  },
  quoteBox: {
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.emerald,
    paddingLeft: 10,
    marginVertical: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
    paddingVertical: 4,
    borderRadius: 4,
  },
  quoteText: {
    fontSize: 13.5,
    fontStyle: 'italic',
    color: '#cbd5e1',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginLeft: 4,
  },
  bulletDot: {
    fontSize: 14,
    color: theme.colors.emerald,
    lineHeight: 22,
  },
  codeContainer: {
    backgroundColor: '#050b14',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginVertical: 6,
    overflow: 'hidden',
  },
  codeHeader: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  codeLanguage: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#94a3b8',
    textTransform: 'lowercase',
  },
  codeBody: {
    padding: 10,
  },
  codeText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#38bdf8',
    lineHeight: 18,
  },
  inlineCode: {
    fontFamily: 'monospace',
    fontSize: 12.5,
    color: '#34d399',
    backgroundColor: '#1e293b',
  },
  citationInline: {
    fontSize: 11.5,
    fontFamily: 'monospace',
    color: '#6ee7b7',
    fontWeight: '700',
  },
  citationsContainer: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  citationsHeader: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  citationsGrid: {
    gap: 6,
  },
  citationCard: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 8,
    padding: 8,
  },
  citationCardPressed: {
    borderColor: theme.colors.emerald,
  },
  citationBadge: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#34d399',
  },
  citationSection: {
    fontSize: 10.5,
    color: '#94a3b8',
    marginTop: 2,
  },
  citationExcerpt: {
    fontSize: 11,
    color: '#cbd5e1',
    fontStyle: 'italic',
    marginTop: 2,
  },
  streamingCursor: {
    width: 8,
    height: 14,
    backgroundColor: theme.colors.emerald,
    borderRadius: 2,
    marginTop: 4,
  },
});
