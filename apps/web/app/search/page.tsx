import { SearchView } from "@/components/search/search-view";

export const metadata = { title: "Search" };

export default function SearchPage() {
	return (
		<div className="mx-auto max-w-4xl w-full space-y-4">
			<SearchView />
		</div>
	);
}
