import { EmptyState } from "@/components/empty-state";
import { IconPlaceholder } from "@/components/icon-placeholder";

/** Placeholder surface for routes a later feature fills in (keeps navigation real). */
export function ComingSoon({ title, description }: { title: string; description?: string }) {
	return (
		<div className="flex flex-1 flex-col items-center justify-center w-full py-12 md:py-20 select-none">
			<EmptyState
				title={`${title} is coming soon`}
				description={description ?? "This surface arrives in a later release."}
				className="w-full max-w-md bg-sidebar border-none shadow-none"
				action={
					<div className="flex items-center gap-2 mt-2 select-none opacity-40">
						<IconPlaceholder
							hugeicons="SourceCodeIcon"
							lucide="CodeIcon"
							phosphor="CodeIcon"
							remixicon="RiCodeLine"
							tabler="IconCode"
							className="size-4 animate-pulse"
						/>
						<span className="text-[10px] font-mono tracking-widest uppercase">Under Active Construction</span>
					</div>
				}
			/>
		</div>
	);
}
