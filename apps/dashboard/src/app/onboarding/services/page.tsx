import { redirect } from "next/navigation";

import { ServicesStep } from "@/components/onboarding/services-step";
import { getServerSession } from "@/shared/api/session.server";

export const dynamic = "force-dynamic";

export default async function OnboardingServicesPage() {
	const session = await getServerSession();
	if (!session?.user) redirect("/login");
	return <ServicesStep />;
}
