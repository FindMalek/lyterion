#!/usr/bin/env node
// Preview and production deploys on the-keep through the Dokploy API (D-036), see docs/infra.md.
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";

const MODE = process.argv[2];
const COMMENT_MARKER = "<!-- lyterion-preview -->";
const PREVIEW_PROJECT = "lyterion-previews";
const PRODUCTION_PROJECT = "lyterion";
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 15 * 60_000;

function requireEnv(name) {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not set`);
	return value;
}

const DOKPLOY_URL = requireEnv("DOKPLOY_URL").replace(/\/$/, "");
const DOKPLOY_PUBLIC_URL = (
	process.env.DOKPLOY_PUBLIC_URL || DOKPLOY_URL
).replace(/\/$/, "");
const DOKPLOY_API_KEY = requireEnv("DOKPLOY_API_KEY");

async function dokploy(path, body) {
	const isQuery = body === undefined || path.endsWith("?");
	const url = isQuery
		? `${DOKPLOY_URL}/api/${path.replace(/\?$/, "")}`
		: `${DOKPLOY_URL}/api/${path}`;
	const res = await fetch(url, {
		method: isQuery ? "GET" : "POST",
		headers: {
			"x-api-key": DOKPLOY_API_KEY,
			"content-type": "application/json",
		},
		body: isQuery ? undefined : JSON.stringify(body),
	});
	const text = await res.text();
	if (!res.ok) throw new Error(`dokploy ${path} ${res.status}: ${text}`);
	return text ? JSON.parse(text) : null;
}

function query(path, params) {
	return dokploy(`${path}?${new URLSearchParams(params)}`);
}

async function findProject(name) {
	const projects = await dokploy("project.all");
	return projects.find((p) => p.name === name) ?? null;
}

async function ensureEnvironment(projectName) {
	let project = await findProject(projectName);
	if (!project) {
		await dokploy("project.create", {
			name: projectName,
			description: "managed by scripts/deploy/dokploy.mjs",
		});
		project = await findProject(projectName);
	}
	const environment = project?.environments?.[0];
	if (!environment) throw new Error(`no environment in project ${projectName}`);
	return { project, environment };
}

// project.all hides postgres services the api key wasn't granted, so the id lives in the api app's env (D-037).
async function storedPostgresId(environment, apiAppName) {
	const app = environment.applications?.find((a) => a.name === apiAppName);
	if (!app) return null;
	const { env } = await query("application.one", {
		applicationId: app.applicationId,
	});
	return parseEnvBlock(env).LYTERION_DB_POSTGRES_ID ?? null;
}

async function ensurePostgres(environment, name, apiAppName, seedId) {
	const knownId =
		(await storedPostgresId(environment, apiAppName)) ??
		seedId ??
		environment.postgres?.find((p) => p.name === name)?.postgresId;
	if (knownId) return query("postgres.one", { postgresId: knownId });
	const created = await dokploy("postgres.create", {
		name,
		appName: name,
		databaseName: "lyterion",
		databaseUser: "lyterion",
		databasePassword: randomBytes(18).toString("hex"),
		dockerImage: "postgres:17-alpine",
		environmentId: environment.environmentId,
	});
	const postgres =
		created?.postgresId !== undefined
			? created
			: (
					await ensureEnvironment(environment.projectName)
				).environment.postgres.find((p) => p.name === name);
	await dokploy("postgres.deploy", { postgresId: postgres.postgresId });
	return query("postgres.one", { postgresId: postgres.postgresId });
}

function postgresUrl(pg) {
	return `postgresql://${pg.databaseUser}:${pg.databasePassword}@${pg.appName}:5432/${pg.databaseName}`;
}

async function ensureApplication(environment, name) {
	const existing = environment.applications?.find((a) => a.name === name);
	if (existing) return existing;
	await dokploy("application.create", {
		name,
		appName: name,
		environmentId: environment.environmentId,
	});
	const { environment: fresh } = await ensureEnvironment(
		environment.projectName,
	);
	const app = fresh.applications.find((a) => a.name === name);
	if (!app) throw new Error(`application ${name} was not created`);
	return app;
}

async function ensureDomain(applicationId, host, port) {
	const domains = await query("domain.byApplicationId", { applicationId });
	if (domains.some((d) => d.host === host)) return;
	await dokploy("domain.create", {
		host,
		port,
		https: true,
		certificateType: "custom",
		customCertResolver: "vercel",
		middlewares: ["tailnet-only@file"],
		applicationId,
		domainType: "application",
	});
}

