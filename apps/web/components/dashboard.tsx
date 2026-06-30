import { DashboardStats } from "@/components/stats";
import { RecentConversations } from "@/components/recent-conversations";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconPlaceholder } from "@/components/icon-placeholder";

export function Dashboard() {
	return (
		<div className="space-y-4">
			{/* Top KPI Stats */}
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<DashboardStats />
			</div>

			{/* Main Grid content */}
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
				{/* Recent Activity (takes 2 cols on lg) */}
				<div className="lg:col-span-2 flex flex-col">
					<RecentConversations 
						title="Recent Compilations" 
						description="Latest context compilation traces" 
						conversations={[]} 
						className="flex-1"
					/>
				</div>

				{/* Get Started Guide (takes 1 col) */}
				<Card className="border-none bg-sidebar p-4 gap-4 shadow-none dark:ring-0">
					<CardHeader className="p-0 pb-3 border-b">
						<CardTitle>Getting Started</CardTitle>
						<CardDescription>Follow these steps to configure Tessera</CardDescription>
					</CardHeader>
					<CardContent className="p-0 pt-4 space-y-4">
						<ul className="space-y-4">
							<li className="flex gap-3">
								<div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-semibold">
									1
								</div>
								<div className="space-y-0.5">
									<h4 className="text-xs font-medium text-foreground">Connect a Source</h4>
									<p className="text-[11px] text-muted-foreground leading-normal">
										Connect filesystems or Git repositories to begin signal ingestion.
									</p>
								</div>
							</li>
							<li className="flex gap-3">
								<div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-semibold">
									2
								</div>
								<div className="space-y-0.5">
									<h4 className="text-xs font-medium text-foreground">Compile Context</h4>
									<p className="text-[11px] text-muted-foreground leading-normal">
										Run compile tasks to generate token-efficient packages for agents.
									</p>
								</div>
							</li>
							<li className="flex gap-3">
								<div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-semibold">
									3
								</div>
								<div className="space-y-0.5">
									<h4 className="text-xs font-medium text-foreground">Capture Memories</h4>
									<p className="text-[11px] text-muted-foreground leading-normal">
										Record lessons, architectural decisions, and incidents.
									</p>
								</div>
							</li>
							<li className="flex gap-3">
								<div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-semibold">
									4
								</div>
								<div className="space-y-0.5">
									<h4 className="text-xs font-medium text-foreground">Trace Effect Links</h4>
									<p className="text-[11px] text-muted-foreground leading-normal">
										Analyze ranked impact pathways across your knowledge graph.
									</p>
								</div>
							</li>
						</ul>
						<div className="pt-2">
							<Button asChild className="w-full text-xs" size="sm">
								<a href="/sources">
									<IconPlaceholder
										hugeicons="Plug01Icon"
										lucide="PlugZapIcon"
										phosphor="PlugZapIcon"
										remixicon="RiPlugZapLine"
										tabler="IconPlug"
									/>
									Connect your first source
								</a>
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
