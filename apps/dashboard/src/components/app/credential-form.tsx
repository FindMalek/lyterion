"use client";

import type { AppRouterClient } from "@lyterion/orpc";
import {
	Alert,
	AlertDescription,
	Button,
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
	Icons,
	Input,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	Textarea,
} from "@lyterion/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { type ConnectionRow, connectionState } from "@/lib/status";
import { orpc } from "@/shared/api/orpc";
import { StatusBadge } from "./status-dot";

export type CredentialFormSpec = Awaited<
	ReturnType<AppRouterClient["connections"]["forms"]>
>[number];

type Result =
	| { kind: "row"; row: ConnectionRow }
	| { kind: "error"; message: string }
	| null;

function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

// One service's credentials in a side sheet: test before saving, and secrets are never sent back to the browser.
export function CredentialForm({
	form,
	row,
	onClose,
}: {
	form: CredentialFormSpec;
	row?: ConnectionRow;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const [values, setValues] = useState<Record<string, string>>(() =>
		Object.fromEntries(form.fields.map((f) => [f.name, f.value])),
	);
	const [result, setResult] = useState<Result>(null);

	const refresh = () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: orpc.connections.list.key() }),
			queryClient.invalidateQueries({ queryKey: orpc.connections.forms.key() }),
		]);
	const onError = (error: unknown) =>
		setResult({ kind: "error", message: errorMessage(error) });

	const test = useMutation({
		...orpc.connections.test.mutationOptions(),
		onSuccess: (r) => setResult({ kind: "row", row: r }),
		onError,
	});
	const save = useMutation({
		...orpc.connections.save.mutationOptions(),
		onSuccess: async (r) => {
			await refresh();
			const state = connectionState(r);
			if (state.status === "error") return setResult({ kind: "row", row: r });
			toast.success(`${row?.label ?? form.kind} saved`, {
				description: r.detail ?? state.label,
			});
			onClose();
		},
		onError,
	});
	const clear = useMutation({
		...orpc.connections.clear.mutationOptions(),
		onSuccess: async () => {
			await refresh();
			toast(`${row?.label ?? form.kind} removed`);
			onClose();
		},
		onError,
	});
	const busy = test.isPending || save.isPending || clear.isPending;
	const payload = { kind: form.kind, values };
	const shown = result?.kind === "row" ? connectionState(result.row) : null;

	return (
		<SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
			<SheetHeader className="border-b">
				<SheetTitle className="flex items-center gap-2">
					{row?.label ?? form.kind}
					{row && <StatusBadge {...connectionState(row)} />}
				</SheetTitle>
				<SheetDescription>
					{form.help}
					{form.source === "env" &&
						" Currently set by the deploy environment; saving here takes over."}
				</SheetDescription>
			</SheetHeader>
			<form
				id={`credential-${form.kind}`}
				className="flex-1 overflow-y-auto p-4"
				onSubmit={(e) => {
					e.preventDefault();
					save.mutate(payload);
				}}
			>
				<FieldGroup className="gap-4">
					{form.fields.map((field) => {
						const id = `${form.kind}-${field.name}`;
						const placeholder =
							field.secret && field.saved
								? "saved, leave blank to keep"
								: (field.placeholder ?? (field.optional ? "optional" : ""));
						const common = {
							id,
							name: field.name,
							value: values[field.name] ?? "",
							placeholder,
							autoComplete: "off",
							spellCheck: false,
						};
						return (
							<Field key={field.name}>
								<FieldLabel htmlFor={id}>
									{field.label}
									{field.optional && (
										<span className="font-normal text-muted-foreground">
											optional
										</span>
									)}
								</FieldLabel>
								{field.multiline ? (
									<Textarea
										{...common}
										rows={4}
										className="font-mono text-xs"
										onChange={(e) =>
											setValues((v) => ({ ...v, [field.name]: e.target.value }))
										}
									/>
								) : (
									<Input
										{...common}
										type={field.secret ? "password" : "text"}
										className="font-mono text-xs"
										onChange={(e) =>
											setValues((v) => ({ ...v, [field.name]: e.target.value }))
										}
									/>
								)}
								{field.secret && field.saved && (
									<FieldDescription>
										A value is saved and stays hidden.
									</FieldDescription>
								)}
							</Field>
						);
					})}
				</FieldGroup>
				{result && (
					<Alert
						variant={
							result.kind === "error" || shown?.status === "error"
								? "destructive"
								: "default"
						}
						className="mt-4"
					>
						{result.kind === "error" || shown?.status === "error" ? (
							<Icons.alertCircle />
						) : (
							<Icons.circleCheck className="text-success" />
						)}
						<AlertDescription className="break-words font-mono">
							{result.kind === "error"
								? result.message
								: `${shown?.label}${result.row.latencyMs != null ? ` · ${result.row.latencyMs}ms` : ""}${result.row.detail ? ` · ${result.row.detail}` : ""}`}
						</AlertDescription>
					</Alert>
				)}
			</form>
			<SheetFooter className="flex-row items-center border-t">
				{form.source === "dashboard" && (
					<ConfirmAction
						trigger={
							<Button size="sm" variant="ghost" disabled={busy}>
								<Icons.trash />
								Remove
							</Button>
						}
						title={`Remove ${row?.label ?? form.kind}?`}
						description="The saved credentials are deleted. If the deploy environment sets this service, that value takes over again."
						confirm="Remove"
						destructive
						onConfirm={() => clear.mutate({ kind: form.kind })}
					/>
				)}
				<div className="ml-auto flex gap-2">
					<Button
						type="button"
						size="sm"
						variant="outline"
						isLoading={test.isPending}
						disabled={busy}
						onClick={() => test.mutate(payload)}
					>
						Test
					</Button>
					<Button
						type="submit"
						form={`credential-${form.kind}`}
						size="sm"
						isLoading={save.isPending}
						disabled={busy}
					>
						Save
					</Button>
				</div>
			</SheetFooter>
		</SheetContent>
	);
}