function envText(vars) {
	return Object.entries(vars)
		.filter(([, v]) => v !== undefined && v !== "")
		.map(([k, v]) => `${k}=${v}`)
		.join("\n");
}

// Bind mounts the app needs (the api reads review previews from staging); added once, kept on redeploys.
async function ensureMounts(applicationId, mounts = []) {
	if (mounts.length === 0) return;
	const existing = await query("mounts.listByServiceId", {
		serviceId: applicationId,
		serviceType: "application",
	});
	for (const m of mounts) {
		if (existing.some((e) => e.mountPath === m.mountPath)) continue;
		await dokploy("mounts.create", {
			type: "bind",
			hostPath: m.hostPath,
			mountPath: m.mountPath,
			serviceType: "application",
			serviceId: applicationId,
		});
	}
}

async function deployApp(environment, app) {
	const application = await ensureApplication(environment, app.name);
	const { applicationId } = application;
	await dokploy("application.saveDockerProvider", {
		applicationId,
		dockerImage: app.image,
		registryUrl: "ghcr.io",
		username: requireEnv("GHCR_USERNAME"),
		password: requireEnv("GHCR_READ_TOKEN"),
	});
	await dokploy("application.saveEnvironment", {
		applicationId,
		env: envText(app.env),
		buildArgs: null,
		buildSecrets: null,
		createEnvFile: false,
	});
	await ensureDomain(applicationId, app.host, app.port);
	await ensureMounts(applicationId, app.mounts);
	await dokploy("application.deploy", { applicationId });
	// project.all leaves appName off its application rows, and it is the swarm service name other apps dial.
	const { appName } = await query("application.one", { applicationId });
	if (!appName) throw new Error(`dokploy returned no appName for ${app.name}`);
	return {
		...app,
		applicationId,
		appName,
		projectId: environment.projectId,
	};
}

// The public api host is tailnet-only, so the dashboard's server calls the api by its swarm service name.
async function deployAll(environment, apps) {
	const deployed = [];
	for (const app of apps) {
		const api = deployed.find((d) => d.port === 3001);
		const env =
			api && app.port === 3002
				? {
						...app.env,
						LYTERION_API_INTERNAL_URL: `http://${api.appName}:3001`,
					}
				: app.env;
		deployed.push(await deployApp(environment, { ...app, env }));
	}
	return deployed;
}

async function waitForApps(deployed, onChange) {
	const started = Date.now();
	const pending = new Map(deployed.map((d) => [d.applicationId, d]));
	await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
	while (pending.size > 0) {
		for (const [id, app] of pending) {
			const { applicationStatus } = await query("application.one", {
				applicationId: id,
			});
			if (applicationStatus === "done" || applicationStatus === "error") {
				app.status = applicationStatus === "done" ? "ready" : "failed";
				pending.delete(id);
				await onChange();
			}
		}
		if (Date.now() - started > POLL_TIMEOUT_MS) {
			for (const app of pending.values()) app.status = "failed";
			await onChange();
			break;
		}
		await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
	}
	return deployed.every((d) => d.status === "ready");
}

function inspectUrl(app) {
	return `${DOKPLOY_PUBLIC_URL}/dashboard/project/${app.projectId}/services/application/${app.applicationId}`;
}

const STATUS = {
	building: "🔄 Building",
	ready: "✅ Ready",
	failed: "❌ Failed",
	deleted: "🗑 Deleted",
};

function formatUpdated(date) {
	return date
		.toLocaleString("en-US", {
			timeZone: "UTC",
			month: "short",
			day: "numeric",
			year: "numeric",
			hour: "numeric",
			minute: "2-digit",
		})
		.replace(" AM", "am")
		.replace(" PM", "pm");
}

function renderComment(rows) {
	const updated = formatUpdated(new Date());
	const lines = rows.map((row) => {
		const inspect = row.applicationId ? ` ([Inspect](${inspectUrl(row)}))` : "";
		const project = row.applicationId
			? `[${row.name}](${inspectUrl(row)})`
			: row.name;
		const preview =
			row.status === "ready" ? `[Preview](https://${row.host})` : "";
		return `| ${project} | ${STATUS[row.status]}${inspect} | ${preview} | ${updated} |`;
	});
	return [
		COMMENT_MARKER,
		"**The latest updates on your projects**. Learn more about [Lyterion previews](../blob/main/docs/infra.md#previews).",
		"",
		"| Project | Deployment | Actions | Updated (UTC) |",
		"| :--- | :----- | :------ | :------ |",
		...lines,
	].join("\n");
}

