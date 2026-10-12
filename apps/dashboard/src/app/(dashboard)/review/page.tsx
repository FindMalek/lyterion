import { ReviewQueue } from "@/components/app/review-queue";
import { PageHeader } from "@/components/shared/page-header";

export default function ReviewPage() {
	return (
		<>
			<PageHeader
				title="Review"
				description="files that looked right but couldn't be proven"
			/>
			<ReviewQueue />
		</>
	);
}
