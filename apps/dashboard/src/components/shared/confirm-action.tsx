"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@lyterion/ui";
import type * as React from "react";

type Props = {
	trigger?: React.ReactNode;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	title: string;
	description: React.ReactNode;
	confirm: string;
	destructive?: boolean;
	onConfirm: () => void;
};

/** A dialog in front of anything that stops work or deletes files, instead of a click-twice button. */
export function ConfirmAction({
	trigger,
	open,
	onOpenChange,
	title,
	description,
	confirm,
	destructive,
	onConfirm,
}: Props) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			{trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel size="sm">Cancel</AlertDialogCancel>
					<AlertDialogAction
						size="sm"
						variant={destructive ? "destructive" : "default"}
						onClick={onConfirm}
					>
						{confirm}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
