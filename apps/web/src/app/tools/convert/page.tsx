import { ClientOnly } from "@/tools/components/client-only";
import { VideoConverter } from "@/tools/components/video-converter";

export const metadata = { title: "Video converter" };

export default function ConvertPage() {
	return (
		<ClientOnly>
			<VideoConverter />
		</ClientOnly>
	);
}
