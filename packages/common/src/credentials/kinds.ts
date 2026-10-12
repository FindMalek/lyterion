import { z } from "zod";

// Every service the owner can set from the dashboard; the api sends these specs, so a new kind is one entry.
export type CredentialField = {
	name: string;
	label: string;
	secret: boolean;
	optional?: boolean;
	placeholder?: string;
	multiline?: boolean;
};

const url = z.url().transform((u) => u.replace(/\/$/, ""));
const key = z.string().trim().min(1);

export const CREDENTIAL_KINDS = {
	spotify: {
		schema: z.object({ clientId: key, clientSecret: key }),
		fields: [
			{ name: "clientId", label: "client id", secret: false },
			{ name: "clientSecret", label: "client secret", secret: true },
		],
		help: "Your app at developer.spotify.com/dashboard. Changing it signs nobody out; the next sign-in uses the new app.",
	},
	navidrome: {
		schema: z.object({ url, user: key, password: key }),
		fields: [
			{
				name: "url",
				label: "url",
				secret: false,
				placeholder: "https://music.example.com",
			},
			{ name: "user", label: "user", secret: false, placeholder: "findmalek" },
			{ name: "password", label: "password", secret: true },
		],
		help: "Subsonic login for the admin user. Stars are per user, so use the account you listen with.",
	},
	slskd: {
		schema: z.object({ url, apiKey: key }),
		fields: [
			{
				name: "url",
				label: "url",
				secret: false,
				placeholder: "http://slskd:5030",
			},
			{ name: "apiKey", label: "api key", secret: true },
		],
		help: "slskd.yml → web.authentication.api_keys.",
	},
	proxy: {
		schema: z.object({
			backends: z
				.string()
				.transform((v) =>
					v
						.split(/[\s,]+/)
						.map((s) => s.trim().replace(/\/$/, ""))
						.filter(Boolean),
				)
				.pipe(z.array(z.url()).min(1)),
		}),
		fields: [
			{
				name: "backends",
				label: "backend urls",
				secret: false,
				multiline: true,
				placeholder: "one url per line",
			},
		],
		help: "Tidal/Qobuz/Deezer proxy backends (hifi-api style). Health-checked and rotated.",
	},
	deezer: {
		schema: z.object({ arl: key }),
		fields: [{ name: "arl", label: "arl cookie", secret: true }],
		help: "The arl cookie from a logged-in deezer.com session.",
	},
	acoustid: {
		schema: z.object({ apiKey: key }),
		fields: [{ name: "apiKey", label: "application key", secret: true }],
		help: "Register an application at acoustid.org/new-application.",
	},
	groq: {
		schema: z.object({ apiKey: key }),
		fields: [{ name: "apiKey", label: "api key", secret: true }],
		help: "console.groq.com → API keys.",
	},
	jev: {
		schema: z.object({ apiKey: key }),
		fields: [{ name: "apiKey", label: "api key", secret: true }],
		help: "TypeSafe AI console, early access.",
	},
	ntfy: {
		schema: z.object({
			url,
			topic: key.default("lyterion"),
			token: z.string().trim().optional(),
		}),
		fields: [
			{
				name: "url",
				label: "url",
				secret: false,
				placeholder: "https://ntfy.example.com",
			},
			{ name: "topic", label: "topic", secret: false, placeholder: "lyterion" },
			{ name: "token", label: "access token", secret: true, optional: true },
		],
		help: "Self-hosted ntfy. The token needs write access to the topic.",
	},
} as const satisfies Record<
	string,
	{ schema: z.ZodType; fields: CredentialField[]; help: string }
>;

export type CredentialKind = keyof typeof CREDENTIAL_KINDS;

export type Credentials<K extends CredentialKind> = z.output<
	(typeof CREDENTIAL_KINDS)[K]["schema"]
>;

export function isCredentialKind(value: string): value is CredentialKind {
	return value in CREDENTIAL_KINDS;
}
