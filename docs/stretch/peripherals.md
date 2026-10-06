# Stretch: more devices

**The idea:** input devices raise interrupts and write their reading into a device register;
output devices read their register each tick and show it (memory-mapped I/O, see
ARCHITECTURE.md "Memory map").

**Input, with an interrupt handler** (pick one):

| Device | File | IRQ when | Handler |
|---|---|---|---|
| Temperature sensor | `components/peripherals/sensor.ts` | the reading crosses the threshold going up | `programs/isr-sensor.asm` |
| Proximity sensor | `components/peripherals/proximity.ts` | something comes inside the radius | `programs/isr-proximity.asm` |
| Potentiometer | `components/peripherals/potentiometer.ts` | the value has been still for a few ticks | `programs/isr-potentiometer.asm` |

Each has `<kind>-input`, `<kind>-tick` and `<kind>-view` regions, and an ISR region in its
`.asm` file. Turn stretch on (`"stretch": true` in `course.json`) and set
`"peripheral": "<kind>"` there too, so only the tests for the device you picked run. Check:
`tests/stretch/sensor.test.ts` / `proximity.test.ts` / `potentiometer.test.ts`, `isr.test.ts` and
`peripheral-status.test.ts`.

**Output:** `components/peripherals/seven-segment.ts` (shows its register as digits; great with
the countdown) and `screen.ts` (scrolls a column per few ticks). Check: `tests/stretch/seven-segment.test.ts`,
`screen.test.ts`.

**On your board:** draw the device with the parts library, and make its interrupt visibly fly to
the core that handles it.
