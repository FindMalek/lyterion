export const AI_PROVIDER = {
	groq: "groq",
} as const;
export type AIProviderName = (typeof AI_PROVIDER)[keyof typeof AI_PROVIDER];

export type AITask = "candidatePick" | "candidatePickHard";

export const TASK_PROVIDER: Record<AITask, AIProviderName> = {
	candidatePick: AI_PROVIDER.groq,
	candidatePickHard: AI_PROVIDER.groq,
};

export const TASK_MODELS: Record<AITask, string> = {
	candidatePick: "openai/gpt-oss-20b",
	candidatePickHard: "openai/gpt-oss-120b",
};
