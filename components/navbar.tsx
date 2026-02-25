"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Code2, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WalletButton } from "@/components/WalletConnect";
import { cn } from "@/lib/utils";
import { useState } from "react";

const NAV_LINKS = [
	{ label: "Home", href: "/" },
	{ label: "Snippets", href: "/snippets" },
];

export function Navbar() {
	const pathname = usePathname();
	const [mobileOpen, setMobileOpen] = useState(false);

	return
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

				{/* Nav links & Wallet */}
				<div className='flex items-center gap-4'>
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
					<WalletButton />
				</div>
			</div>
		</header>
	);
	  <header className="border-b border-slate-200 bg-white/90 backdrop-blur-md sticky top-0 z-50 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)]">
		  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
			  {/* Logo */}
			  <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition">
				  <Code2 className="w-7 h-7 text-indigo-600" />
				  <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
					  Codely
				  </span>
			  </Link>

			  {/* Desktop nav */}
			  <nav className="hidden md:flex items-center gap-1">
				  {NAV_LINKS.map(({ label, href }) => (
			  <Link key={href} href={href}>
				  <Button
					  variant="ghost"
					  className={cn(
						  "text-sm font-medium transition-colors",
						  pathname === href
						? "text-indigo-600 bg-indigo-50"
						: "text-slate-600 hover:text-indigo-600 hover:bg-indigo-50",
				)}
				  >
					  {label}
				  </Button>
			  </Link>
		  ))}
			  </nav>

			  {/* Desktop CTA */}
			  <div className="hidden md:flex items-center gap-3">
				  <Link href="/snippets">
					  <Button
						  size="sm"
						  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-5 font-semibold shadow-sm hover:shadow-md transition-all duration-200"
					  >
						  Get Started
					  </Button>
				  </Link>
			  </div>

			  {/* Mobile menu button */}
			  <button
				  className="md:hidden text-slate-600 hover:text-indigo-600 transition-colors"
				  onClick={() => setMobileOpen(!mobileOpen)}
				  aria-label="Toggle navigation menu"
			  >
				  {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
			  </button>
		  </div>

		  {/* Mobile menu */}
		  {mobileOpen && (
			  <div className="md:hidden border-t border-slate-100 bg-white px-4 py-4 flex flex-col gap-2">
				  {NAV_LINKS.map(({ label, href }) => (
					  <Link key={href} href={href} onClick={() => setMobileOpen(false)}>
						  <Button
							  variant="ghost"
							  className={cn(
								  "w-full justify-start text-sm font-medium",
								  pathname === href
									  ? "text-indigo-600 bg-indigo-50"
									  : "text-slate-600 hover:text-indigo-600 hover:bg-indigo-50",
							  )}
						  >
							  {label}
						  </Button>
					  </Link>
				  ))}
				  <Link href="/snippets" onClick={() => setMobileOpen(false)}>
					  <Button className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full font-semibold">
						  Get Started
					  </Button>
				  </Link>
			  </div>
		  )}
	  </header>
  )
}
