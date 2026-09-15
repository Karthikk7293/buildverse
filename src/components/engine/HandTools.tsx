"use client";
import { HAND_TOOL_HINTS, type HandTool } from "@/lib/hand-gestures";
import { LabIcon, type LabIconName } from "./LabIcon";

const TOOLS: { id: HandTool; label: string; icon: LabIconName }[] = [
  { id: "grab", label: "Rotate / grab", icon: "rotate" },
  { id: "zoom", label: "Finger zoom", icon: "zoomIn" },
  { id: "pan", label: "Pan", icon: "pan" },
  { id: "explode", label: "Separate parts", icon: "layers" },
];

export function HandTools({ tool, onTool, ready, paused, hint, simulating }: {
  tool: HandTool; onTool: (tool: HandTool) => void; ready: boolean;
  paused: boolean; hint: string; simulating: boolean;
}) {
  return <div className="hand-tools">
    <div className="hand-tools-row">
      <span className="hand-tools-label"><LabIcon name="hand" size={14}/> Hand tool</span>
      <div className="hand-tool-options" role="group" aria-label="Choose a hand gesture tool">
        {TOOLS.map((item) => <button key={item.id} aria-label={`${item.label} tool`} aria-pressed={tool === item.id}
          disabled={simulating && item.id === "explode"} onClick={() => onTool(item.id)}
          title={simulating && item.id === "explode" ? "Switch to Inspect or Assemble to separate parts" : HAND_TOOL_HINTS[item.id]}>
          <LabIcon name={item.icon} size={15}/><span>{item.label}</span>
        </button>)}
      </div>
    </div>
    <div className="hand-tool-feedback" data-testid="hand-tool-feedback" data-paused={paused}>
      <span className={`status-dot ${!ready || paused ? "amber" : ""}`}/>
      <p>{ready ? hint : HAND_TOOL_HINTS[tool]}{!ready && <small>Enable hand controls to use these tools. Touch pinch also zooms on phones.</small>}</p>
    </div>
  </div>;
}
