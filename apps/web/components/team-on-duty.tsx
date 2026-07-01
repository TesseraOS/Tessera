"use client";

import { cn } from "@/lib/utils";
import { type ComponentProps, useState, useEffect } from "react";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusIndicator } from "@/components/indicator";
import { IconPlaceholder } from "@/components/icon-placeholder";
import { EmptyState } from "@/components/empty-state";

export type Teammate = {
	id: string;
	name: string;
	status: "Online" | "Away";
	open: number;
	image?: string;
};

interface TeamOnDutyProps extends ComponentProps<typeof Card> {
	title?: string;
	description?: string;
	members?: Teammate[];
	onPullNext?: (id: string) => void;
}

function getInitials(name: string) {
	return name
		.split(" ")
		.map((word) => word.charAt(0).toUpperCase())
		.join("");
}

export function TeamOnDuty({
	className,
	title = "Team on duty",
	description = "Active agents in this session",
	members = [],
	onPullNext,
	...props
}: TeamOnDutyProps) {
	const [teammates, setTeammates] = useState<Teammate[]>(members);

	useEffect(() => {
		setTeammates(members);
	}, [members]);

	function pullNextConversation(id: string) {
		setTeammates((prev) =>
			prev.map((t) =>
				t.id === id ? { ...t, open: Math.max(0, t.open - 1) } : t
			)
		);
		if (onPullNext) {
			onPullNext(id);
		}
	}

	const hasMembers = teammates && teammates.length > 0;

	return (
		<Card className={cn("shadow-none dark:ring-0", className)} {...props}>
			<CardHeader className="p-0 pb-3">
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent className={cn("p-0 pt-4", !hasMembers && "p-6")}>
				{hasMembers ? (
					<ul className="flex flex-col divide-y divide-border">
						{teammates.map((t) => (
							<li
								className="flex items-center gap-2 p-3 first:pt-0 last:pb-0 sm:gap-3"
								key={t.id}
							>
								<Avatar className="size-8">
									<AvatarImage alt={t.name} src={t.image} />
									<AvatarFallback>{getInitials(t.name)}</AvatarFallback>
								</Avatar>
								<div className="min-w-0 flex-1 pr-1">
									<p className="truncate font-medium text-foreground text-sm leading-snug">
										{t.name}
									</p>
									<p className="flex items-center gap-2 text-[10px] leading-snug">
										<span className="flex shrink-0 items-center gap-1">
											<StatusIndicator
												color={t.status === "Online" ? "emerald" : "amber"}
												pulse={t.status === "Online"}
											/>
											{t.status}
										</span>
										<span className="inline-flex size-1 rounded-full bg-foreground/80" />
										<span className="tabular-nums">{t.open} assigned</span>
									</p>
								</div>
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											aria-label={`Actions for ${t.name}`}
											size="icon-xs"
											variant="ghost"
										>
											<IconPlaceholder
												hugeicons="MoreHorizontalCircle01Icon"
												lucide="EllipsisIcon"
												phosphor="DotsThreeIcon"
												remixicon="RiMoreLine"
												tabler="IconDots"
											/>
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end" className="min-w-52">
										<DropdownMenuLabel className="font-normal text-muted-foreground text-xs">
											{t.name}
										</DropdownMenuLabel>
										<DropdownMenuSeparator />
										<DropdownMenuItem className="gap-2">
											<IconPlaceholder
												className="size-4 opacity-70"
												hugeicons="MailSend01Icon"
												lucide="SendIcon"
												phosphor="PaperPlaneTiltIcon"
												remixicon="RiSendPlaneLine"
												tabler="IconSend"
											/>
											Message
										</DropdownMenuItem>
										<DropdownMenuItem
											className="gap-2"
											disabled={t.open === 0}
											onSelect={() => {
												pullNextConversation(t.id);
											}}
										>
											<IconPlaceholder
												className="size-4 opacity-70"
												hugeicons="CheckListIcon"
												lucide="ListChecksIcon"
												phosphor="ListChecksIcon"
												remixicon="RiListCheck2"
												tabler="IconChecklist"
											/>
											Pull next conversation
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</li>
						))}
					</ul>
				) : (
					<EmptyState
						title="No agents on duty"
						description="Connect an agent workspace to begin"
						className="border-none py-10"
					/>
				)}
			</CardContent>
		</Card>
	);
}
