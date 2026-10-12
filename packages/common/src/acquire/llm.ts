import { getAIModel, withLLMRetry } from "@lyterion/ai-provider";
import { generateObject } from "ai";

import { type PickAsk, pickSchema } from "./picker";

export function groqPickAsk(apiKey: string): PickAsk {
	return (model, prompt) =>
		withLLMRetry(
			async () =>
				(
					await generateObject({
						model: getAIModel(model, apiKey),
						schema: pickSchema,
						prompt,
						temperature: 0,
					})
				).object,
			{ retries: 2, label: `pick:${model}` },
		);
}
