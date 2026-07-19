'use client';

import { Check, ChevronsUpDown, FolderKanban, Plus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { CreateProjectDialog } from '@/components/project/create-project-dialog';
import { useProjects, useSwitchProject } from '@/lib/api/hooks';
import { useProjectStore } from '@/lib/store/project';
import { useNewProjectDialog } from '@/lib/store/quick-create';

/**
 * The app-shell project switcher (F-050, ADR-0037). Shows the active project and switches between them;
 * "New project" lives here (the 2026-07-04 product decision), not as a separate sidebar button. Switching
 * re-scopes the whole dashboard (every view refetches for the selected project). The reserved default
 * project is always present, so there is no empty state — only loading and the populated list.
 */
export function ProjectSwitcher() {
  const { data, isPending } = useProjects();
  const selectedProjectId = useProjectStore((state) => state.selectedProjectId);
  const switchProject = useSwitchProject();
  const newProject = useNewProjectDialog();

  const projects = data?.projects ?? [];
  const active = projects.find((project) => project.id === selectedProjectId) ?? projects[0];

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              tooltip="Switch project"
              aria-label="Switch project"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <FolderKanban className="text-muted-foreground" />
              {isPending && active === undefined ? (
                <Skeleton className="h-4 w-24" />
              ) : (
                <span className="truncate font-medium">{active?.name ?? 'Default'}</span>
              )}
              <ChevronsUpDown className="ml-auto text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            side="right"
            sideOffset={8}
            className="w-56"
            // Match the trigger width when opened below on mobile.
          >
            <DropdownMenuLabel className="text-muted-foreground text-xs">
              Projects
            </DropdownMenuLabel>
            {projects.map((project) => (
              <DropdownMenuItem
                key={project.id}
                onSelect={() => switchProject(project.id)}
                className="gap-2"
              >
                <FolderKanban className="text-muted-foreground size-4" />
                <span className="truncate">{project.name}</span>
                {project.id === (active?.id ?? '') && <Check className="ml-auto size-4" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => newProject.setOpen(true)} className="gap-2">
              <Plus className="size-4" />
              New project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
      {/* Mounted once here (the switcher is always in the shell); opened from the switcher, the '+ New'
          menu, and the ⌘K palette via the shared store. */}
      <CreateProjectDialog open={newProject.open} onOpenChange={newProject.setOpen} />
    </SidebarMenu>
  );
}
