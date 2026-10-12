import { createGroq } from "@ai-sdk/groq";
import { env } from "@lyterion/env/server";
import type { LanguageModel } from "ai";

import {
	AI_PROVIDER,
	type AIProviderName,
	type AITask,
	TASK_MODELS,
	TASK_PROVIDER,
} from "./models";

export function getTaskProvider(task: AITask): AIProviderName {
	return TASK_PROVIDER[task];
}

export function isProviderConfigured(task: AITask): boolean {
	switch (getTaskProvider(task)) {
		case AI_PROVIDER.groq:
			return Boolean(env.LYTERION_GROQ_API_KEY);
	}
}

let groqClient: ReturnType<typeof createGroq> | undefined;

function getGroqClient() {
	groqClient ??= createGroq({ apiKey: env.LYTERION_GROQ_API_KEY });
	return groqClient;
}

export function getModelId(task: AITask): string {
	return TASK_MODELS[task];
}

export function getAIModel(task: AITask): LanguageModel {
	switch (getTaskProvider(task)) {
		case AI_PROVIDER.groq:
			return getGroqClient()(getModelId(task));
	}
}
