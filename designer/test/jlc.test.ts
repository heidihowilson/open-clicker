import { expect, test } from "bun:test";
import { jlcCpl } from "../../router/jlc";
import type { Netlist } from "../src/lib/netlist";

test("the placement file survives part values with commas", () => {
  const list = { parts: [{ ref: "LED1", value: "IR LED 940 nm, side-looking", lcsc: "C367227", footprint: "LED_THT:LED_SideEmitter_Rectangular_W4.5mm_H1.6mm", pins: {} }] } as unknown as Netlist;
  const pos = `Ref,Val,Package,PosX,PosY,Rot,Side
"LED1","IR LED 940 nm, side-looking","LED_SideEmitter_Rectangular_W4.5mm_H1.6mm",19.2700,11.5000,180.0000,top`;
  expect(jlcCpl(list, pos).trim().split("\n")[1]).toBe(`"LED1","19.2700mm","11.5000mm","Top","180"`);
});