async function github(path, init = {}) {
	const res = await fetch(`https://api.github.com${path}`, {
		...init,
		headers: {
			authorization: `Bearer ${requireEnv("GITHUB_TOKEN")}`,
			accept: "application/vnd.github+json",
			"content-type": "application/json",
		},
	});
	if (!res.ok)
		throw new Error(`github ${path} ${res.status}: ${await res.text()}`);
	return res.status === 204 ? null : res.json();
}

async function upsertComment(body) {
	const repo = requireEnv("GITHUB_REPOSITORY");
	const pr = requireEnv("PR_NUMBER");
	const comments = await github(
		`/repos/${repo}/issues/${pr}/comments?per_page=100`,
	);
	const existing = comments.find((c) => c.body?.startsWith(COMMENT_MARKER));
	if (existing) {
		await github(`/repos/${repo}/issues/comments/${existing.id}`, {
			method: "PATCH",
			body: JSON.stringify({ body }),
		});
		return;
	}
	await github(`/repos/${repo}/issues/${pr}/comments`, {
		method: "POST",
		body: JSON.stringify({ body }),
	});
}

function appSpecs({
	tag,
	dashboardHost,
	apiHost,
	cookieDomain,
	databaseUrl,
	postgresId,
	sharedEnv,
}) {
	const dashboardUrl = `https://${dashboardHost}`;
	const apiUrl = `https://${apiHost}`;
	const common = {
		NEXT_PUBLIC_LYTERION_NODE_ENV: "production",
		NEXT_PUBLIC_LYTERION_API_URL: apiUrl,
		NEXT_PUBLIC_LYTERION_DASHBOARD_URL: dashboardUrl,
		NEXT_PUBLIC_LYTERION_ALLOWED_ORIGIN: dashboardUrl,
		LYTERION_DATABASE_URL: databaseUrl,
	};
	return [
		{
			name: tag.startsWith("pr-") ? `lyterion-api-${tag}` : "lyterion-api",
			image: `ghcr.io/findmalek/lyterion-api:${tag}`,
			host: apiHost,
			port: 3001,
			status: "building",
			// Review previews stream near misses kept in staging; previews have no staging, so production only.
			mounts: tag.startsWith("pr-")
				? []
				: [
						{
							hostPath:
								process.env.STAGING_HOST_PATH || "/srv/lyterion/staging",
							mountPath: "/staging",
						},
					],
			env: {
				...sharedEnv,
				...common,
				LYTERION_COOKIE_DOMAIN: cookieDomain,
				LYTERION_DB_POSTGRES_ID: postgresId,
			},
		},
		{
			name: tag.startsWith("pr-")
				? `lyterion-dashboard-${tag}`
				: "lyterion-dashboard",
			image: `ghcr.io/findmalek/lyterion-dashboard:${tag}`,
			host: dashboardHost,
			port: 3002,
			status: "building",
			env: common,
		},
	];
}

function parseEnvBlock(text) {
	return Object.fromEntries(
		(text ?? "")
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line && !line.startsWith("#") && line.includes("="))
			.map((line) => [
				line.slice(0, line.indexOf("=")),
				line.slice(line.indexOf("=") + 1),
			]),
	);
}

async function previewUp() {
	const pr = requireEnv("PR_NUMBER");
	const tag = `pr-${pr}`;
	const domain = requireEnv("PREVIEW_DOMAIN");
	const { environment } = await ensureEnvironment(PREVIEW_PROJECT);
	environment.projectName = PREVIEW_PROJECT;
	const pg = await ensurePostgres(
		environment,
		`lyterion-db-${tag}`,
		`lyterion-api-${tag}`,
	);
	const apps = appSpecs({
		tag,
		dashboardHost: `${tag}.${domain}`,
		apiHost: `${tag}-api.${domain}`,
		cookieDomain: domain,
		databaseUrl: postgresUrl(pg),
		postgresId: pg.postgresId,
		sharedEnv: parseEnvBlock(process.env.PREVIEW_APP_ENV),
	});
	await upsertComment(renderComment(apps));
	const deployed = await deployAll(environment, apps);
	const ok = await waitForApps(deployed, () =>
		upsertComment(renderComment(deployed)),
	);
	if (!ok) process.exitCode = 1;
}

async function previewDown() {
	const pr = requireEnv("PR_NUMBER");
	const tag = `pr-${pr}`;
	const project = await findProject(PREVIEW_PROJECT);
	const environment = project?.environments?.[0];
	const rows = [];
	const postgresId = environment
		? await storedPostgresId(environment, `lyterion-api-${tag}`)
		: null;
	for (const app of environment?.applications ?? []) {
		if (!app.name.endsWith(`-${tag}`)) continue;
		await dokploy("application.delete", { applicationId: app.applicationId });
		rows.push({ name: app.name, status: "deleted" });
	}
	if (postgresId) await dokploy("postgres.remove", { postgresId });
	if (rows.length > 0) await upsertComment(renderComment(rows));
}

