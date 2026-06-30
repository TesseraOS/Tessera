"use client";

import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import { Bar, BarChart, Rectangle, XAxis } from "recharts";
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
import { EmptyState } from "@/components/empty-state";

export type StackedBarDatum = {
	label: string;
	[key: string]: string | number;
};

interface CsatResponsesChartProps extends ComponentProps<typeof Card> {
	title?: string;
	description?: string;
	data?: StackedBarDatum[];
	config?: ChartConfig;
	keys?: string[];
}

const BAR_RADIUS = 5;

function ColumnHoverCursor(props: React.ComponentProps<typeof Rectangle>) {
	return (
		<Rectangle
			fill="var(--muted)"
			fillOpacity={0.5}
			radius={BAR_RADIUS * 2}
			stroke="none"
			{...props}
		/>
	);
}

export function CsatResponsesChart({
	className,
	title = "Distribution",
	description = "Breakdown over time",
	data = [],
	config = {},
	keys = [],
	...props
}: CsatResponsesChartProps) {
	const hasData = data && data.length > 0;

	return (
		<Card
			className={cn("shadow-none md:col-span-2 dark:ring-0", className)}
			{...props}
		>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent className="min-h-[200px] flex flex-col justify-center">
				{hasData ? (
					<ChartContainer className="aspect-video w-full" config={config}>
						<BarChart accessibilityLayer data={data}>
							<XAxis
								axisLine={false}
								dataKey="label"
								interval={0}
								minTickGap={8}
								tickFormatter={(value) => String(value)}
								tickLine={false}
								tickMargin={10}
							/>
							<ChartTooltip
								content={<ChartTooltipContent hideLabel />}
								cursor={<ColumnHoverCursor />}
							/>
							{keys.map((key, index) => {
								const isFirst = index === 0;
								const isLast = index === keys.length - 1;
								let radius: [number, number, number, number] | number = 0;
								if (isFirst && isLast) {
									radius = [BAR_RADIUS, BAR_RADIUS, BAR_RADIUS, BAR_RADIUS];
								} else if (isFirst) {
									radius = [0, 0, BAR_RADIUS, BAR_RADIUS];
								} else if (isLast) {
									radius = [BAR_RADIUS, BAR_RADIUS, 0, 0];
								}

								return (
									<Bar
										key={key}
										barSize={8}
										dataKey={key}
										fill={`var(--color-${key})`}
										overflow="visible"
										radius={radius}
										stackId="stacked-bar"
									/>
								);
							})}
						</BarChart>
					</ChartContainer>
				) : (
					<EmptyState
						title="No comparative data available"
						description="No elements recorded yet"
						className="border-none py-10"
					/>
				)}
			</CardContent>
		</Card>
	);
}
