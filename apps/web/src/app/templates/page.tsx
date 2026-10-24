import { ClientOnly } from "@/tools/components/client-only";
import { TemplateGallery } from "@/templates/components/template-gallery";

export const metadata = { title: "Templates" };

export default function TemplatesPage() {
	return (
		<ClientOnly>
			<TemplateGallery />
		</ClientOnly>
	);
}
