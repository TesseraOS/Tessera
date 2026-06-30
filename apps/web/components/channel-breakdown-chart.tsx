"use client";

import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import { LabelList, Pie, PieChart } from "recharts";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
} from "@/components/ui/chart";
import { EmptyState } from "@/components/empty-state";

export type BreakdownDatum = {
	name: string;
	value: number;
	fill: string;
};

interface ChannelBreakdownChartProps extends ComponentProps<typeof Card> {
	title?: string;
	description?: string;
	data?: BreakdownDatum[];
	config?: ChartConfig;
}

export function ChannelBreakdownChart({
	className,
	title = "Breakdown",
	description = "Distribution by category",
	data = [],
	config = {},
	...props
}: ChannelBreakdownChartProps) {
	const hasData = data && data.length > 0;

	return (
		<Card
			className={cn("flex flex-col shadow-none dark:ring-0", className)}
			{...props}
		>
			<CardHeader className="items-center space-y-1 pb-0 sm:items-start">
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent className="my-auto min-h-[240px] flex flex-col justify-center">
				{hasData ? (
					<ChartContainer
						className="mx-auto aspect-square max-h-72 w-full"
						config={config}
					>
						<PieChart accessibilityLayer>
							<Pie
								cornerRadius={8}
								data={data}
								dataKey="value"
								innerRadius={36}
								nameKey="name"
								outerRadius="88%"
								stroke="var(--card)"
								strokeWidth={4}
							>
								<LabelList
									className="fill-background font-medium"
									dataKey="value"
									fill="currentColor"
									fontWeight={500}
									formatter={(label) => {
										const n = Number(label);
										return Number.isFinite(n) ? `${n}%` : String(label ?? "");
									}}
									position="inside"
									stroke="none"
									strokeWidth={0}
								/>
							</Pie>
							<ChartLegend content={<ChartLegendContent nameKey="name" />} />
						</PieChart>
					</ChartContainer>
				) : (
					<EmptyState
						title="No breakdown data available"
						description="No elements recorded yet"
						className="border-none py-10"
					/>
				)}
			</CardContent>
		</Card>
	);
}
