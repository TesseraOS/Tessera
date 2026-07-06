'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MemoryEditor } from '@/components/memory/memory-editor';
import { TesseraApiError } from '@/lib/api/client';
import { useCaptureMemory, useEditMemory } from '@/lib/api/hooks';
import { MEMORY_KIND_LABELS } from '@/lib/memory';
import {
  MEMORY_KINDS,
  type EditMemoryBody,
  type Memory,
  type MemoryKind,
  type MemoryMetadata,
} from '@/lib/api/types';

function tagsToText(tags: string[] | undefined): string {
  return (tags ?? []).join(', ');
}
function textToTags(text: string): string[] {
  return text
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

/**
 * Author a memory (FR-13) — capture (POST) or edit (PATCH, appends a superseding version). The body
 * is edited in Monaco (markdown, lazy/code-split). Real mutations over `/v1/memory`; on success the
 * browser + the lineage's history are refreshed (via the hooks' invalidations).
 */
export function MemoryAuthoringDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: Memory | null;
}) {
  const isEdit = editing != null;
  const [kind, setKind] = useState<MemoryKind>('decision');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [scope, setScope] = useState('');
  const [source, setSource] = useState('');
  const [author, setAuthor] = useState('');
  const [tags, setTags] = useState('');

  const capture = useCaptureMemory();
  const edit = useEditMemory();
  const pending = capture.isPending || edit.isPending;

  // Prefill from the edited memory each time the dialog opens (or reset for capture).
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setKind(editing.kind);
      setTitle(editing.title);
      setBody(editing.body);
      setScope(editing.scope);
      setSource(editing.metadata.source ?? '');
      setAuthor(editing.metadata.author ?? '');
      setTags(tagsToText(editing.metadata.tags));
    } else {
      setKind('decision');
      setTitle('');
      setBody('');
      setScope('');
      setSource('');
      setAuthor('');
      setTags('');
    }
  }, [open, editing]);

  const canSubmit = title.trim().length > 0 && body.trim().length > 0 && !pending;

  const buildMetadata = (): MemoryMetadata | undefined => {
    const metadata: MemoryMetadata = {};
    if (source.trim()) metadata.source = source.trim();
    if (author.trim()) metadata.author = author.trim();
    const tagList = textToTags(tags);
    if (tagList.length > 0) metadata.tags = tagList;
    return Object.keys(metadata).length > 0 ? metadata : undefined;
  };

  const onSaved = (memory: Memory) => {
    toast.success(isEdit ? 'Memory updated' : 'Memory captured', {
      description: isEdit ? `${memory.title} · v${memory.version}` : memory.title,
    });
    onOpenChange(false);
  };
  const onFailed = (error: unknown) =>
    toast.error(isEdit ? 'Could not update memory' : 'Could not capture memory', {
      description: error instanceof TesseraApiError ? error.message : 'Is the Tessera API running?',
    });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    const metadata = buildMetadata();

    if (isEdit && editing) {
      const patch: EditMemoryBody = {
        title: title.trim(),
        body: body.trim(),
        scope: scope.trim() || editing.scope,
        ...(metadata ? { metadata } : {}),
      };
      edit.mutate(
        { lineageId: editing.lineageId, body: patch },
        { onSuccess: onSaved, onError: onFailed },
      );
    } else {
      capture.mutate(
        {
          kind,
          title: title.trim(),
          body: body.trim(),
          ...(scope.trim() ? { scope: scope.trim() } : {}),
          ...(metadata ? { metadata } : {}),
        },
        { onSuccess: onSaved, onError: onFailed },
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-4 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit memory' : 'Capture memory'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Saving appends a new version — the prior version is preserved (never overwritten).'
              : 'Record a decision, lesson, incident, or other durable knowledge for your agents.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
            <div className="space-y-1.5">
              <label htmlFor="memory-kind" className="text-xs font-medium">
                Kind
              </label>
              <Select
                value={kind}
                onValueChange={(value) => setKind(value as MemoryKind)}
                disabled={isEdit}
              >
                <SelectTrigger id="memory-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEMORY_KINDS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {MEMORY_KIND_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="memory-title" className="text-xs font-medium">
                Title
              </label>
              <Input
                id="memory-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={200}
                placeholder="e.g. Chose Fastify over Express for the API"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium" id="memory-body-label">
              Details
            </span>
            <div className="overflow-hidden rounded-md border">
              <MemoryEditor value={body} onChange={setBody} ariaLabel="Memory body (markdown)" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="memory-scope" className="text-xs font-medium">
                Scope <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Input
                id="memory-scope"
                value={scope}
                onChange={(event) => setScope(event.target.value)}
                placeholder="global"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="memory-tags" className="text-xs font-medium">
                Tags <span className="text-muted-foreground font-normal">(comma-separated)</span>
              </label>
              <Input
                id="memory-tags"
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="api, decision"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="memory-source" className="text-xs font-medium">
                Source <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Input
                id="memory-source"
                value={source}
                onChange={(event) => setSource(event.target.value)}
                placeholder="adr:0016"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="memory-author" className="text-xs font-medium">
                Author <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Input
                id="memory-author"
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                placeholder="you@team"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {pending
                ? isEdit
                  ? 'Saving…'
                  : 'Capturing…'
                : isEdit
                  ? 'Save new version'
                  : 'Capture memory'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
