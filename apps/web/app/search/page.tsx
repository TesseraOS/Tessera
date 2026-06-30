import { SearchView } from '@/components/search/search-view';

export const metadata = { title: 'Search' };

export default function SearchPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="text-muted-foreground text-sm">
          Global search across code, memory, and the knowledge graph — every result shows its
          provenance.
        </p>
      </header>
      <SearchView />
    </div>
  );
}
