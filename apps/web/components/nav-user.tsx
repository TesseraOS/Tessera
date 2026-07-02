'use client';

import { Settings } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Account control. R0 runs locally with no auth (PRD deployment matrix); OIDC + org RBAC arrive
 * at R2 (F-025/F-026). This is the seam — intentionally identity-free until then (no fake user).
 */
export function NavUser() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8 rounded-full" aria-label="Account">
          <Avatar className="size-8">
            <AvatarFallback className="text-xs font-medium">T</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <span className="flex flex-col">
            <span className="text-sm font-medium">Local profile</span>
            <span className="text-muted-foreground text-xs font-normal">
              Local mode · no account
            </span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/settings">
            <Settings />
            Settings
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
