// Per-kind views drawn inside the generic peripheral node. A kind that isn't listed just shows
// its status data as a table, so a new peripheral works on the dashboard with no UI code at all.
import type { ComponentType } from "react";
import type { PeripheralViewProps } from "@/app/_components/nodes/peripherals/view-props";
import { ButtonView } from "@/app/_components/nodes/peripherals/button";
import { LedView } from "@/app/_components/nodes/peripherals/led";
import { PotentiometerView } from "@/app/_components/nodes/peripherals/potentiometer";
import { ProximityView } from "@/app/_components/nodes/peripherals/proximity";
import { ScreenView } from "@/app/_components/nodes/peripherals/screen";
import { SensorView } from "@/app/_components/nodes/peripherals/sensor";
import { SevenSegmentView } from "@/app/_components/nodes/peripherals/seven-segment";
import { TimerView } from "@/app/_components/nodes/peripherals/timer";

export const PERIPHERAL_VIEWS: Partial<Record<string, ComponentType<PeripheralViewProps>>> = {
  button: ButtonView,
  led: LedView,
  "seven-segment": SevenSegmentView,
  screen: ScreenView,
  potentiometer: PotentiometerView,
  proximity: ProximityView,
  sensor: SensorView,
  timer: TimerView,
};
