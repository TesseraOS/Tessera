"use client";

import { LogoIcon } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarHeader,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenu,
} from "@/components/ui/sidebar";
import { NavGroup } from "@/components/nav-group";
import { buildFooterNavLinks, buildNavGroups } from "@/components/app-shared";
import { LatestChange } from "@/components/latest-change";
import { IconPlaceholder } from "@/components/icon-placeholder";
import { usePathname } from "next/navigation";

export function AppSidebar() {
	const pathname = usePathname();
	const navGroups = buildNavGroups(pathname);
	const footerNavLinks = buildFooterNavLinks(pathname);

	return (
		<Sidebar collapsible="icon" variant="inset">
			<SidebarHeader className="h-14 justify-center">
				<SidebarMenuButton asChild>
					<a href="/">
						<LogoIcon />
						<span className="font-medium">Tessera</span>
					</a>
				</SidebarMenuButton>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarMenu>
						<SidebarMenuItem className="flex items-center gap-2 group-data-[collapsible=icon]:gap-0">
							<SidebarMenuButton
								className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
								tooltip="Quick Create"
							>
								<IconPlaceholder
									hugeicons="PlusSignIcon"
									lucide="PlusIcon"
									phosphor="PlusIcon"
									remixicon="RiAddLine"
									tabler="IconPlus"
								/>
								<span>New Memory</span>
							</SidebarMenuButton>
							<Button
								aria-label="Search context"
								className="size-8 group-data-[collapsible=icon]:hidden"
								size="icon"
								variant="outline"
							>
								<IconPlaceholder
									hugeicons="SearchIcon"
									lucide="SearchIcon"
									phosphor="MagnifyingGlassIcon"
									remixicon="RiSearchLine"
									tabler="IconSearch"
								/>
								<span className="sr-only">Search context</span>
							</Button>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarGroup>
				{navGroups.map((group, index) => (
					<NavGroup key={`sidebar-group-${index}`} {...group} />
				))}
			</SidebarContent>
			<SidebarFooter>
				<LatestChange />
				<SidebarMenu className="mt-2">
					{footerNavLinks.map((item) => (
						<SidebarMenuItem key={item.title}>
							<SidebarMenuButton
								asChild
								className="text-muted-foreground"
								isActive={!!item.isActive}
								size="sm"
							>
								<a href={item.path}>
									{item.icon}
									<span>{item.title}</span>
								</a>
							</SidebarMenuButton>
						</SidebarMenuItem>
					))}
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	);
}
