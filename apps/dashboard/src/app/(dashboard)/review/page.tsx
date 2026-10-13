import { ReviewQueue } from "@/components/app/review-queue";
import { PageHeader } from "@/components/shared/page-header";

export default function ReviewPage() {
	return (
		<div className="flex min-h-svh flex-col md:h-svh">
			<PageHeader
				title="Review"
				description="files that looked right but couldn't be proven: listen, then pick one or skip"
			/>
			<ReviewQueue />
		</div>
	);
}