async function production() {
	const tag = requireEnv("IMAGE_TAG");
	const { environment } = await ensureEnvironment(PRODUCTION_PROJECT);
	environment.projectName = PRODUCTION_PROJECT;
	const sharedEnv = parseEnvBlock(process.env.PRODUCTION_APP_ENV);
	const pg = await ensurePostgres(
		environment,
		"lyterion-db",
		"lyterion-api",
		process.env.PRODUCTION_POSTGRES_ID,
	);
	const apps = appSpecs({
		tag,
		dashboardHost: requireEnv("PRODUCTION_DASHBOARD_HOST"),
		apiHost: requireEnv("PRODUCTION_API_HOST"),
		cookieDomain: requireEnv("PRODUCTION_DASHBOARD_HOST"),
		databaseUrl: postgresUrl(pg),
		postgresId: pg.postgresId,
		sharedEnv,
	});
	// Task runs need the api's env too; the Trigger.dev deploy syncs this file into its prod environment (#4).
	if (process.env.TRIGGER_ENV_FILE)
		await writeFile(process.env.TRIGGER_ENV_FILE, JSON.stringify(apps[0].env), {
			mode: 0o600,
		});
	const deployed = await deployAll(environment, apps);
	const ok = await waitForApps(deployed, async () => {});
	for (const d of deployed) console.info(`${d.name}: ${d.status}`);
	if (!ok) process.exitCode = 1;
}

async function removePostgres() {
	for (const postgresId of requireEnv("POSTGRES_IDS")
		.split(/[\s,]+/)
		.filter(Boolean)) {
		await dokploy("postgres.remove", { postgresId });
		console.info(`removed postgres ${postgresId}`);
	}
}

async function commentFailed() {
	const pr = requireEnv("PR_NUMBER");
	await upsertComment(
		renderComment(
			["lyterion-api", "lyterion-dashboard"].map((name) => ({
				name: `${name}-pr-${pr}`,
				status: "failed",
			})),
		),
	);
}

// One Dokploy compose from a file in infra/the-keep, with an optional public domain, deployed and waited on.
async function deployCompose({ name, file, env, domain }) {
	const { readFile } = await import("node:fs/promises");
	const composeFile = await readFile(
		new URL(`../../infra/the-keep/${file}`, import.meta.url),
		"utf8",
	);
	const { environment } = await ensureEnvironment(PRODUCTION_PROJECT);
	let compose = environment.compose?.find((c) => c.name === name);
	if (!compose) {
		await dokploy("compose.create", {
			name,
			appName: name,
			environmentId: environment.environmentId,
			composeType: "docker-compose",
			sourceType: "raw",
			composeFile,
		});
		compose = (
			await ensureEnvironment(PRODUCTION_PROJECT)
		).environment.compose?.find((c) => c.name === name);
	}
	if (!compose) throw new Error(`${name} compose was not created`);
	const current = await query("compose.one", { composeId: compose.composeId });
	await dokploy("compose.update", {
		composeId: compose.composeId,
		sourceType: "raw",
		composeFile,
		composePath: "./docker-compose.yml",
		env: envText(
			typeof env === "function" ? env(parseEnvBlock(current.env)) : env,
		),
	});
	if (domain) {
		const domains = await query("domain.byComposeId", {
			composeId: compose.composeId,
		});
		if (!domains.some((d) => d.host === domain.host)) {
			await dokploy("domain.create", {
				host: domain.host,
				port: domain.port,
				https: true,
				certificateType: "letsencrypt",
				composeId: compose.composeId,
				serviceName: domain.serviceName,
				domainType: "compose",
			});
		}
	}
	await dokploy("compose.deploy", { composeId: compose.composeId });
	const started = Date.now();
	while (Date.now() - started < POLL_TIMEOUT_MS) {
		await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
		const { composeStatus } = await query("compose.one", {
			composeId: compose.composeId,
		});
		if (composeStatus === "done") return console.info(`${name} deployed`);
		if (composeStatus === "error")
			throw new Error(`${name} deploy failed, check Dokploy logs`);
	}
	throw new Error(`${name} deploy timed out`);
}

