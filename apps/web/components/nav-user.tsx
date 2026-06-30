"use client";

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { IconPlaceholder } from "@/components/icon-placeholder";

const user = {
	name: "Shaban Haider",
	email: "shaban@efferd.com",
	avatar: "https://github.com/shabanhr.png",
};

export function NavUser() {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon" className="rounded-full size-8" aria-label="User menu">
					<Avatar className="size-8 cursor-pointer">
						<AvatarImage src={user.avatar} />
						<AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
					</Avatar>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-60">
				<DropdownMenuItem className="flex items-center justify-start gap-2">
					<DropdownMenuLabel className="flex items-center gap-3">
						<Avatar className="size-10">
							<AvatarImage src={user.avatar} />
							<AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
						</Avatar>
						<div>
							<span className="font-medium text-foreground">{user.name}</span>{" "}
							<br />
							<div className="max-w-full overflow-hidden overflow-ellipsis whitespace-nowrap text-muted-foreground text-xs">
								{user.email}
							</div>
						</div>
					</DropdownMenuLabel>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem>
						<IconPlaceholder
							hugeicons="UserMultipleIcon"
							lucide="UserIcon"
							phosphor="UserIcon"
							remixicon="RiUserLine"
							tabler="IconUser"
						/>
						Profile
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem>
						<IconPlaceholder
							hugeicons="Notification03Icon"
							lucide="BellIcon"
							phosphor="BellIcon"
							remixicon="RiNotification3Line"
							tabler="IconBell"
						/>
						Notifications
					</DropdownMenuItem>
					<DropdownMenuItem>
						<IconPlaceholder
							hugeicons="CommandIcon"
							lucide="CommandIcon"
							phosphor="CommandIcon"
							remixicon="RiCommandLine"
							tabler="IconCommand"
						/>
						Keyboard shortcuts
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem>
						<IconPlaceholder
							hugeicons="CustomerSupportIcon"
							lucide="LifeBuoyIcon"
							phosphor="LifebuoyIcon"
							remixicon="RiLifebuoyLine"
							tabler="IconHelpCircle"
						/>
						Help center
					</DropdownMenuItem>
					<DropdownMenuItem>
						<IconPlaceholder
							hugeicons="Mortarboard02Icon"
							lucide="GraduationCapIcon"
							phosphor="GraduationCapIcon"
							remixicon="RiGraduationCapLine"
							tabler="IconSchool"
						/>
						Agent training
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem>
						<IconPlaceholder
							hugeicons="CreditCardIcon"
							lucide="CreditCardIcon"
							phosphor="CreditCardIcon"
							remixicon="RiBankCardLine"
							tabler="IconCreditCard"
						/>
						Subscription
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem
						className="w-full cursor-pointer"
						variant="destructive"
					>
						<IconPlaceholder
							hugeicons="Logout02Icon"
							lucide="LogOutIcon"
							phosphor="SignOutIcon"
							remixicon="RiLogoutBoxRLine"
							tabler="IconLogout2"
						/>
						Log out
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
