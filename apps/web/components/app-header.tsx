"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { CustomSidebarTrigger } from "@/components/custom-sidebar-trigger";
import { buildFlatNavLinks } from "@/components/app-shared";
import { NavUser } from "@/components/nav-user";
import { IconPlaceholder } from "@/components/icon-placeholder";
import { ThemeToggle } from "@/components/theme-toggle";
import { useCommandMenu } from "@/lib/store/command";
import { usePathname } from "next/navigation";

export function AppHeader() {
	const pathname = usePathname();
	const navLinks = buildFlatNavLinks(pathname);
	const activeItem = navLinks.find((item) => item.isActive);
	const setOpen = useCommandMenu((state) => state.setOpen);

	return (
		<header
			className={cn(
				"sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4 md:px-6 bg-background/80 supports-[backdrop-filter]:bg-background/60 backdrop-blur"
			)}
		>
			<div className="flex items-center gap-3">
				<CustomSidebarTrigger />
				<div className="mx-1.5 h-4 w-px bg-border shrink-0" />
				<AppBreadcrumbs page={activeItem ?? null} />
			</div>
			<div className="flex items-center gap-3">
				<Button
					variant="ghost"
					size="icon-sm"
					onClick={() => setOpen(true)}
					aria-label="Open command palette"
				>
					<IconPlaceholder
						hugeicons="SearchIcon"
						lucide="SearchIcon"
						phosphor="MagnifyingGlassIcon"
						remixicon="RiSearchLine"
						tabler="IconSearch"
					/>
				</Button>
				<ThemeToggle />
				<Button size="icon-sm" variant="ghost" aria-label="Quick Actions">
					<IconPlaceholder
						hugeicons="Navigation03Icon"
						lucide="SendIcon"
						phosphor="PaperPlaneTiltIcon"
						remixicon="RiSendPlaneLine"
						tabler="IconSend"
					/>
				</Button>
				<Button aria-label="Notifications" size="icon-sm" variant="ghost">
					<IconPlaceholder
						hugeicons="Notification03Icon"
						lucide="BellIcon"
						phosphor="BellIcon"
						remixicon="RiNotification3Line"
						tabler="IconBell"
					/>
				</Button>
				<div className="h-4 w-px bg-border shrink-0 mx-1.5" />
				<NavUser />
			</div>
		</header>
	);
}
