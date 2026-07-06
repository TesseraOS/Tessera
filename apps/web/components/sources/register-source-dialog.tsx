'use client';

import { useState, type FormEvent } from 'react';
import { Cloud, Folder, FolderGit2 } from 'lucide-react';
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
import { TesseraApiError } from '@/lib/api/client';
import { useRegisterSource } from '@/lib/api/hooks';
import type { SourceKind } from '@/lib/api/types';

/**
 * Connector-specific registration copy. `filesystem` + `git` are registerable (both keyed on a
 * working-tree `root`); `github` is present but **disabled** — a GitHub *source* is not yet wired
 * into the runtime, so offering a working form would be a control that fails. Honest over aspirational.
 */
const KINDS: Record<
  SourceKind,
  { label: string; icon: typeof Folder; pathLabel: string; help: string; available: boolean }
> = {
  filesystem: {
    label: 'Filesystem',
    icon: Folder,
    pathLabel: 'Directory path',
    help: 'Absolute path to the folder Tessera should index (read-only).',
    available: true,
  },
  git: {
    label: 'Git repository',
    icon: FolderGit2,
    pathLabel: 'Repository path',
    help: 'Local working-tree root of a git repo; commit provenance is read from it.',
    available: true,
  },
  github: {
    label: 'GitHub (not yet available)',
    icon: Cloud,
    pathLabel: 'Repository',
    help: 'Remote GitHub sources are not wired into this deployment yet.',
    available: false,
  },
};

const REGISTERABLE: SourceKind[] = ['filesystem', 'git'];

/** Register a source (F-038/FR-62) via POST /v1/sources. Real mutation — no fabricated data. */
export function RegisterSourceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [kind, setKind] = useState<SourceKind>('filesystem');
  const [label, setLabel] = useState('');
  const [root, setRoot] = useState('');
  const register = useRegisterSource();

  const spec = KINDS[kind];

  const reset = () => {
    setKind('filesystem');
    setLabel('');
    setRoot('');
    register.reset();
  };

  const canSubmit = spec.available && root.trim().length > 0 && !register.isPending;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    register.mutate(
      {
        kind,
        config: { root: root.trim() },
        ...(label.trim().length > 0 ? { label: label.trim() } : {}),
      },
      {
        onSuccess: (source) => {
          toast.success('Source registered', { description: source.label });
          onOpenChange(false);
          reset();
        },
        onError: (error) =>
          toast.error('Could not register source', {
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
          <DialogTitle>Register a source</DialogTitle>
          <DialogDescription>
            Connect a repository for Tessera to index. Scans are incremental and idempotent.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="source-kind" className="text-xs font-medium">
              Connector
            </label>
            <Select value={kind} onValueChange={(value) => setKind(value as SourceKind)}>
              <SelectTrigger id="source-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(KINDS) as SourceKind[]).map((value) => {
                  const item = KINDS[value];
                  const Icon = item.icon;
                  return (
                    <SelectItem key={value} value={value} disabled={!item.available}>
                      <span className="flex items-center gap-2">
                        <Icon className="size-3.5" aria-hidden="true" />
                        {item.label}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="source-label" className="text-xs font-medium">
              Label <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Input
              id="source-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              maxLength={120}
              placeholder="e.g. Backend monorepo"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="source-root" className="text-xs font-medium">
              {spec.pathLabel}
            </label>
            <Input
              id="source-root"
              value={root}
              onChange={(event) => setRoot(event.target.value)}
              disabled={!spec.available}
              placeholder="/path/to/repository"
              className="font-mono text-xs"
              aria-describedby="source-root-help"
            />
            <p id="source-root-help" className="text-muted-foreground text-[11px] leading-normal">
              {spec.help}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {register.isPending ? 'Registering…' : 'Register source'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { REGISTERABLE };
