import { redirect } from "next/navigation";

import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { serverClient } from "@/shared/api/orpc-server";
import { getServerSession } from "@/shared/api/session.server";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
	const [status, session] = await Promise.all([
		serverClient.onboarding.status(),
		getServerSession(),
	]);
	if (status.hasOwner) redirect(session?.user ? "/" : "/login");
	return <OnboardingFlow status={status} />;
}
