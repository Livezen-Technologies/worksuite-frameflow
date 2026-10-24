import { BrandKitHost } from "@/brand/components/brand-kit-host";
import { ThemeProvider } from "next-themes";
import { NativeThemeSync } from "@/components/native-theme-sync";
import { UserFontsLoader } from "@/fonts/components/user-fonts-loader";
import Script from "next/script";
import "./globals.css";
import { Toaster } from "../components/ui/sonner";
import { ProjectFolderHost } from "@/project-folder/components/project-folder-host";
import { WindowHost } from "@/windows/components/window-host";
import { RecorderHandoffHost } from "@/recorder/components/recorder-handoff-host";
import { RecordingCommandHost } from "@/recording/components/recording-command-host";
import { RenderCacheHost } from "@/render-cache/components/render-cache-host";
import { ProxyHost } from "@/proxy/components/proxy-host";
import { AutomationHost } from "@/automation/components/automation-host";
import { LocaleSync } from "@/i18n/components/locale-sync";
import { InputMethodHost } from "@/input-method/components/input-method-host";
import { ChangelogNotification } from "@/changelog/components/changelog-notification";
import { TooltipProvider } from "../components/ui/tooltip";
import { baseMetaData } from "./metadata";
import { BotIdClient } from "botid/client";
import { webEnv } from "@/env/web";
import { Inter } from "next/font/google";

const siteFont = Inter({ subsets: ["latin"] });

export const metadata = baseMetaData;

const protectedRoutes = [
	{
		path: "/none",
		method: "GET",
	},
];

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<BotIdClient protect={protectedRoutes} />
				{process.env.NODE_ENV === "development" && (
					<>
						<Script
							src="//unpkg.com/react-scan/dist/auto.global.js"
							crossOrigin="anonymous"
							strategy="beforeInteractive"
						/>
					</>
				)}
			</head>
			<body
				className={`${siteFont.className} font-sans antialiased`}
				style={{
					// Sinhala and Tamil interface text falls through Inter to the bundled Noto fonts.
					fontFamily: `${siteFont.style.fontFamily}, "Noto Sans Sinhala", "Noto Sans Tamil", sans-serif`,
				}}
			>
				<ThemeProvider
					attribute="class"
					defaultTheme="dark"
					disableTransitionOnChange={true}
				>
					<TooltipProvider>
						<Toaster />
						<InputMethodHost />
						<LocaleSync />
						<NativeThemeSync />
						<UserFontsLoader />
						<ProjectFolderHost />
						<AutomationHost />
						<BrandKitHost />
						<ProxyHost />
						<RenderCacheHost />
						<RecordingCommandHost />
						<RecorderHandoffHost />
						<WindowHost />
						<Script
							src="https://cdn.databuddy.cc/databuddy.js"
							strategy="afterInteractive"
							async
							data-client-id="UP-Wcoy5arxFeK7oyjMMZ"
							data-disabled={webEnv.NODE_ENV === "development"}
							data-track-attributes={false}
							data-track-errors={true}
							data-track-outgoing-links={false}
							data-track-web-vitals={false}
							data-track-sessions={false}
						/>
						{children}
					</TooltipProvider>
				</ThemeProvider>
			</body>
		</html>
	);
}
