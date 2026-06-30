"use client";

import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { IconPlaceholder } from "@/components/icon-placeholder";
import { EmptyState } from "@/components/empty-state";

export type ActivityItem = {
	title: string;
	time: string;
	iconName?: string;
};

interface SupportActivityProps extends ComponentProps<typeof Card> {
	title?: string;
	description?: string;
	items?: ActivityItem[];
}

export function SupportActivity({
	className,
	title = "Workspace activity",
	description = "Operational signals",
	items = [],
	...props
}: SupportActivityProps) {
	const hasItems = items && items.length > 0;

	return (
		<Card className={cn("gap-0 shadow-none dark:ring-0", className)} {...props}>
			<CardHeader className="border-b">
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent className={cn("px-0", !hasItems && "p-6")}>
				{hasItems ? (
					<>
						<ul className="flex flex-col divide-y divide-border">
							{items.map((item, i) => (
								<li className="flex h-18 items-center gap-3 px-3" key={`${item.title}-${i}`}>
									<span
										aria-hidden="true"
										className="flex size-10 shrink-0 items-center justify-center [&_svg]:size-4"
									>
										<IconPlaceholder
											hugeicons={item.iconName || "Activity"}
											lucide="ActivityIcon"
											phosphor="ActivityIcon"
											remixicon="RiActivityLine"
											tabler="IconActivity"
										/>
									</span>
									<div className="min-w-0 flex-1 space-y-1">
										<p className="line-clamp-2 text-pretty text-foreground text-xs leading-snug">
											{item.title}
										</p>
										<p className="text-muted-foreground text-xs tabular-nums">
											{item.time}
										</p>
									</div>
								</li>
							))}
						</ul>
						<div className="flex items-center justify-center border-t py-3">
							<Button asChild size="sm" variant="ghost">
								<a href="/#">
									View All
									<IconPlaceholder
										aria-hidden="true"
										data-icon="inline-end"
										hugeicons="ArrowRight02Icon"
										lucide="ArrowRightIcon"
										phosphor="ArrowRightIcon"
										remixicon="RiArrowRightLine"
										tabler="IconArrowRight"
									/>
								</a>
							</Button>
						</div>
					</>
				) : (
					<EmptyState
						title="No activity signals"
						description="Connect a source or compile a context package to trigger activity signals"
						className="border-none py-10"
					/>
				)}
			</CardContent>
		</Card>
	);
}
