"use client";

import { cn } from "@/lib/utils";
import { type ComponentProps, useId, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
	formatChartAxisTick,
	formatChartTooltipDate,
	parseIsoCalendarDate,
} from "@/lib/formater";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Delta, DeltaIcon, DeltaValue } from "@/components/delta";
import { EmptyState } from "@/components/empty-state";

type PeriodDays = 7 | 30 | 60;

export type VolumeDatum = {
	date: string;
	value: number;
};

interface ConversationVolumeChartProps extends ComponentProps<typeof Card> {
	title?: string;
	description?: string;
	data?: VolumeDatum[];
	config?: ChartConfig;
	dataKey?: string;
}

export function ConversationVolumeChart({
	className,
	title = "Activity volume",
	description = "Total interactions over time.",
	data = [],
	config = {},
	dataKey = "value",
	...props
}: ConversationVolumeChartProps) {
	const chartUid = useId().replace(/:/g, "");
	const idAreaGradient = `conversation-volume-area-grad-${chartUid}`;

	const [periodDays, setPeriodDays] = useState<PeriodDays>(30);

	const hasData = data && data.length > 0;

	// Reference date is the last element's date or current date
	const volumeChartReferenceDate = useMemo(() => {
		if (!hasData) return new Date();
		const lastRow = data.at(-1);
		return lastRow ? parseIsoCalendarDate(lastRow.date) : new Date();
	}, [data, hasData]);

	const chartRows = useMemo(() => {
		if (!hasData) return [];
		const startDate = new Date(volumeChartReferenceDate);
		startDate.setDate(startDate.getDate() - periodDays);
		return data.filter(
			(item) => parseIsoCalendarDate(item.date) >= startDate
		);
	}, [data, periodDays, volumeChartReferenceDate, hasData]);

	const growthPctNum = useMemo(() => {
		if (!hasData || chartRows.length === 0) return 0;
		const first = chartRows[0];
		if (!first) return 0;
		const last = chartRows.at(-1);
		if (!last) return 0;
		const a = first.value;
		const b = last.value;
		if (!a) return 0;
		return ((b - a) / a) * 100;
	}, [chartRows, hasData]);

	let xAxisMinTickGap: number | undefined;
	if (periodDays <= 7) {
		xAxisMinTickGap = undefined;
	} else if (periodDays >= 60) {
		xAxisMinTickGap = 20;
	} else {
		xAxisMinTickGap = 28;
	}

	const chartConfig = {
		[dataKey]: {
			label: "Volume",
			color: "var(--chart-2)",
		},
		...config,
	} satisfies ChartConfig;

	return (
		<Card
			className={cn(
				"shadow-none md:col-span-2 lg:col-span-3 dark:ring-0",
				className
			)}
			{...props}
		>
			<CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="min-w-0 space-y-2">
					<div className="flex flex-wrap items-center gap-2">
						<CardTitle>{title}</CardTitle>
						{hasData && (
							<Delta value={growthPctNum} variant="badge">
								<DeltaIcon variant="trend" />
								<DeltaValue />
							</Delta>
						)}
					</div>
					<CardDescription>{description}</CardDescription>
				</div>
				{hasData && (
					<Select
						onValueChange={(v) => {
							const n = Number(v);
							setPeriodDays(n as PeriodDays);
						}}
						value={String(periodDays)}
					>
						<SelectTrigger
							aria-label="Volume time range"
							className="w-full min-w-36 sm:w-fit"
							size="sm"
						>
							<SelectValue placeholder="Range" />
						</SelectTrigger>
						<SelectContent align="end">
							<SelectItem value="7">Last 7 days</SelectItem>
							<SelectItem value="30">Last 30 days</SelectItem>
							<SelectItem value="60">Last 60 days</SelectItem>
						</SelectContent>
					</Select>
				)}
			</CardHeader>
			<CardContent className="min-h-[200px] flex flex-col justify-center">
				{hasData ? (
					<ChartContainer className="aspect-22/8 w-full" config={chartConfig}>
						<AreaChart
							accessibilityLayer
							data={chartRows}
							margin={{ left: 4, right: 8, top: 8, bottom: 0 }}
						>
							<defs>
								<linearGradient id={idAreaGradient} x1="0" x2="0" y1="0" y2="1">
									<stop
										offset="0%"
										stopColor={`var(--color-${dataKey})`}
										stopOpacity={0.45}
									/>
									<stop
										offset="55%"
										stopColor={`var(--color-${dataKey})`}
										stopOpacity={0.12}
									/>
									<stop
										offset="100%"
										stopColor={`var(--color-${dataKey})`}
										stopOpacity={0}
									/>
								</linearGradient>
							</defs>
							<CartesianGrid className="stroke-border" vertical={false} />
							<XAxis
								axisLine={false}
								dataKey="date"
								interval={periodDays <= 7 ? 0 : "preserveStartEnd"}
								{...(xAxisMinTickGap !== undefined ? { minTickGap: xAxisMinTickGap } : {})}
								tickFormatter={(value) =>
									formatChartAxisTick(String(value), periodDays)
								}
								tickLine={false}
								tickMargin={8}
							/>
							<YAxis
								axisLine={false}
								tick={{ className: "tabular-nums" }}
								tickLine={false}
								tickMargin={8}
								width={36}
							/>
							<ChartTooltip
								content={
									<ChartTooltipContent
										className="min-w-34"
										indicator="line"
										labelFormatter={(_, payload) => {
											const row = payload?.[0]?.payload as VolumeDatum | undefined;
											if (!row?.date) {
												return "";
											}
											return formatChartTooltipDate(row.date, "long");
										}}
									/>
								}
								cursor={false}
							/>
							<Area
								dataKey={dataKey}
								dot={false}
								fill={`url(#${idAreaGradient})`}
								stroke={`var(--color-${dataKey})`}
								strokeWidth={2}
								type="natural"
							/>
						</AreaChart>
					</ChartContainer>
				) : (
					<EmptyState
						title="No volume data available"
						description="No elements recorded yet"
						className="border-none py-10"
					/>
				)}
			</CardContent>
		</Card>
	);
}
