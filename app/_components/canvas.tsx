"use client";
// The React Flow canvas: one node per component the bus told us about, one edge per pair of
// components that have talked. Nodes are derived from the latest status; nothing is polled.
import { useEffect, useMemo, useRef } from "react";
import { Background, Controls, MiniMap, ReactFlow, useNodesState, useReactFlow, type Node, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { PERIPHERALS } from "@/components/peripherals";
import { drawnComponents, type ComponentEntry } from "@/app/_lib/system-state";
import { useActions, useBus } from "@/app/_lib/use-bus";
import { defaultPosition, edgesFor, freePlace, type Lane } from "@/app/_components/canvas-layout";
import { CpuNodeView, type CpuNode } from "@/app/_components/nodes/cpu-node";
import { MemoryNodeView, type MemoryNode } from "@/app/_components/nodes/memory-node";
import { PeripheralNodeView, type PeripheralNode } from "@/app/_components/nodes/peripheral-node";
import { useToast } from "@/app/_components/toast";

type DashboardNode = CpuNode | MemoryNode | PeripheralNode;

const NODE_TYPES: NodeTypes = { cpu: CpuNodeView, memory: MemoryNodeView, peripheral: PeripheralNodeView };

const OUTPUT_KINDS: ReadonlySet<string> = new Set(PERIPHERALS.filter((p) => p.direction === "output").map((p) => p.kind));

export function Canvas() {
  const { system } = useBus();
  const actions = useActions();
  const toast = useToast();
  const [nodes, setNodes, onNodesChange] = useNodesState<DashboardNode>([]);
  /** Each peripheral's spot in its lane, held for as long as it is connected. */
  const places = useRef(new Map<string, { lane: Lane; place: number }>());

  const components = useMemo(() => drawnComponents(system), [system]);
  const hostId = useMemo(() => Object.values(system.components).find((c) => c.info.role === "host")?.info.id ?? null, [system.components]);

  useEffect(() => {
    const stalled = new Set(system.stalled);

    // Free the spots of peripherals that left, then give newcomers the first free spot in
    // their lane, in the order they arrived.
    const present = new Set(components.map((c) => c.info.id));
    for (const id of places.current.keys()) if (!present.has(id)) places.current.delete(id);
    for (const entry of components) {
      if (entry.info.role !== "peripheral" || places.current.has(entry.info.id)) continue;
      const lane: Lane = OUTPUT_KINDS.has(entry.info.kind ?? "") ? "output" : "input";
      const taken = [...places.current.values()].filter((p) => p.lane === lane).map((p) => p.place);
      places.current.set(entry.info.id, { lane, place: freePlace(taken) });
    }

    function toNode(entry: ComponentEntry, previous: Node | undefined): DashboardNode {
      const spot = places.current.get(entry.info.id);
      const base = {
        id: entry.info.id,
        position: previous?.position ?? defaultPosition(entry, spot?.lane ?? "input", spot?.place ?? 0),
        ...(previous?.measured && { measured: previous.measured }),
        ...(previous?.selected !== undefined && { selected: previous.selected }),
      };
      const common = { entry, stalled: stalled.has(entry.info.id) };
      if (entry.info.role === "cpu") return { ...base, type: "cpu", data: common };
      if (entry.info.role === "memory") return { ...base, type: "memory", data: common };
      const id = entry.info.id;
      return {
        ...base,
        type: "peripheral",
        data: {
          ...common,
          sendInput: (input) => actions?.input(id, input),
          remove: () => {
            if (!actions || !hostId) return toast("The peripheral host isn't connected, so nothing can be removed.");
            actions.removePeripheral(hostId, id).catch((error: Error) => toast(error.message));
          },
        },
      };
    }

    setNodes((previous) => {
      const byId = new Map(previous.map((n) => [n.id, n]));
      return components.map((entry) => toNode(entry, byId.get(entry.info.id)));
    });
  }, [components, system.stalled, actions, hostId, setNodes, toast]);

  const edges = useMemo(() => {
    const roles = Object.fromEntries(Object.values(system.components).map((c) => [c.info.id, c.info.role]));
    return edgesFor(system.links, roles, system.tick);
  }, [system.links, system.components, system.tick]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      nodeTypes={NODE_TYPES}
      fitView
      fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
      minZoom={0.2}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={16} size={1} color="#e4e4e7" />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable className="rounded-lg border border-zinc-200" />
      <FitWhenNodesChange count={nodes.length} />
    </ReactFlow>
  );
}

/** Zoom to show everything when a component joins or leaves, so a new peripheral isn't off-screen. */
function FitWhenNodesChange({ count }: { count: number }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    // Wait a frame so React Flow has measured the new node before fitting.
    const frame = requestAnimationFrame(() => void fitView({ padding: 0.2, maxZoom: 1, duration: 300 }));
    return () => cancelAnimationFrame(frame);
  }, [count, fitView]);
  return null;
}
