"use client";

import { useParams } from "next/navigation";
import { MotionStudio } from "@/motion-studio/components/studio";

export default function MotionProjectPage() {
	const { id } = useParams<{ id: string }>();
	return <MotionStudio projectId={id} />;
}
