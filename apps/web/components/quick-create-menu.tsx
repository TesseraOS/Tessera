'use client';

import { useState } from 'react';
import { BookText, Boxes, FolderKanban, Plus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenuButton } from '@/components/ui/sidebar';
import { MemoryAuthoringDialog } from '@/components/memory/memory-authoring-dialog';
import { RegisterSourceDialog } from '@/components/sources/register-source-dialog';
import { useNewProjectDialog } from '@/lib/store/quick-create';

type QuickCreate = 'memory' | 'source' | null;

/**
 * The sidebar "+ New" quick-create menu (F-050; the 2026-07-04 product decision). The dedicated
 * "New memory" button evolved into one menu — memory / source / project — so capturing a memory (the
 * frequent action) stays a click away while project creation gets a first-class home. Each item opens
 * the same authoring dialog its dedicated surface uses, so there is one implementation per entity.
 */
export function QuickCreateMenu() {
  const [openDialog, setOpenDialog] = useState<QuickCreate>(null);
  const newProject = useNewProjectDialog();
  const close = () => setOpenDialog(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            tooltip="Create"
            aria-label="Create"
            className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground data-[state=open]:bg-primary/90 data-[state=open]:text-primary-foreground"
          >
            <Plus />
            <span>New</span>
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right" sideOffset={8} className="w-48">
          <DropdownMenuItem onSelect={() => setOpenDialog('memory')} className="gap-2">
            <BookText className="text-muted-foreground size-4" />
            New memory
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setOpenDialog('source')} className="gap-2">
            <Boxes className="text-muted-foreground size-4" />
            New source
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => newProject.setOpen(true)} className="gap-2">
            <FolderKanban className="text-muted-foreground size-4" />
            New project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Memory + source dialogs are local; the project dialog is shared (mounted in the switcher). */}
      <MemoryAuthoringDialog open={openDialog === 'memory'} onOpenChange={close} />
      <RegisterSourceDialog open={openDialog === 'source'} onOpenChange={close} />
    </>
  );
}
