import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Delta, DeltaIcon, DeltaValue } from "@/components/delta";

type Stat = {
	label: string;
	value: string;
	delta?: number;
	footnote: string;
	lowerIsBetter?: boolean;
};

const stats: readonly Stat[] = [
	{
		label: "Indexed documents",
		value: "—",
		footnote: "Connect a source to begin",
	},
	{
		label: "Active memories",
		value: "—",
		footnote: "Decisions, lessons, incidents",
	},
	{
		label: "Effect-links",
		value: "—",
		footnote: "Knowledge-graph edges",
	},
	{
		label: "Connected sources",
		value: "0",
		footnote: "Filesystem & Git connectors",
	},
];

export function DashboardStats() {
	return (
		<>
			{stats.map((s) => (
				<Card 
					className="border-none bg-sidebar p-4 flex flex-col gap-4 shadow-none dark:ring-0" 
					key={s.label}
				>
					<span className="font-normal text-muted-foreground text-xs leading-none">
						{s.label}
					</span>
					<span className="font-semibold text-2xl tabular-nums leading-none">
						{s.value}
					</span>
					<div className="flex items-center gap-1.5 text-xs leading-none">
						{s.delta !== undefined ? (
							<Delta value={s.delta}>
								<DeltaIcon />
								<DeltaValue />
							</Delta>
						) : null}
						<span className="text-muted-foreground">{s.footnote}</span>
					</div>
				</Card>
			))}
		</>
	);
}
