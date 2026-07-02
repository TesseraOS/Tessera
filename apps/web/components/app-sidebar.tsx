'use client';

import { usePathname } from 'next/navigation';
import { LogoIcon } from '@/components/logo';
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
import { NewMemoryButton } from '@/components/new-memory-button';
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
            <LogoIcon className="text-foreground size-5" />
            <span className="font-semibold tracking-tight">Tessera</span>
          </a>
        </SidebarMenuButton>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="pb-1">
          <SidebarMenu>
            <SidebarMenuItem>
              <NewMemoryButton />
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
