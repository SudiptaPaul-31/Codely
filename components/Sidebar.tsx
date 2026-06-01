"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
	Code2,
	Home,
	FileCode2,
	ChevronLeft,
	ChevronRight,
	Menu,
	X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
	{ label: "Home", href: "/", icon: Home },
	{ label: "Snippets", href: "/snippets", icon: FileCode2 },
];

export function Sidebar() {
	const pathname = usePathname();
	const [collapsed, setCollapsed] = useState(false);
	const [mobileOpen, setMobileOpen] = useState(false);

	return (
		<>
			{/* Mobile overlay */}
			{mobileOpen && (
				<div
					className="fixed inset-0 z-40 bg-black/60 md:hidden"
					onClick={() => setMobileOpen(false)}
					aria-hidden="true"
				/>
			)}

			{/* Mobile hamburger trigger */}
			<button
				className="fixed top-4 left-4 z-50 md:hidden p-2 rounded-lg bg-gray-900 border border-white/10 text-gray-300 hover:text-purple-400 transition-colors"
				onClick={() => setMobileOpen(!mobileOpen)}
				aria-label="Toggle sidebar">
				{mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
			</button>

			{/* Sidebar panel */}
			<aside
				className={cn(
					// Base styles
					"flex flex-col bg-gray-950 border-r border-white/10 h-screen sticky top-0 z-40",
					// Smooth width transition
					"transition-all duration-300 ease-in-out",
					// Desktop: collapsible width
					collapsed ? "w-16" : "w-56",
					// Mobile: fixed overlay, slide in/out
					"max-md:fixed max-md:top-0 max-md:left-0 max-md:h-full max-md:w-64 max-md:z-50",
					mobileOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full",
				)}>
				{/* Logo */}
				<div className="flex items-center gap-2 px-4 py-5 border-b border-white/10 min-h-[64px]">
					<Code2 className="w-6 h-6 text-purple-400 shrink-0" />
					{(!collapsed || mobileOpen) && (
						<span className="text-lg font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent whitespace-nowrap overflow-hidden">
							Codely
						</span>
					)}
				</div>

				{/* Nav items */}
				<nav className="flex-1 px-2 py-4 flex flex-col gap-1">
					{NAV_ITEMS.map(({ label, href, icon: Icon }) => {
						const active = pathname === href;
						return (
							<Link
								key={href}
								href={href}
								onClick={() => setMobileOpen(false)}
								className={cn(
									"flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
									active
										? "bg-purple-500/15 text-purple-400"
										: "text-gray-400 hover:bg-white/5 hover:text-gray-200",
								)}
								title={collapsed && !mobileOpen ? label : undefined}>
								<Icon className="w-5 h-5 shrink-0" />
								{(!collapsed || mobileOpen) && (
									<span className="whitespace-nowrap overflow-hidden">{label}</span>
								)}
								{active && (!collapsed || mobileOpen) && (
									<span className="ml-auto w-1.5 h-1.5 rounded-full bg-purple-400" />
								)}
							</Link>
						);
					})}
				</nav>

				{/* Collapse toggle (desktop only) */}
				<button
					className="hidden md:flex items-center justify-center p-3 border-t border-white/10 text-gray-500 hover:text-purple-400 transition-colors"
					onClick={() => setCollapsed(!collapsed)}
					aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
					{collapsed ? (
						<ChevronRight className="w-4 h-4" />
					) : (
						<ChevronLeft className="w-4 h-4" />
					)}
				</button>
			</aside>
		</>
	);
}
