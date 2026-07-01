"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
	title?: string;
	description?: string;
	onRetry?: () => void;
	className?: string;
}

/** First-class error state for async surfaces (UX baseline, FR-49). */
export function ErrorState({
	title = "Something went wrong",
	description = "An unexpected error occurred. Please try again.",
	onRetry,
	className,
}: ErrorStateProps) {
	return (
		<div
			role="alert"
			className={cn(
				"flex flex-col items-center justify-center gap-3.5 rounded-xl bg-card p-8 text-center border-none shadow-none dark:ring-0",
				className
			)}
		>
			<div className="bg-destructive/10 text-destructive flex size-10 items-center justify-center rounded-full [&_svg]:size-5">
				<AlertTriangle aria-hidden="true" />
			</div>
			<div className="space-y-1">
				<p className="text-xs font-semibold text-foreground">{title}</p>
				<p className="text-muted-foreground mx-auto max-w-xs text-[11px] leading-normal">
					{description}
				</p>
			</div>
			{onRetry ? (
				<Button variant="outline" size="sm" onClick={onRetry} className="text-xs mt-1.5 h-8 px-3">
					Try again
				</Button>
			) : null}
		</div>
	);
}
