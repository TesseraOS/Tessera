'use client';

import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { downloadTextFile } from '@/lib/clipboard';
import { auditExportFilename, toCsv, toJson } from '@/lib/export/audit-csv';
import { useAuditExport } from '@/lib/api/hooks';
import type { AuditExportQuery } from '@/lib/api/types';

/**
 * Export the filtered audit trail (F-063; FR-55).
 *
 * **The server owns what a client cannot honestly assert; this owns the rest.** `GET /v1/audit/export`
 * pages the trail to completeness (a client holding 2 of 40 pages calling it "the filtered view"
 * would be *wrong about what the filtered view is*) and records an `audit.export` event (a client
 * cannot make that claim about itself, and a self-asserted one would be forgeable). Turning the rows
 * it returns into CSV or JSON is a re-formatting of bytes we now hold — no truth to disagree about —
 * so it happens here.
 */
export function AuditExport({ query }: { query: AuditExportQuery }) {
  const exportAudit = useAuditExport();

  const run = (format: 'csv' | 'json') => {
    exportAudit.mutate(query, {
      onSuccess: (result) => {
        const content = format === 'csv' ? toCsv(result.events) : toJson(result.events);
        downloadTextFile(
          content,
          auditExportFilename(format),
          format === 'csv' ? 'text/csv' : 'application/json',
        );

        if (result.truncated) {
          // A truncated export that says so is honest; a silent one is the trap. Note this is only
          // allowed to echo the hint we just deleted because here it is actually true.
          toast.warning(
            `Exported the ${result.count.toLocaleString()} most recent matching events`,
            {
              description:
                'The trail is longer than one export. Narrow the date range for the rest.',
            },
          );
        } else {
          toast.success(`Exported ${result.count.toLocaleString()} events`);
        }
      },
      onError: (error) => {
        toast.error('Could not export the audit trail', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      },
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-9 text-xs"
          disabled={exportAudit.isPending}
        >
          {exportAudit.isPending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="size-3.5" aria-hidden="true" />
          )}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => run('csv')}>Download CSV</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run('json')}>Download JSON</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
