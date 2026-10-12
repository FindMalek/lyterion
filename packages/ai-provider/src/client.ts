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

const groqClients = new Map<string, ReturnType<typeof createGroq>>();

// The key comes from the dashboard credentials when given (D-039), else the env var.
function getGroqClient(apiKey = env.LYTERION_GROQ_API_KEY ?? "") {
	let client = groqClients.get(apiKey);
	if (!client) {
		client = createGroq({ apiKey });
		groqClients.set(apiKey, client);
	}
	return client;
}

export function getModelId(task: AITask): string {
	return TASK_MODELS[task];
}

export function getAIModel(task: AITask, apiKey?: string): LanguageModel {
	switch (getTaskProvider(task)) {
		case AI_PROVIDER.groq:
			return getGroqClient(apiKey)(getModelId(task));
	}
}
