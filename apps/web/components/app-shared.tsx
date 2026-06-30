import type { ReactNode } from "react";
import { IconPlaceholder } from "@/components/icon-placeholder";

export type SidebarNavItem = {
	title: string;
	path?: string;
	icon?: ReactNode;
	isActive?: boolean;
	subItems?: SidebarNavItem[];
};

export type SidebarNavGroup = {
	label?: string;
	items: SidebarNavItem[];
};

export function buildNavGroups(pathname: string): SidebarNavGroup[] {
	const isActive = (path?: string) => {
		if (!path) return false;
		return path === "/" ? pathname === "/" : pathname.startsWith(path);
	};

	return [
		{
			items: [
				{
					title: "Overview",
					path: "/",
					icon: (
						<IconPlaceholder
							hugeicons="DashboardSquare01Icon"
							lucide="LayoutGridIcon"
							phosphor="SquaresFourIcon"
							remixicon="RiDashboardLine"
							tabler="IconLayoutGrid"
						/>
					),
					isActive: isActive("/"),
				},
			],
		},
		{
			label: "Explore",
			items: [
				{
					title: "Search",
					path: "/search",
					icon: (
						<IconPlaceholder
							hugeicons="SearchIcon"
							lucide="SearchIcon"
							phosphor="MagnifyingGlassIcon"
							remixicon="RiSearchLine"
							tabler="IconSearch"
						/>
					),
					isActive: isActive("/search"),
				},
				{
					title: "Inspector",
					path: "/inspector",
					icon: (
						<IconPlaceholder
							hugeicons="CheckListIcon"
							lucide="ListChecksIcon"
							phosphor="ListChecksIcon"
							remixicon="RiListCheck2"
							tabler="IconChecklist"
						/>
					),
					isActive: isActive("/inspector"),
				},
				{
					title: "Knowledge graph",
					path: "/graph",
					icon: (
						<IconPlaceholder
							hugeicons="Analytics02Icon"
							lucide="BarChart3Icon"
							phosphor="ChartBarIcon"
							remixicon="RiBarChartLine"
							tabler="IconChartBar"
						/>
					),
					isActive: isActive("/graph"),
				},
				{
					title: "Memory",
					path: "/memory",
					icon: (
						<IconPlaceholder
							hugeicons="Message01Icon"
							lucide="MessageSquareTextIcon"
							phosphor="ChatIcon"
							remixicon="RiChat1Line"
							tabler="IconMessage"
						/>
					),
					isActive: isActive("/memory"),
				},
			],
		},
		{
			label: "Connect",
			items: [
				{
					title: "Sources",
					path: "/sources",
					icon: (
						<IconPlaceholder
							hugeicons="Plug01Icon"
							lucide="PlugIcon"
							phosphor="PlugIcon"
							remixicon="RiPlugLine"
							tabler="IconPlug"
						/>
					),
					isActive: isActive("/sources"),
				},
			],
		},
	];
}

export function buildFooterNavLinks(pathname: string): SidebarNavItem[] {
	const isActive = (path?: string) => {
		if (!path) return false;
		return path === "/" ? pathname === "/" : pathname.startsWith(path);
	};

	return [
		{
			title: "Settings",
			path: "/settings",
			icon: (
				<IconPlaceholder
					hugeicons="Settings01Icon"
					lucide="SettingsIcon"
					phosphor="GearIcon"
					remixicon="RiSettings3Line"
					tabler="IconSettings"
				/>
			),
			isActive: isActive("/settings"),
		},
	];
}

// Flat list for breadcrumbs
export function buildFlatNavLinks(pathname: string): SidebarNavItem[] {
	const groups = buildNavGroups(pathname);
	const footer = buildFooterNavLinks(pathname);
	return [
		...groups.flatMap((g) =>
			g.items.flatMap((item) =>
				item.subItems?.length ? [item, ...item.subItems] : [item]
			)
		),
		...footer,
	];
}
