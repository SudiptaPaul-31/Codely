"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Code2, Zap, Share2 } from "lucide-react";
import { Navbar } from "@/components/navbar";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white overflow-hidden">
      {/* Animated background elements */}

      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-glow-pulse" />
        <div
          className="absolute top-40 right-10 w-72 h-72 bg-blue-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-glow-pulse"
          style={{ animationDelay: "1s" }}
        />
        <div
          className="absolute bottom-10 left-1/2 w-72 h-72 bg-indigo-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-glow-pulse"
          style={{ animationDelay: "2s" }}
        />
      </div>
      <Navbar />

      <div className="relative z-10">
        {/* Hero Section */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            {/* Left content */}
            <div className="animate-float-up">
              <h2 className="text-4xl text-center md:text-left md:text-6xl font-bold mb-6 leading-tight">
                Save Your{" "}
                <span className="bg-gradient-to-r from-purple-400 via-blue-400 to-indigo-400 bg-clip-text text-transparent">
                  Code Snippets
                </span>
              </h2>
              <p className="text-xl text-gray-300 mb-8 leading-relaxed">
                A modern platform for developers to save, organize, and share
                their favorite code snippets. Never lose a useful piece of code
                again.
              </p>

              <div className="space-y-4 mb-8">
                <div className="flex items-start gap-3">
                  <Zap className="w-6 h-6 text-purple-400 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-lg mb-1">Quick Save</h3>
                    <p className="text-gray-400">
                      Save code snippets with syntax highlighting in seconds
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Code2 className="w-6 h-6 text-blue-400 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-lg mb-1">
                      Multiple Languages
                    </h3>
                    <p className="text-gray-400">
                      Support for all popular programming languages
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Share2 className="w-6 h-6 text-indigo-400 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-lg mb-1">
                      Easy Organization
                    </h3>
                    <p className="text-gray-400">
                      Organize snippets with tags and descriptions
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/snippets" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    className="w-full sm:w-auto bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white border-0 group animate-glow-pulse"
                  >
                    Get Started
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full sm:w-auto border-purple-400/50 text-white hover:bg-purple-400/10 bg-transparent"
                >
                  Learn More
                </Button>
              </div>
            </div>

            {/* Right visual */}
            <div className="hidden md:block">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl blur-2xl opacity-30" />
                <div className="relative bg-slate-800/50 backdrop-blur-xl border border-purple-500/20 rounded-2xl p-8">
                  <div className="space-y-4">
                    <div className="h-3 bg-gradient-to-r from-purple-500 to-blue-500 rounded w-32" />
                    <div className="space-y-2">
                      <div className="h-2 bg-purple-500/20 rounded w-full" />
                      <div className="h-2 bg-purple-500/20 rounded w-5/6" />
                      <div className="h-2 bg-purple-500/20 rounded w-4/5" />
                    </div>
                    <div className="pt-4 border-t border-purple-500/20">
                      <div className="space-y-2 mt-4">
                        <div className="h-2 bg-blue-500/20 rounded w-full" />
                        <div className="h-2 bg-blue-500/20 rounded w-5/6" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-16 grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
          <div className="animate-float-up" style={{ animationDelay: "0.1s" }}>
            <div className="text-4xl font-bold text-purple-400 mb-2">∞</div>
            <p className="text-gray-400">Unlimited Snippets</p>
          </div>
          <div className="animate-float-up" style={{ animationDelay: "0.2s" }}>
            <div className="text-4xl font-bold text-blue-400 mb-2">50+</div>
            <p className="text-gray-400">Languages</p>
          </div>
          <div className="animate-float-up" style={{ animationDelay: "0.3s" }}>
            <div className="text-4xl font-bold text-indigo-400 mb-2">100%</div>
            <p className="text-gray-400">Private</p>
          </div>
        </section>

        {/* CTA Section */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20 text-center">
          <div className="bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/30 rounded-2xl p-6 sm:p-12 backdrop-blur-xl">
            <h3 className="text-3xl font-bold mb-4">
              Ready to organize your code?
            </h3>
            <p className="text-gray-300 mb-8">
              Join thousands of developers who trust Codely for their code
              snippet management.
            </p>
            <Link href="/snippets">
              <Button
                size="lg"
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white border-0"
              >
                Start Adding Snippets Now
              </Button>
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/10 backdrop-blur-md mt-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-gray-400">
            <p>© 2025 Codely. Save smarter, code better.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
