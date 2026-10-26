"use client";

import { Button, Icons, Input } from "@lyterion/ui";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/shared/api/orpc";

// A YouTube link or a track name; it goes through the same sources as the Spotify tracks and lands in Navidrome.
export function WishlistForm() {
	const [input, setInput] = useState("");
	const add = useMutation({
		...orpc.wishlist.add.mutationOptions(),
		onSuccess: (meta) => {
			toast.success(`Looking for ${meta.title}`, {
				description: meta.artists.join(", ") || undefined,
			});
			setInput("");
		},
		onError: (err) => toast.error(err.message),
	});
	return (
		<form
			className="flex gap-2"
			onSubmit={(e) => {
				e.preventDefault();
				add.mutate({ input });
			}}
		>
			<Input
				value={input}
				onChange={(e) => setInput(e.target.value)}
				placeholder="youtube link or track name"
				aria-label="youtube link or track name"
			/>
			<Button
				type="submit"
				size="sm"
				isLoading={add.isPending}
				disabled={input.trim().length < 2}
			>
				{!add.isPending && <Icons.plus />}
				Add track
			</Button>
		</form>
	);
}
