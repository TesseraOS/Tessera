'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { SidebarMenuButton } from '@/components/ui/sidebar';
import { CaptureMemoryDialog } from '@/components/capture-memory-dialog';

/** Prominent sidebar quick-action → opens the real Capture-Memory dialog (POST /v1/memory). */
export function NewMemoryButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <SidebarMenuButton
        tooltip="New memory"
        onClick={() => setOpen(true)}
        className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
      >
        <Plus />
        <span>New memory</span>
      </SidebarMenuButton>
      <CaptureMemoryDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
