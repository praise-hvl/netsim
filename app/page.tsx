"use client";
// The NetSim dashboard: a bus client with role "dashboard". It draws what the components
// report and sends only control, input, program and peripheral requests.
import { BusProvider } from "@/app/_lib/use-bus";
import { Canvas } from "@/app/_components/canvas";
import { ControlsBar } from "@/app/_components/controls-bar";
import { SidePanel } from "@/app/_components/side-panel";
import { ToastProvider } from "@/app/_components/toast";

export default function DashboardPage() {
  return (
    <ToastProvider>
      <BusProvider>
        <div className="flex h-screen flex-col bg-zinc-50">
          <ControlsBar />
          <main className="flex min-h-0 flex-1">
            <div className="min-w-0 flex-1">
              <Canvas />
            </div>
            <SidePanel />
          </main>
        </div>
      </BusProvider>
    </ToastProvider>
  );
}
