import { useRef, useEffect } from "react";
import { GlassPanel } from "@/components/ui/glass-panel";

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onUploadClick: () => void;
  isProcessing: boolean;
  hasResults: boolean;
}

export function ChatInput({
  input,
  setInput,
  onSubmit,
  onUploadClick,
  isProcessing,
  hasResults,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e as unknown as React.FormEvent);
    }
  };

  return (
    <GlassPanel intensity="high" className="p-2 backdrop-blur-2xl bg-black/40 border-t border-white/10">
      <form onSubmit={onSubmit} className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isProcessing
              ? "Processing video... hang tight."
              : "Ask me things like 'Find a person holding a laptop'"
          }
          rows={1}
          className="w-full resize-none bg-transparent border-none rounded-xl px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-0 min-h-[48px] max-h-[120px]"
          disabled={isProcessing}
        />

        <div className="flex items-center gap-2 pb-1 pr-1">
          <button
            type="button"
            onClick={onUploadClick}
            disabled={isProcessing}
            className="h-10 w-10 shrink-0 flex items-center justify-center rounded-lg hover:bg-white/10 text-slate-400 hover:text-indigo-400 transition-colors disabled:opacity-50"
            title="Upload Video"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="h-5 w-5"
            >
              <path d="M3 7h2l2-3h6l2 3h2a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3z" />
              <path d="m10 12 2 2 3-3" />
            </svg>
          </button>

          <button
            type="submit"
            disabled={isProcessing || (!input.trim() && !hasResults)}
            className={`h-10 w-10 shrink-0 flex items-center justify-center rounded-lg transition-all ${
              input.trim()
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-500"
                : "bg-slate-800/50 text-slate-500"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="h-5 w-5"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </button>
        </div>
      </form>
    </GlassPanel>
  );
}
