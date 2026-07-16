'use client';

import { Check, Minus, Timer } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ErrorState } from '@/components/error-state';
import { useRbac } from '@/lib/api/hooks';

/**
 * Governance (FR-48) — the org's access model at a glance: the RBAC roles → permissions matrix
 * (derived from the API's `/v1/rbac`, F-046 — no hand-mirrored catalog), and the audit retention
 * posture (NFR-13).
 */
export function GovernanceView() {
  const { data: rbac, isPending, isError, refetch } = useRbac();

  return (
    <div className="space-y-4">
      <Card className="bg-sidebar border-none p-4 shadow-none dark:ring-0">
        <CardHeader className="p-0 pb-3">
          <CardTitle>Roles &amp; permissions</CardTitle>
          <CardDescription>
            What each role can do. Effective permissions are a role&rsquo;s grants intersected with
            a token&rsquo;s scopes (least privilege).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 pt-2">
          {isPending ? (
            <div className="space-y-2" aria-hidden="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : isError || rbac === undefined ? (
            <ErrorState
              title="Couldn't load the access model"
              description="The RBAC catalog is served by the API."
              onRetry={() => void refetch()}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[180px]">Permission</TableHead>
                  {rbac.roles.map((role) => (
                    <TableHead key={role} className="text-center capitalize">
                      {role}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rbac.permissions.map((permission) => (
                  <TableRow key={permission}>
                    <TableCell className="text-foreground font-mono text-xs font-medium">
                      {permission}
                    </TableCell>
                    {rbac.roles.map((role) => {
                      const granted = (rbac.rolePermissions[role] ?? []).includes(permission);
                      return (
                        <TableCell key={role} className="text-center">
                          {granted ? (
                            <Check
                              className="text-foreground mx-auto size-4"
                              aria-label={`${role} has ${permission}`}
                            />
                          ) : (
                            <Minus
                              className="text-muted-foreground/40 mx-auto size-4"
                              aria-label={`${role} lacks ${permission}`}
                            />
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="bg-sidebar border-none p-4 shadow-none dark:ring-0">
        <CardHeader className="flex-row items-center gap-2 space-y-0 p-0 pb-2">
          <Timer className="text-muted-foreground size-4" aria-hidden="true" />
          <CardTitle className="text-sm">Audit retention</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground p-0 text-xs leading-relaxed">
          The audit trail is <span className="text-foreground font-medium">append-only</span> and
          scoped per tenant. Retention is enforced server-side by a configurable policy (&nbsp;
          <span className="font-mono">max age</span> and{' '}
          <span className="font-mono">max entries</span>&nbsp;) so the trail stays queryable without
          growing unbounded — supporting a SOC2/GDPR posture (NFR-13).
        </CardContent>
      </Card>
    </div>
  );
}
