'use client';

import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { useTheme } from 'next-themes';

// Use the bundled monaco-editor (no CDN) so the editor works fully offline (enterprise/self-hosted).
loader.config({ monaco });

export interface MemoryEditorImplProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  readOnly?: boolean;
}

/**
 * The heavy, client-only Monaco editor. Loaded lazily (see `memory-editor.tsx`) so `monaco-editor`
 * (~MBs) is code-split out of the initial bundle and only fetched when authoring opens. Markdown
 * needs no language worker, so the default (main-thread) setup is sufficient and fully offline.
 */
export default function MemoryEditorImpl({
  value,
  onChange,
  ariaLabel,
  readOnly = false,
}: MemoryEditorImplProps) {
  const { resolvedTheme } = useTheme();
  return (
    <Editor
      height="320px"
      defaultLanguage="markdown"
      value={value}
      onChange={(next) => onChange(next ?? '')}
      theme={resolvedTheme === 'dark' ? 'vs-dark' : 'vs'}
      options={{
        ariaLabel,
        readOnly,
        minimap: { enabled: false },
        fontSize: 13,
        lineNumbers: 'off',
        wordWrap: 'on',
        scrollBeyondLastLine: false,
        renderLineHighlight: 'none',
        overviewRulerLanes: 0,
        padding: { top: 12, bottom: 12 },
        scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
      }}
    />
  );
}
