import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '@/components/empty-state';

describe('EmptyState', () => {
  it('renders the title, description, and action', () => {
    render(
      <EmptyState
        title="No activity yet"
        description="Connect a source to begin"
        action={<button type="button">Add source</button>}
      />,
    );

    expect(screen.getByText('No activity yet')).toBeInTheDocument();
    expect(screen.getByText('Connect a source to begin')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add source' })).toBeInTheDocument();
  });
});
