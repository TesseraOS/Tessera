'use client';

import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

/** Small client island demonstrating the toast (sonner) primitive from a server page. */
export function ToastDemo() {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() =>
        toast.success('Connected', {
          description: 'This is how async outcomes are surfaced.',
        })
      }
    >
      Show a toast
    </Button>
  );
}
