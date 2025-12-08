import { ReactNode } from "react";

interface GlassPanelProps {
  children: ReactNode;
  className?: string;
  intensity?: "low" | "medium" | "high";
}

export function GlassPanel({ 
  children, 
  className = "", 
  intensity = "medium" 
}: GlassPanelProps) {
  const intensityMap = {
    low: "backdrop-blur-sm bg-white/5 border-white/5",
    medium: "backdrop-blur-md bg-white/[0.07] border-white/10",
    high: "backdrop-blur-xl bg-white/10 border-white/10",
  };

  return (
    <div
      className={`rounded-2xl border shadow-lg ${intensityMap[intensity]} ${className}`}
    >
      {children}
    </div>
  );
}
