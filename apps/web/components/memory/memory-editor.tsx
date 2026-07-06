'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import type { MemoryEditorImplProps } from './memory-editor-impl';

/**
 * Lazy, code-split Monaco editor for authoring memory bodies (FR-13). `ssr: false` keeps
 * `monaco-editor` out of the server render + the initial bundle; it loads only when authoring opens.
 */
const MemoryEditorImpl = dynamic(() => import('./memory-editor-impl'), {
  ssr: false,
  loading: () => <Skeleton className="h-[320px] w-full rounded-md" />,
});

export type MemoryEditorProps = MemoryEditorImplProps;

export function MemoryEditor(props: MemoryEditorProps) {
  return <MemoryEditorImpl {...props} />;
}
