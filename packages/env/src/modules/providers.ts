import { z } from "zod";

const commaList = z
	.string()
	.optional()
	.transform((value) =>
		(value ?? "")
			.split(",")
			.map((item) => item.trim())
			.filter(Boolean),
	);

// Every provider is optional: missing credentials disable that provider, never fail boot.
export const providersModule = {
	server: {
		LYTERION_SLSKD_URL: z.url().optional(),
		LYTERION_SLSKD_API_KEY: z.string().min(1).optional(),
		LYTERION_SLSKD_DOWNLOADS_DIR: z.string().min(1).default("/slskd/downloads"),
		LYTERION_PROXY_BACKENDS: commaList,
		LYTERION_DEEZER_ARL: z.string().min(1).optional(),
		LYTERION_STREAMRIP_CONFIG_PATH: z.string().min(1).optional(),
		LYTERION_YTDLP_COOKIES_PATH: z.string().min(1).optional(),
		LYTERION_YTDLP_POT_PROVIDER_URL: z.url().default("http://bgutil-pot:4416"),
		LYTERION_YTDLP_PATH: z.string().min(1).optional(),
		LYTERION_LIDARR_URL: z.url().optional(),
		LYTERION_LIDARR_API_KEY: z.string().min(1).optional(),
		LYTERION_BANDCAMP_COOKIE: z.string().min(1).optional(),
		LYTERION_ANNA_DIR: z.string().min(1).default("/anna"),
		LYTERION_ACOUSTID_API_KEY: z.string().min(1).optional(),
		LYTERION_MUSICBRAINZ_USER_AGENT: z
			.string()
			.min(1)
			.default("Lyterion/0.0.0 ( hi@findmalek.com )"),
	},
} as const;
