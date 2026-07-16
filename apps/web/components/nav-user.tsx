'use client';

import { LogOut, Settings, UserRound } from 'lucide-react';
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
import { useSession } from '@/lib/auth/use-session';

/**
 * Account control (F-045). Zero-auth Local mode — or an unreachable API — keeps the identity-free
 * "Local mode · no account" placeholder (no sign-out). When a token/OIDC principal is signed in, it
 * shows the identity + tenant + role and a Sign out action (ADR-0048).
 */
export function NavUser() {
  const { identity, isLocal, signOut } = useSession();
  const authed = identity !== null && !isLocal;

  const name = authed ? (identity.principal.displayName ?? identity.principal.id) : 'Local profile';
  const detail = authed
    ? `${identity.tenantId} · ${identity.principal.roles[0] ?? 'member'}`
    : 'Local mode · no account';
  const initial = name.trim().charAt(0).toUpperCase() || 'T';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8 rounded-full" aria-label="Account">
          <Avatar className="size-8">
            <AvatarFallback className="text-xs font-medium">{initial}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <span className="flex flex-col">
            <span className="text-sm font-medium">{name}</span>
            <span className="text-muted-foreground text-xs font-normal">{detail}</span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/profile">
            <UserRound />
            Profile
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="/settings">
            <Settings />
            Settings
          </a>
        </DropdownMenuItem>
        {authed && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void signOut()}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
