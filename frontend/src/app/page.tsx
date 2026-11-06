"use client";

import LandingPage from "@/components/landing-page";
import DashboardPage from "@/components/dashboard-page";
import { NavBar } from "@/components/nav-bar";
import { AppHeader } from "@/components/app-header";

const IS_HOSTED = !!(process.env.NEXT_PUBLIC_API_URL && !process.env.NEXT_PUBLIC_API_URL.includes("localhost"));

export default function HomePage() {
  if (IS_HOSTED) {
    return <LandingPage />;
  }

  // Self-hosted: dashboard with unified app shell
  return (
    <div className="flex min-h-screen bg-(--color-background)">
      <NavBar />
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <AppHeader />
        <main className="flex-1 p-6 lg:p-8 overflow-auto">
          <DashboardPage />
        </main>
      </div>
    </div>
  );
}