function ciInfra() {
	// Public on purpose so GitHub runners reach it, every request needs TURBO_TOKEN (D-037).
	return deployCompose({
		name: "lyterion-ci",
		file: "ci.compose.yml",
		env: {
			TURBO_TOKEN: requireEnv("TURBO_TOKEN"),
			GARAGE_ACCESS_KEY: requireEnv("GARAGE_ACCESS_KEY"),
			GARAGE_SECRET_KEY: requireEnv("GARAGE_SECRET_KEY"),
		},
		domain: {
			host: process.env.TURBO_PUBLIC_HOST || "turbo.findmalek.engineer",
			port: 3000,
			serviceName: "turbo-cache",
		},
	});
}

// Generated once and kept in the compose env, so a redeploy never rotates them and logs nobody out (#4).
const TRIGGER_GENERATED = [
	"SESSION_SECRET",
	"MAGIC_LINK_SECRET",
	"ENCRYPTION_KEY",
	"PROVIDER_SECRET",
	"COORDINATOR_SECRET",
	"MANAGED_WORKER_SECRET",
	"POSTGRES_PASSWORD",
	"CLICKHOUSE_PASSWORD",
];

function triggerInfra() {
	const host = process.env.TRIGGER_PUBLIC_HOST || "trigger.findmalek.engineer";
	return deployCompose({
		name: "lyterion-trigger",
		file: "trigger.compose.yml",
		env: (current) => ({
			...Object.fromEntries(
				TRIGGER_GENERATED.map((key) => [
					key,
					current[key] || randomBytes(16).toString("hex"),
				]),
			),
			TRIGGER_ORIGIN: `https://${host}`,
			TRIGGER_WHITELISTED_EMAILS: requireEnv("TRIGGER_WHITELISTED_EMAILS"),
			TRIGGER_GARAGE_ACCESS_KEY: requireEnv("TRIGGER_GARAGE_ACCESS_KEY"),
			TRIGGER_GARAGE_SECRET_KEY: requireEnv("TRIGGER_GARAGE_SECRET_KEY"),
			GHCR_USERNAME: requireEnv("GHCR_USERNAME"),
			GHCR_READ_TOKEN: requireEnv("GHCR_READ_TOKEN"),
		}),
		// Public like the turbo cache: GitHub runners deploy tasks through it, and every API call needs a token.
		domain: { host, port: 3000, serviceName: "webapp" },
	});
}

// slskd and ntfy (#7). With a Proton key, slskd goes behind gluetun (D-030); without, on the home connection (D-045).
async function servicesInfra() {
	const { readFile } = await import("node:fs/promises");
	const script = await readFile(
		new URL("../../infra/the-keep/slskd-config.sh", import.meta.url),
	);
	const suffix = randomBytes(3).toString("hex");
	return deployCompose({
		name: "lyterion-services",
		file: process.env.PROTON_WIREGUARD_PRIVATE_KEY
			? "services-vpn.compose.yml"
			: "services.compose.yml",
		env: (current) => ({
			PROTON_WIREGUARD_PRIVATE_KEY: process.env.PROTON_WIREGUARD_PRIVATE_KEY,
			PROTON_SERVER_COUNTRIES:
				process.env.PROTON_SERVER_COUNTRIES || current.PROTON_SERVER_COUNTRIES,
			SLSK_USERNAME:
				process.env.SLSK_USERNAME ||
				current.SLSK_USERNAME ||
				`lyterion-${suffix}`,
			SLSK_PASSWORD:
				process.env.SLSK_PASSWORD ||
				current.SLSK_PASSWORD ||
				randomBytes(16).toString("hex"),
			SLSKD_WEB_PASSWORD:
				current.SLSKD_WEB_PASSWORD || randomBytes(16).toString("hex"),
			SLSKD_API_KEY: current.SLSKD_API_KEY || randomBytes(24).toString("hex"),
			SLSKD_CONFIG_SCRIPT: script.toString("base64"),
			NTFY_BASE_URL: `https://${process.env.NTFY_PUBLIC_HOST || "ntfy.findmalek.engineer"}`,
		}),
		domain: {
			host: process.env.NTFY_PUBLIC_HOST || "ntfy.findmalek.engineer",
			port: 80,
			serviceName: "ntfy",
		},
	});
}

const MODES = {
	"preview-up": previewUp,
	"preview-down": previewDown,
	production,
	"comment-failed": commentFailed,
	"ci-infra": ciInfra,
	"trigger-infra": triggerInfra,
	"services-infra": servicesInfra,
	"remove-postgres": removePostgres,
};

const run = MODES[MODE];
if (!run) {
	console.error(
		`unknown mode "${MODE}", expected ${Object.keys(MODES).join(" | ")}`,
	);
	process.exit(1);
}
await run();
