"use client";

import type { AppRouterClient } from "@lyterion/orpc";
import { Button, Input, Textarea } from "@lyterion/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { connectionState } from "@/lib/status";
import { orpc } from "@/shared/api/orpc";

import { StatusLabel } from "./status-dot";

export type CredentialFormSpec = Awaited<
	ReturnType<AppRouterClient["connections"]["forms"]>
>[number];

type Result =
	| { kind: "row"; row: Parameters<typeof connectionState>[0] }
	| { kind: "error"; message: string }
	| null;

function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

export function CredentialForm({
	form,
	onClose,
}: {
	form: CredentialFormSpec;
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
		onSuccess: (row) => setResult({ kind: "row", row }),
		onError,
	});
	const save = useMutation({
		...orpc.connections.save.mutationOptions(),
		onSuccess: async (row) => {
			setResult({ kind: "row", row });
			await refresh();
		},
		onError,
	});
	const clear = useMutation({
		...orpc.connections.clear.mutationOptions(),
		onSuccess: async () => {
			await refresh();
			onClose();
		},
		onError,
	});
	const busy = test.isPending || save.isPending || clear.isPending;
	const payload = { kind: form.kind, values };

	return (
		<form
			className="flex flex-col gap-3 border-l-2 border-l-foreground/20 bg-muted/30 px-3 py-3"
			onSubmit={(e) => {
				e.preventDefault();
				save.mutate(payload);
			}}
		>
			<p className="text-muted-foreground text-xs">
				{form.help}
				{form.source === "env" &&
					" Currently set by the deploy environment; saving here takes over."}
			</p>
			<div className="grid gap-2 sm:grid-cols-[9rem_minmax(0,28rem)] sm:items-center">
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
						className: "h-7 font-mono text-xs",
					};
					return (
						<div key={field.name} className="contents">
							<label
								htmlFor={id}
								className="font-mono text-muted-foreground text-xs"
							>
								{field.label}
							</label>
							{field.multiline ? (
								<Textarea
									{...common}
									rows={3}
									className="min-h-16 font-mono text-xs"
									onChange={(e) =>
										setValues((v) => ({ ...v, [field.name]: e.target.value }))
									}
								/>
							) : (
								<Input
									{...common}
									type={field.secret ? "password" : "text"}
									onChange={(e) =>
										setValues((v) => ({ ...v, [field.name]: e.target.value }))
									}
								/>
							)}
						</div>
					);
				})}
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<Button
					type="submit"
					size="sm"
					isLoading={save.isPending}
					disabled={busy}
				>
					save
				</Button>
				<Button
					type="button"
					size="sm"
					variant="outline"
					isLoading={test.isPending}
					disabled={busy}
					onClick={() => test.mutate(payload)}
				>
					test
				</Button>
				{form.source === "dashboard" && (
					<Button
						type="button"
						size="sm"
						variant="ghost"
						disabled={busy}
						onClick={() => clear.mutate({ kind: form.kind })}
					>
						remove
					</Button>
				)}
				<Button type="button" size="sm" variant="ghost" onClick={onClose}>
					close
				</Button>
				{result?.kind === "row" && (
					<span className="flex items-center gap-2 text-xs">
						<StatusLabel {...connectionState(result.row)} />
						{result.row.detail && (
							<span className="font-mono text-muted-foreground">
								{result.row.detail}
							</span>
						)}
					</span>
				)}
				{result?.kind === "error" && (
					<span className="font-mono text-destructive text-xs">
						{result.message}
					</span>
				)}
			</div>
		</form>
	);
}
