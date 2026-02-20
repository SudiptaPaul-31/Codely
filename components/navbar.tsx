"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
	{ label: "Home", href: "/" },
	{ label: "Snippets", href: "/snippets" },
];

export function Navbar() {
	const pathname = usePathname();

	return (
		<header className='border-b border-white/10 backdrop-blur-md sticky top-0 z-50'>
			<div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between'>
				{/* Logo */}
				<Link
					href='/'
					className='flex items-center gap-2 hover:opacity-80 transition'>
					<Code2 className='w-7 h-7 text-purple-400' />
					<span className='text-xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent'>
						Codely
					</span>
				</Link>

				{/* Nav links */}
				<nav className='flex items-center gap-1'>
					{NAV_LINKS.map(({ label, href }) => (
						<Link
							key={href}
							href={href}>
							<Button
								variant='ghost'
								className={cn(
									"text-sm font-medium transition-colors",
									pathname === href
										? "text-purple-400 bg-purple-400/10"
										: "text-gray-300 hover:text-purple-400 hover:bg-purple-400/10",
								)}>
								{label}
							</Button>
						</Link>
					))}
				</nav>
			</div>
		</header>
	);
}
