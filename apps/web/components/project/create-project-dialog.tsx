'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCreateProject, useSwitchProject } from '@/lib/api/hooks';
import { TesseraApiError } from '@/lib/api/client';

const MAX_PROJECT_NAME_LENGTH = 100;

/**
 * Create a project (F-050, ADR-0037). A project is an isolated workspace scope — its own sources,
 * memory, graph, and search. On success the caller is switched into the new project (the whole
 * dashboard re-scopes). Duplicate names surface the API's `409` inline rather than as a raw error.
 */
export function CreateProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState('');
  const create = useCreateProject();
  const switchProject = useSwitchProject();

  // Reset the field each time the dialog opens.
  useEffect(() => {
    if (open) setName('');
  }, [open]);

  const trimmed = name.trim();

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (trimmed.length === 0 || create.isPending) return;
    try {
      const project = await create.mutateAsync(trimmed);
      switchProject(project.id);
      toast.success(`Switched to “${project.name}”`);
      onOpenChange(false);
    } catch (error) {
      const message =
        error instanceof TesseraApiError && error.status === 409
          ? 'A project with that name already exists.'
          : 'Could not create the project. Please try again.';
      toast.error(message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            A project is an isolated workspace — its own sources, memory, graph, and search. You can
            switch between projects any time.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="project-name" className="text-xs font-medium">
              Name
            </label>
            <Input
              id="project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={MAX_PROJECT_NAME_LENGTH}
              placeholder="e.g. Payments service"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={create.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={trimmed.length === 0 || create.isPending}>
              {create.isPending ? 'Creating…' : 'Create project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
