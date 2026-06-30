"use client";

import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import { CartesianGrid, LabelList, Line, LineChart, XAxis } from "recharts";
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
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { Delta, DeltaIcon, DeltaValue } from "@/components/delta";
import { EmptyState } from "@/components/empty-state";

export type LineChartDatum = {
	label: string;
	value: number;
};

interface FirstReplyTimeChartProps extends ComponentProps<typeof Card> {
	title?: string;
	description?: string;
	data?: LineChartDatum[];
	config?: ChartConfig;
	dataKey?: string;
	valueSuffix?: string;
	lowerIsBetter?: boolean;
}

export function FirstReplyTimeChart({
	className,
	title = "Trend",
	description = "Performance metrics over time",
	data = [],
	config = {},
	dataKey = "value",
	valueSuffix = "",
	lowerIsBetter = false,
	...props
}: FirstReplyTimeChartProps) {
	const hasData = data && data.length > 0;

	const improvementPct = (() => {
		if (!hasData || data.length === 0) return 0;
		const first = data[0]?.value ?? 0;
		const last = data.at(-1)?.value ?? first;
		if (first === 0) return 0;
		const pct = ((last - first) / first) * 100;
		return lowerIsBetter ? -pct : pct;
	})();

	const chartConfig = {
		[dataKey]: {
			label: "Value",
			color: "var(--chart-2)",
		},
		...config,
	} satisfies ChartConfig;

	return (
		<Card
			className={cn("shadow-none md:col-span-2 dark:ring-0", className)}
			{...props}
		>
			<CardHeader className="space-y-1">
				<div className="flex flex-wrap items-center gap-2">
					<CardTitle>{title}</CardTitle>
					{hasData && (
						<Delta value={improvementPct} variant="badge">
							<DeltaIcon variant="trend" />
							<DeltaValue />
						</Delta>
					)}
				</div>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent className="min-h-[200px] flex flex-col justify-center">
				{hasData ? (
					<ChartContainer className="aspect-video w-full" config={chartConfig}>
						<LineChart
							accessibilityLayer
							data={data}
							margin={{ top: 24, left: 20, right: 12, bottom: 8 }}
						>
							<CartesianGrid className="stroke-border" vertical={false} />
							<XAxis
								axisLine={false}
								dataKey="label"
								interval={0}
								tickFormatter={(value) => String(value).slice(0, 3)}
								tickLine={false}
								tickMargin={8}
							/>
							<ChartTooltip
								content={<ChartTooltipContent indicator="line" />}
								cursor={false}
							/>
							<Line
								activeDot={{ r: 6 }}
								dataKey={dataKey}
								dot={{ fill: `var(--color-${dataKey})` }}
								stroke={`var(--color-${dataKey})`}
								strokeWidth={2}
								type="natural"
							>
								<LabelList
									className="fill-foreground"
									dataKey={dataKey}
									fontSize={12}
									formatter={(label) => {
										const n = Number(label);
										return Number.isFinite(n)
											? `${n.toFixed(1)}${valueSuffix}`
											: String(label ?? "");
									}}
									offset={12}
									position="top"
								/>
							</Line>
						</LineChart>
					</ChartContainer>
				) : (
					<EmptyState
						title="No trend data available"
						description="No elements recorded yet"
						className="border-none py-10"
					/>
				)}
			</CardContent>
		</Card>
	);
}
