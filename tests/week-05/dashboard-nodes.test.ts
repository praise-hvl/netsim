// The dashboard pieces built in week 5, rendered to HTML without a browser.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CoreCard, type CoreView } from "@/app/_components/nodes/core-card";
import { LedView } from "@/app/_components/nodes/peripherals/led";
import { accessAt } from "@/app/_components/nodes/memory-access";

const core: CoreView = {
  id: 1,
  state: "WAIT_FETCH",
  pc: 0x010,
  ir: [0x03, 0x00, 0x01, 0x00],
  instruction: "ADD R0, R1",
  registers: [5, 1, 0, 255],
  flags: { zero: true, carry: false },
  pid: 2,
  inHandler: false,
};

describe("CPU core card (in class)", () => {
  const html = renderToStaticMarkup(createElement(CoreCard, { core }));

  it("shows the FSM state and the PC", () => {
    expect(html).toContain("WAIT_FETCH");
    expect(html).toContain("0x010");
  });

  it("shows the current instruction and all four registers in hex", () => {
    expect(html).toContain("ADD R0, R1");
    for (const text of ["R0:05", "R1:01", "R2:00", "R3:FF"]) expect(html).toContain(text);
  });

  it("marks a core that is running an interrupt handler", () => {
    expect(html).not.toContain("ISR");
    expect(renderToStaticMarkup(createElement(CoreCard, { core: { ...core, inHandler: true } }))).toContain("ISR");
  });
});

describe("LED node (take-home)", () => {
  const render = (state: string, value: number) =>
    renderToStaticMarkup(createElement(LedView, { status: { state, label: "LED", data: { value } }, sendInput: () => {} }));

  it("looks lit when ON and dark when OFF", () => {
    expect(render("ON", 200)).toContain('aria-label="LED on"');
    expect(render("OFF", 3)).toContain('aria-label="LED off"');
  });

  it("shows the register value", () => {
    expect(render("ON", 200)).toContain("200");
  });
});

describe("memory highlight (take-home)", () => {
  const memory = { lastRead: { address: 0x010, length: 4 }, lastWrite: { address: 0x300, length: 1 } };

  it("highlights every byte of the last read", () => {
    expect([0x00f, 0x010, 0x013, 0x014].map((a) => accessAt(a, memory))).toEqual([null, "read", "read", null]);
  });

  it("highlights the last write", () => {
    expect(accessAt(0x300, memory)).toBe("write");
    expect(accessAt(0x301, memory)).toBe(null);
  });

  it("prefers write when an address was both read and written", () => {
    expect(accessAt(0x300, { lastRead: { address: 0x300, length: 1 }, lastWrite: { address: 0x300, length: 1 } })).toBe("write");
  });

  it("handles no accesses yet", () => {
    expect(accessAt(0, { lastRead: null, lastWrite: null })).toBe(null);
  });
});
