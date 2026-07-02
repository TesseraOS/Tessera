'use client';

import { useState, type FormEvent } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { TesseraApiError } from '@/lib/api/client';
import { useCaptureMemory } from '@/lib/api/hooks';
import type { MemoryKind } from '@/lib/api/types';

const KINDS: { value: MemoryKind; label: string }[] = [
  { value: 'decision', label: 'Decision' },
  { value: 'lesson', label: 'Lesson' },
  { value: 'incident', label: 'Incident' },
  { value: 'failure', label: 'Failure' },
  { value: 'architecture', label: 'Architecture' },
  { value: 'glossary', label: 'Glossary' },
  { value: 'task', label: 'Task' },
];

/** Capture a durable memory (FR-13) via POST /v1/memory. Real mutation — no fabricated data. */
export function CaptureMemoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [kind, setKind] = useState<MemoryKind>('decision');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const capture = useCaptureMemory();

  const reset = () => {
    setKind('decision');
    setTitle('');
    setBody('');
    capture.reset();
  };

  const canSubmit = title.trim().length > 0 && body.trim().length > 0 && !capture.isPending;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    capture.mutate(
      { kind, title: title.trim(), body: body.trim() },
      {
        onSuccess: () => {
          toast.success('Memory captured', { description: title.trim() });
          onOpenChange(false);
          reset();
        },
        onError: (error) =>
          toast.error('Could not capture memory', {
            description:
              error instanceof TesseraApiError ? error.message : 'Is the Tessera API running?',
          }),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Capture memory</DialogTitle>
          <DialogDescription>
            Record a decision, lesson, incident, or other durable knowledge for your agents.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="memory-kind" className="text-xs font-medium">
              Kind
            </label>
            <Select value={kind} onValueChange={(value) => setKind(value as MemoryKind)}>
              <SelectTrigger id="memory-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
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
          <div className="space-y-1.5">
            <label htmlFor="memory-body" className="text-xs font-medium">
              Details
            </label>
            <Textarea
              id="memory-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={5}
              placeholder="What happened, and why it matters…"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {capture.isPending ? 'Capturing…' : 'Capture memory'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
