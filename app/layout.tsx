import React from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import ClientWalletProvider from "@/components/ClientWalletProvider";
import "./globals.css";
import { Navbar } from "@/components/navbar";

const geistSans = Geist({
	subsets: ["latin"],
	variable: '--font-geist-sans',
});
const geistMono = Geist_Mono({
	subsets: ["latin"],
	variable: '--font-geist-mono',
});

export const metadata: Metadata = {
	title: "Codely",
	description:
		"Save, organize, and share your code snippets with Codely. A modern platform for developers.",
	generator: "v0.app",
	icons: {
		icon: [
			{
				url: "/icon-light-32x32.png",
				media: "(prefers-color-scheme: light)",
			},
			{ url: "/icon-dark-32x32.png", media: "(prefers-color-scheme: dark)" },
			{ url: "/icon.svg", type: "image/svg+xml" },
		],
		apple: "/apple-icon.png",
	},
};

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang='en' suppressHydrationWarning>
			<body className='font-sans antialiased'>

				<ClientWalletProvider>
					<main>{children}</main>
				</ClientWalletProvider>

				<Navbar />
				<main>{children}</main>

				<Analytics />
			</body>
		</html>
	);
}
