import { Detection } from "@/types";
import { GlassPanel } from "@/components/ui/glass-panel";

type FrameMatch = {
  frameIndex: number;
  timestamp: number;
  timestampFormatted: string;
  image?: string;
  objects: Detection[];
};

interface ChatMessageProps {
  id: number;
  role: "assistant" | "user";
  content?: string;
  frames?: FrameMatch[];
  timestamp: Date;
  onFrameClick: (frame: FrameMatch) => void;
}

export function ChatMessage({
  role,
  content,
  frames,
  timestamp,
  onFrameClick,
}: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div
      className={`flex items-start gap-4 animate-slide-up ${
        isUser ? "flex-row-reverse" : ""
      }`}
    >
      {/* Avatar */}
      <div
        className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-lg border border-white/10 ${
          isUser
            ? "bg-gradient-to-br from-indigo-500 to-purple-600"
            : "bg-slate-900/80"
        }`}
      >
        {isUser ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="h-5 w-5 text-white"
          >
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="h-5 w-5 text-indigo-400"
          >
            <rect x="3" y="8" width="18" height="12" rx="2" />
            <rect x="7" y="2" width="10" height="6" rx="1" />
            <circle cx="9" cy="14" r="1.5" />
            <circle cx="15" cy="14" r="1.5" />
            <path d="M9 18h6" />
          </svg>
        )}
      </div>

      {/* Message Content */}
      <div className={`flex flex-col max-w-[85%] ${isUser ? "items-end" : "items-start"}`}>
        <GlassPanel
          intensity={isUser ? "high" : "medium"}
          className={`px-5 py-4 ${
            isUser
              ? "bg-indigo-600/20 border-indigo-500/30 rounded-tr-none"
              : "rounded-tl-none bg-slate-800/40"
          }`}
        >
          {content && (
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-100 font-medium">
              {content}
            </p>
          )}

          {/* Frame Gallery */}
          {frames && frames.length > 0 && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {frames.map((frame) => (
                <button
                  key={`${frame.frameIndex}-${frame.timestamp}`}
                  type="button"
                  onClick={() => onFrameClick(frame)}
                  className="group relative overflow-hidden rounded-lg border border-white/10 bg-black/40 transition-all hover:scale-105 hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-500/20"
                >
                  {frame.image ? (
                    <img
                      src={`data:image/jpeg;base64,${frame.image}`}
                      alt={`Frame ${frame.frameIndex}`}
                      className="h-28 w-full object-cover transition-opacity group-hover:opacity-80"
                    />
                  ) : (
                    <div className="flex h-28 w-full items-center justify-center text-xs text-slate-500">
                      No preview
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-60" />
                  <div className="absolute left-2 bottom-2 text-xs font-bold text-indigo-300">
                    {frame.timestampFormatted}
                  </div>
                </button>
              ))}
            </div>
          )}
        </GlassPanel>

        <span className="text-xs text-slate-500 mt-2 px-1">
          {timestamp.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    </div>
  );
}
