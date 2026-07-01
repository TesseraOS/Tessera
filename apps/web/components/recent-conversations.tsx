"use client";

import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { IconPlaceholder } from "@/components/icon-placeholder";

export type ConversationRow = {
	customer: string;
	subject: string;
	channel: "email" | "chat";
	waitMinutes: number;
	state: "waiting" | "open" | "snoozed";
};

interface RecentConversationsProps extends ComponentProps<typeof Card> {
	title?: string;
	description?: string;
	conversations?: ConversationRow[];
}

function formatWaitTime(minutes: number): string {
	if (minutes <= 0) {
		return "Just now";
	}
	if (minutes === 1) {
		return "1 minute";
	}
	if (minutes < 55) {
		return `${minutes} minutes`;
	}
	if (minutes < 60) {
		return "Almost an hour";
	}
	if (minutes < 75) {
		return "About an hour";
	}
	if (minutes < 120) {
		return "Over an hour";
	}
	const hours = Math.round(minutes / 60);
	return hours === 1 ? "About an hour" : `About ${hours} hours`;
}

function statusVariant(
	state: ConversationRow["state"]
): ComponentProps<typeof Badge>["variant"] {
	if (state === "waiting") {
		return "destructive";
	}
	if (state === "snoozed") {
		return "outline";
	}
	return "secondary";
}

function statusLabel(state: ConversationRow["state"]): string {
	if (state === "waiting") {
		return "In queue";
	}
	if (state === "snoozed") {
		return "Snoozed";
	}
	return "Active";
}

function channelIcon(channel: ConversationRow["channel"]) {
	if (channel === "email") {
		return (
			<IconPlaceholder
				className="size-3.5 shrink-0"
				hugeicons="MailSend01Icon"
				lucide="MailIcon"
				phosphor="EnvelopeIcon"
				remixicon="RiMailLine"
				tabler="IconMail"
			/>
		);
	}
	return (
		<IconPlaceholder
			className="size-3.5 shrink-0"
			hugeicons="Chat01Icon"
			lucide="MessageCircleIcon"
			phosphor="ChatIcon"
			remixicon="RiChat1Line"
			tabler="IconMessageCircle"
		/>
	);
}

export function RecentConversations({
	className,
	title = "Recent activity",
	description = "Latest processed interactions",
	conversations = [],
	...props
}: RecentConversationsProps) {
	const hasConversations = conversations && conversations.length > 0;

	return (
		<Card
			className={cn("gap-0 border-none bg-sidebar p-4 shadow-none dark:ring-0", className)}
			{...props}
		>
			<CardHeader className="p-0 pb-3">
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent className="p-0 pt-4 flex flex-col justify-center flex-1">
				{hasConversations ? (
					<>
						<Table>
							<TableHeader>
								<TableRow className="hover:bg-transparent">
									<TableHead className="pl-6">Customer</TableHead>
									<TableHead className="hidden sm:table-cell">Topic</TableHead>
									<TableHead>Channel</TableHead>
									<TableHead className="text-right">Wait</TableHead>
									<TableHead className="pr-6 text-right">Status</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{conversations.map((r, i) => {
									return (
										<TableRow
											className="h-14 hover:bg-transparent"
											key={`${r.customer}-${r.subject}-${i}`}
										>
											<TableCell className="max-w-36 truncate pl-6 font-medium">
												{r.customer}
											</TableCell>
											<TableCell className="hidden max-w-32 sm:table-cell">
												<span className="line-clamp-1 text-muted-foreground text-sm">
													{r.subject}
												</span>
											</TableCell>
											<TableCell>
												<span className="inline-flex items-center gap-2 font-medium text-sm capitalize">
													{channelIcon(r.channel)}
													{r.channel}
												</span>
											</TableCell>
											<TableCell className="text-right text-muted-foreground text-sm">
												{formatWaitTime(r.waitMinutes)}
											</TableCell>
											<TableCell className="pr-6 text-right">
												<Badge variant={statusVariant(r.state)}>
													{statusLabel(r.state)}
												</Badge>
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
						<div className="flex justify-center border-t py-3">
							<Button asChild size="sm" variant="ghost">
								<a href="#/inbox">
									View all items
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
					<div className="flex flex-col items-center text-center py-4 flex-1 justify-center">
						<div className="bg-muted/50 text-muted-foreground flex size-10 items-center justify-center rounded-full mb-3">
							<IconPlaceholder
								hugeicons="FileAttachmentIcon"
								lucide="FolderGit2Icon"
								phosphor="FolderOpenIcon"
								remixicon="RiFolderGitLine"
								tabler="IconFolder"
								className="size-5"
							/>
						</div>
						<h4 className="text-xs font-semibold text-foreground mb-1">
							No context packages compiled yet
						</h4>
						<p className="text-[11px] text-muted-foreground max-w-xs mx-auto mb-5 leading-normal">
							Compile a context package to bundle source files, knowledge graph signals, and memories for your agent.
						</p>

						{/* Interactive Blueprint Wireframe */}
						<div className="w-full max-w-sm rounded-lg border border-dashed border-muted p-3 space-y-2 select-none bg-muted/10 mb-5">
							<div className="flex items-center justify-between text-[10px] text-muted-foreground pb-1.5 border-b border-muted font-mono">
								<span>package_manifest.json</span>
								<span>0.00s compile time</span>
							</div>
							<div className="space-y-1.5 font-mono text-[10px]">
								<div className="flex items-center justify-between p-1.5 bg-muted/30 rounded border border-muted/50">
									<div className="flex items-center gap-1.5">
										<div className="size-1.5 rounded-full bg-muted-foreground" />
										<span className="text-muted-foreground">src/auth/session.ts</span>
									</div>
									<span className="text-foreground/70">0 tokens</span>
								</div>
								<div className="flex items-center justify-between p-1.5 bg-muted/30 rounded border border-muted/50">
									<div className="flex items-center gap-1.5">
										<div className="size-1.5 rounded-full bg-muted-foreground" />
										<span className="text-muted-foreground">prisma/schema.prisma</span>
									</div>
									<span className="text-foreground/70">0 tokens</span>
								</div>
							</div>
						</div>

						<div>
							<Button asChild size="sm" className="text-xs">
								<a href="/inspector">
									<IconPlaceholder
										hugeicons="CommandIcon"
										lucide="TerminalIcon"
										phosphor="TerminalIcon"
										remixicon="RiTerminalBoxLine"
										tabler="IconTerminal"
									/>
									Compile first context
								</a>
							</Button>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
