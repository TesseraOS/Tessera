'use client';

import { Check, ClipboardCopy, Download } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { copyToClipboard, downloadTextFile } from '@/lib/clipboard';
import { exportFilename, toJson, toMarkdown } from '@/lib/export/context-package';
import type { ContextPackage } from '@/lib/api/types';

/**
 * The human↔agent handoff (F-062): copy the package as citation-preserving Markdown, or download the
 * complete record as JSON.
 *
 * The split is deliberate — **Markdown is what you paste into an agent** (sections, citations,
 * why-included, bodies), **JSON is the complete record** (the trace included, exactly as the API sent
 * it). Serializing both is pure and lives in `lib/export`, so the formats are tested without a DOM.
 */
export function PackageExport({ pkg }: { pkg: ContextPackage }) {
  const [copied, setCopied] = useState(false);

  const copyMarkdown = async () => {
    const ok = await copyToClipboard(toMarkdown(pkg), 'Context package copied as Markdown');
    // Only claim success if it actually copied — the clipboard rejects on insecure origins and
    // denied permissions, and a tick that appears anyway is a lie the user acts on.
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        className="h-8 text-xs"
        onClick={() => void copyMarkdown()}
      >
        {copied ? <Check className="size-3.5" /> : <ClipboardCopy className="size-3.5" />}
        {copied ? 'Copied' : 'Copy as Markdown'}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8 text-xs"
        onClick={() =>
          downloadTextFile(toJson(pkg), exportFilename(pkg, 'json'), 'application/json')
        }
      >
        <Download className="size-3.5" />
        Download JSON
      </Button>
    </div>
  );
}
