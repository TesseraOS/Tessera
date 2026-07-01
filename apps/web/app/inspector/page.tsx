import { InspectorView } from "@/components/inspector/inspector-view";

export const metadata = { title: "Context Package Inspector" };

export default function InspectorPage() {
	return (
		<div className="mx-auto max-w-4xl w-full space-y-4">
			<InspectorView />
		</div>
	);
}
