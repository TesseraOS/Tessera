'use client';

import { useState, type FormEvent } from 'react';
import { Check, Copy, KeyRound, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/empty-state';
import { TesseraApiError, type CreatedToken, type CreateTokenRequest } from '@/lib/api/client';
import { useCreateToken, useRbac, useRevokeToken, useTokens } from '@/lib/api/hooks';
import { useSession } from '@/lib/auth/use-session';

const EXPIRY_OPTIONS = [
  { value: 'never', label: 'Never', days: null },
  { value: '30', label: '30 days', days: 30 },
  { value: '90', label: '90 days', days: 90 },
] as const;

function expiresAtFrom(value: string): string | undefined {
  const option = EXPIRY_OPTIONS.find((o) => o.value === value);
  if (option?.days == null) return undefined;
  return new Date(Date.now() + option.days * 24 * 60 * 60 * 1000).toISOString();
}

function formatDate(iso: string | null): string {
  return iso === null ? '—' : new Date(iso).toLocaleDateString();
}

/** API-token self-service (F-046). List · create (copy-once) · revoke, over /v1/tokens. */
export function TokensPanel() {
  const tokens = useTokens();
  const revoke = useRevokeToken();
  const [createOpen, setCreateOpen] = useState(false);

  // The store isn't wired outside token auth mode — the API answers 409. Show it honestly.
  const needsTokenMode = tokens.error instanceof TesseraApiError && tokens.error.status === 409;

  return (
    <Card className="bg-sidebar border-none p-5 shadow-none dark:ring-0">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 p-0 pb-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-sm">
            <KeyRound className="text-muted-foreground size-4" aria-hidden="true" />
            API tokens
          </CardTitle>
          <CardDescription className="text-xs">
            Scoped bearer tokens for programmatic access. The secret is shown once.
          </CardDescription>
        </div>
        {!needsTokenMode && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Create token
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {needsTokenMode ? (
          <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-xs leading-relaxed">
            API tokens are available when Tessera runs in <span className="font-mono">token</span>{' '}
            auth mode. This deployment is zero-auth (local), so there are no tokens to manage.
          </p>
        ) : tokens.isPending ? (
          <div className="space-y-2" aria-hidden="true">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : tokens.data && tokens.data.tokens.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Principal</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.data.tokens.map((token) => (
                <TableRow key={token.id}>
                  <TableCell className="max-w-[180px]">
                    <span className="text-foreground block truncate text-sm font-medium">
                      {token.displayName ?? token.principalId}
                    </span>
                    <span className="text-muted-foreground block truncate font-mono text-[11px]">
                      {token.principalId}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">{token.roles.join(', ')}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatDate(token.createdAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatDate(token.expiresAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={token.active ? 'secondary' : 'outline'} className="font-normal">
                      {token.active ? 'Active' : token.revokedAt ? 'Revoked' : 'Expired'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {token.active && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Revoke token for ${token.principalId}`}
                        disabled={revoke.isPending}
                        onClick={() =>
                          revoke.mutate(token.id, {
                            onSuccess: () => toast.success('Token revoked'),
                            onError: (error) =>
                              toast.error('Could not revoke token', {
                                description:
                                  error instanceof TesseraApiError ? error.message : undefined,
                              }),
                          })
                        }
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            title="No API tokens yet"
            description="Create a scoped token to let an agent or script call the Tessera API."
          />
        )}
      </CardContent>

      <CreateTokenDialog open={createOpen} onOpenChange={setCreateOpen} />
    </Card>
  );
}

function CreateTokenDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const rbac = useRbac();
  const { identity } = useSession();
  const create = useCreateToken();
  const [principalId, setPrincipalId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('viewer');
  const [expiry, setExpiry] = useState<string>('never');
  const [created, setCreated] = useState<CreatedToken | null>(null);
  const [copied, setCopied] = useState(false);

  // Least privilege: a caller can only grant roles it could itself exercise — offer roles whose
  // permissions are a subset of the caller's own (the API enforces this too).
  const callerPermissions = new Set(identity?.permissions ?? []);
  const grantableRoles = (rbac.data?.roles ?? []).filter((r) =>
    (rbac.data?.rolePermissions[r] ?? []).every((p) => callerPermissions.has(p)),
  );

  const reset = () => {
    setPrincipalId('');
    setDisplayName('');
    setRole('viewer');
    setExpiry('never');
    setCreated(null);
    setCopied(false);
    create.reset();
  };

  const canSubmit = principalId.trim().length > 0 && !create.isPending && grantableRoles.length > 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    const expiresAt = expiresAtFrom(expiry);
    create.mutate(
      {
        principalId: principalId.trim(),
        roles: [role] as CreateTokenRequest['roles'],
        ...(displayName.trim().length > 0 ? { displayName: displayName.trim() } : {}),
        ...(expiresAt !== undefined ? { expiresAt } : {}),
      },
      {
        onSuccess: (result) => setCreated(result),
        onError: (error) =>
          toast.error('Could not create token', {
            description: error instanceof TesseraApiError ? error.message : undefined,
          }),
      },
    );
  };

  const copySecret = async () => {
    if (created === null) return;
    await navigator.clipboard.writeText(created.secret);
    setCopied(true);
    toast.success('Secret copied to clipboard');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        {created === null ? (
          <>
            <DialogHeader>
              <DialogTitle>Create API token</DialogTitle>
              <DialogDescription>
                The token acts as the principal you name, with the chosen role.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="token-principal" className="text-xs font-medium">
                  Principal id
                </label>
                <Input
                  id="token-principal"
                  value={principalId}
                  onChange={(event) => setPrincipalId(event.target.value)}
                  placeholder="e.g. ci-bot"
                  className="font-mono text-xs"
                  maxLength={200}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="token-name" className="text-xs font-medium">
                  Label <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <Input
                  id="token-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="e.g. CI pipeline"
                  maxLength={200}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="token-role" className="text-xs font-medium">
                    Role
                  </label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger id="token-role" className="w-full capitalize">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {grantableRoles.map((r) => (
                        <SelectItem key={r} value={r} className="capitalize">
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="token-expiry" className="text-xs font-medium">
                    Expires
                  </label>
                  <Select value={expiry} onValueChange={setExpiry}>
                    <SelectTrigger id="token-expiry" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPIRY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!canSubmit}>
                  {create.isPending ? 'Creating…' : 'Create token'}
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Copy your token</DialogTitle>
              <DialogDescription className="flex items-start gap-1.5 text-amber-600 dark:text-amber-500">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                This secret is shown once and cannot be retrieved again. Store it now.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <code className="bg-muted text-foreground min-w-0 flex-1 truncate rounded-md px-3 py-2 font-mono text-xs">
                {created.secret}
              </code>
              <Button size="icon" variant="outline" aria-label="Copy secret" onClick={copySecret}>
                {copied ? (
                  <Check className="size-4" aria-hidden="true" />
                ) : (
                  <Copy className="size-4" aria-hidden="true" />
                )}
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
