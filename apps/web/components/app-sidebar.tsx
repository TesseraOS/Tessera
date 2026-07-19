'use client';

import { usePathname } from 'next/navigation';
import { Logo } from '@tessera/brand';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { QuickCreateMenu } from '@/components/quick-create-menu';
import { ProjectSwitcher } from '@/components/project-switcher';
import { NavGroup } from '@/components/nav-group';
import { buildFooterNavLinks, buildNavGroups } from '@/components/app-shared';

export function AppSidebar() {
  const pathname = usePathname();
  const navGroups = buildNavGroups(pathname);
  const footerNavLinks = buildFooterNavLinks(pathname);

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="h-14 justify-center">
        <SidebarMenuButton asChild>
          <a href="/">
            {/* The lockup, not a mark plus a hand-rolled word: this rendered "Tessera" in bold sans,
                where BRAND.md §4 specifies `tessera` lowercase in Instrument Serif, never bold. */}
            <Logo
              iconClassName="size-5"
              textClassName="text-lg tracking-tight"
              emberId="ember-sidebar"
            />
          </a>
        </SidebarMenuButton>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="pb-1">
          <ProjectSwitcher />
        </SidebarGroup>

        <SidebarGroup className="pb-1">
          <SidebarMenu>
            <SidebarMenuItem>
              <QuickCreateMenu />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {navGroups.map((group, index) => (
          <NavGroup key={`sidebar-group-${index}`} {...group} />
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
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
