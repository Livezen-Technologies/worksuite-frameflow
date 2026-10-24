import { ClientOnly } from "@/tools/components/client-only";
import { VideoDownloader } from "@/tools/components/video-downloader";

export const metadata = { title: "Video downloader" };

export default function DownloadPage() {
	return (
		<ClientOnly>
			<VideoDownloader />
		</ClientOnly>
	);
}
