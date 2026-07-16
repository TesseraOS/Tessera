'use client';

import { Users } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';
import { TesseraApiError } from '@/lib/api/client';
import { useTokens } from '@/lib/api/hooks';

interface Member {
  principalId: string;
  displayName?: string;
  roles: string[];
  activeTokens: number;
}

/** Distinct principals derived from the token list, with their roles + active token count. */
function membersFromTokens(
  tokens: { principalId: string; displayName?: string; roles: string[]; active: boolean }[],
): Member[] {
  const byPrincipal = new Map<string, Member>();
  for (const token of tokens) {
    const existing = byPrincipal.get(token.principalId) ?? {
      principalId: token.principalId,
      ...(token.displayName !== undefined ? { displayName: token.displayName } : {}),
      roles: [],
      activeTokens: 0,
    };
    existing.roles = [...new Set([...existing.roles, ...token.roles])];
    if (token.active) existing.activeTokens += 1;
    if (existing.displayName === undefined && token.displayName !== undefined) {
      existing.displayName = token.displayName;
    }
    byPrincipal.set(token.principalId, existing);
  }
  return [...byPrincipal.values()].sort((a, b) => a.principalId.localeCompare(b.principalId));
}

/**
 * Members (FR-48) — the tenant's token principals. A first-class user directory + OIDC-user listing
 * are documented seams; here "members" is derived honestly from the tokens the store holds, and
 * "role assignment" is issuing a scoped token (see the tokens panel).
 */
export function MembersCard() {
  const tokens = useTokens();

  // Hidden in zero-auth mode (the tokens panel already surfaces the token-mode note).
  if (tokens.error instanceof TesseraApiError && tokens.error.status === 409) return null;

  const members = tokens.data ? membersFromTokens(tokens.data.tokens) : [];

  return (
    <Card className="bg-sidebar border-none p-5 shadow-none dark:ring-0">
      <CardHeader className="flex-row items-center gap-2 space-y-0 p-0 pb-3">
        <Users className="text-muted-foreground size-4" aria-hidden="true" />
        <div>
          <CardTitle className="text-sm">Members</CardTitle>
          <CardDescription className="text-xs">
            Token principals in this tenant. Assign a role by issuing a token.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {members.length === 0 ? (
          <EmptyState
            title="No members yet"
            description="Members appear here once you issue their first API token."
          />
        ) : (
          <ul className="divide-border/60 divide-y">
            {members.map((member) => (
              <li key={member.principalId} className="flex items-center gap-3 py-2.5 first:pt-0">
                <Avatar className="size-8">
                  <AvatarFallback className="text-xs font-medium">
                    {(member.displayName ?? member.principalId).slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-foreground truncate text-sm font-medium">
                    {member.displayName ?? member.principalId}
                  </p>
                  <p className="text-muted-foreground truncate font-mono text-[11px]">
                    {member.principalId}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {member.roles.map((role) => (
                    <Badge key={role} variant="secondary" className="font-normal capitalize">
                      {role}
                    </Badge>
                  ))}
                  <span className="text-muted-foreground ml-1 text-[11px] tabular-nums">
                    {member.activeTokens} active
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
