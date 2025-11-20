"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Detection,
  DetectionResult,
  DetectionSummary,
  ProcessVideoResponse,
} from "@/types";

const MIN_CONFIDENCE = 0.6;
const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";
const STOPWORDS = new Set([
  "find",
  "show",
  "frame",
  "frames",
  "with",
  "please",
  "can",
  "you",
  "the",
  "a",
  "an",
  "any",
  "all",
  "of",
  "for",
  "look",
  "search",
  "detect",
  "spot",
  "every",
  "and",
  "to",
  "in",
  "on",
  "at",
  "video",
  "footage",
  "frames",
  "objects",
]);

type FrameMatch = {
  frameIndex: number;
  timestamp: number;
  timestampFormatted: string;
  image?: string;
  objects: Detection[];
};

type ChatMessage = {
  id: number;
  role: "assistant" | "user";
  content?: string;
  frames?: FrameMatch[];
  timestamp: Date;
};

const formatTimestamp = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

export default function Home() {
  const [results, setResults] = useState<DetectionResult[]>([]);
  const [summary, setSummary] = useState<DetectionSummary | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: Date.now(),
      role: "assistant",
      content:
        "I am your personal AI detective. Upload a video and I'll help you find what you're looking for.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [lightboxFrame, setLightboxFrame] = useState<FrameMatch | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const appendMessage = useCallback(
    (role: "assistant" | "user", content?: string, frames?: FrameMatch[]) => {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + Math.random(),
          role,
          content,
          frames,
          timestamp: new Date(),
        },
      ]);
    },
    []
  );

  const handleLog = useCallback(
    (message: string, role: "assistant" | "system" = "assistant") => {
      appendMessage(role === "system" ? "assistant" : role, message);
    },
    [appendMessage]
  );

  const findMatchingFrames = useCallback(
    (targets: string[]): FrameMatch[] => {
      if (!targets.length) return [];
      const normalized = targets
        .map((target) => target.trim().toLowerCase())
        .filter(Boolean);

      if (!normalized.length) return [];

      return results.reduce<FrameMatch[]>((acc, frame) => {
        const matchingObjects = frame.objects.filter((obj) => {
          if (obj.confidence < MIN_CONFIDENCE) return false;
          const label = obj.class.toLowerCase();
          return normalized.some((term) => label.includes(term));
        });

        if (matchingObjects.length === 0) {
          return acc;
        }

        acc.push({
          frameIndex: frame.frame_index,
          timestamp: frame.timestamp,
          timestampFormatted: formatTimestamp(frame.timestamp),
          image: frame.image,
          objects: matchingObjects,
        });
        return acc;
      }, []);
    },
    [results]
  );

  const interpretQuery = useCallback(
    async (text: string): Promise<string[]> => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/intent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: text }),
        });

        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data.targets)) {
            const targets = data.targets
              .map((target: unknown) =>
                typeof target === "string" ? target.trim().toLowerCase() : ""
              )
              .filter((target: string) => target && !STOPWORDS.has(target));
            if (targets.length) {
              return Array.from(new Set(targets));
            }
          }
        }
      } catch (error) {
        console.error("Intent parsing failed:", error);
        handleLog(
          "I had trouble interpreting that. I will fall back to keywords.",
          "assistant"
        );
      }

      const fallback = (
        text.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? []
      ).filter((word) => !STOPWORDS.has(word));
      return Array.from(new Set(fallback));
    },
    [handleLog]
  );

  const processVideo = useCallback(
    async (file: File) => {
      setIsProcessing(true);
      setSummary(null);
      setResults([]);
      handleLog(
        `Uploading "${file.name}" (${(file.size / (1024 * 1024)).toFixed(
          2
        )} MB). Sit tight while I extract frames...`,
        "assistant"
      );

      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await fetch(`${BACKEND_URL}/api/process-video`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          let errorDetail = "Failed to process video";
          try {
            const errorData = await response.json();
            errorDetail = errorData.detail || errorData.error || errorDetail;
          } catch (e) {
            errorDetail = response.statusText;
          }
          throw new Error(errorDetail);
        }

        const data: ProcessVideoResponse = await response.json();
        if (!data.success) {
          throw new Error(data.error || "Processing failed");
        }

        setResults(data.results ?? []);
        setSummary(data.summary ?? null);

        if (data.summary) {
          handleLog(
            `Done! Processed ${
              data.summary.processed_frames
            } frames in ${data.summary.duration_seconds.toFixed(
              1
            )}s. Ask me which objects to pull up.`,
            "assistant"
          );
        } else {
          handleLog("Video processed. Ready for queries.", "assistant");
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Error processing video. Please try again.";
        handleLog(message, "assistant");
        alert(message);
      } finally {
        setIsProcessing(false);
      }
    },
    [handleLog]
  );

  const onUploadButtonClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onFileSelected = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("video/")) {
        alert("Please select a valid video file (MP4, AVI, MOV, etc.).");
        event.target.value = "";
        return;
      }
      if (file.size > 500 * 1024 * 1024) {
        alert("Video file too large. Please select a file smaller than 500MB.");
        event.target.value = "";
        return;
      }
      void processVideo(file);
      event.target.value = "";
    },
    [processVideo]
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const message = input.trim();
      if (!message) return;

      appendMessage("user", message);
      setInput("");

      if (!results.length) {
        appendMessage(
          "assistant",
          "Please upload a video first so I can extract frames before searching for objects."
        );
        return;
      }

      if (isProcessing) {
        appendMessage(
          "assistant",
          "Hang on—your footage is still being processed."
        );
        return;
      }

      const targets = await interpretQuery(message);

      if (!targets.length) {
        appendMessage(
          "assistant",
          "I'm not sure what objects to look for there. Try mentioning the items explicitly."
        );
        return;
      }

      const matches = findMatchingFrames(targets);

      if (!matches.length) {
        appendMessage(
          "assistant",
          `I searched for ${targets.join(
            ", "
          )} but couldn't spot them in this footage.`
        );
        return;
      }

      const matchedLabels = Array.from(
        new Set(
          matches.flatMap((frame) =>
            frame.objects.map((obj) => obj.class.toLowerCase())
          )
        )
      );

      const summaryLine = `Here ${matches.length > 1 ? "are" : "is"} ${
        matches.length
      } frame${matches.length > 1 ? "s" : ""} showing ${matchedLabels.join(
        ", "
      )}.`;

      appendMessage("assistant", summaryLine, matches);
    },
    [
      appendMessage,
      findMatchingFrames,
      input,
      interpretQuery,
      isProcessing,
      results.length,
    ]
  );

  return (
    <main className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      <div className="w-full flex flex-col h-full">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h1 className="text-2xl font-semibold text-slate-50">Sherlocked</h1>
          {summary && (
            <div className="flex items-center gap-4 text-xs">
              <div className="text-slate-400">
                <span className="font-semibold" style={{ color: "#0C8CE9" }}>
                  {summary.processed_frames}
                </span>{" "}
                frames
              </div>
              <div className="text-slate-400">
                <span className="font-semibold" style={{ color: "#0C8CE9" }}>
                  {summary.detections_found}
                </span>{" "}
                detections
              </div>
            </div>
          )}
        </div>

        {/* Main chat container */}
        <div className="flex-1 mx-auto w-full max-w-4xl flex flex-col px-6 overflow-hidden">
          <div className="p-6 flex flex-col h-full min-h-0">
            {/* Scrollable messages container */}
            <div
              className="space-y-4 mb-4 flex-1 overflow-y-auto min-h-0 hide-scrollbar"
              style={{
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}
            >
              {messages.length === 0 && (
                <div className="text-center text-slate-400 flex items-center justify-center gap-2 h-full">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    className="h-8 w-8"
                  >
                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
                  </svg>
                  <span className="text-lg">
                    Hi, I'm Sherlocked. Upload a video to get started!
                  </span>
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-start gap-3 ${
                    msg.role === "user" ? "flex-row-reverse" : ""
                  }`}
                >
                  {/* Avatar */}
                  <div
                    className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                      msg.role === "user" ? "" : "bg-slate-700"
                    }`}
                    style={
                      msg.role === "user" ? { backgroundColor: "#0C8CE9" } : {}
                    }
                  >
                    {msg.role === "user" ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        className="h-5 w-5 text-slate-950"
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
                        className="h-5 w-5 text-slate-200"
                      >
                        <rect x="3" y="8" width="18" height="12" rx="2" />
                        <rect x="7" y="2" width="10" height="6" rx="1" />
                        <circle cx="9" cy="14" r="1.5" />
                        <circle cx="15" cy="14" r="1.5" />
                        <path d="M9 18h6" />
                      </svg>
                    )}
                  </div>

                  {/* Message content */}
                  <div
                    className={`flex-1 ${
                      msg.role === "user" ? "text-right" : ""
                    }`}
                  >
                    <div
                      className={`inline-block rounded-2xl px-4 py-3 max-w-[85%] ${
                        msg.role === "user"
                          ? "text-slate-950"
                          : "bg-slate-800 text-slate-100 border border-slate-700"
                      }`}
                      style={
                        msg.role === "user" ? { backgroundColor: "#0C8CE9" } : {}
                      }
                    >
                      {msg.content && (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {msg.content}
                        </p>
                      )}

                      {/* Frame gallery */}
                      {msg.frames && msg.frames.length > 0 && (
                        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {msg.frames.map((frame) => (
                            <button
                              key={`${frame.frameIndex}-${frame.timestamp}`}
                              type="button"
                              onClick={() => setLightboxFrame(frame)}
                              className="group relative overflow-hidden rounded-lg border border-slate-700/60 bg-slate-900/60 transition-transform hover:scale-105"
                            >
                              {frame.image ? (
                                <img
                                  src={`data:image/jpeg;base64,${frame.image}`}
                                  alt={`Frame ${frame.frameIndex}`}
                                  className="h-32 w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-32 w-full items-center justify-center bg-slate-800 text-xs text-slate-400">
                                  No preview
                                </div>
                              )}
                              <div className="absolute inset-0 bg-linear-to-t from-slate-950/80 via-transparent" />
                              <div
                                className="absolute left-2 bottom-2 text-xs font-semibold"
                                style={{ color: "#0C8CE9" }}
                              >
                                {frame.timestampFormatted}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Timestamp */}
                      <p
                        className={`text-xs mt-2 ${
                          msg.role === "user"
                            ? "text-slate-700"
                            : "text-slate-400"
                        }`}
                      >
                        {msg.timestamp.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}

              {/* Auto-scroll anchor */}
              <div ref={messagesEndRef} />

              {isProcessing && (
                <div className="flex items-center gap-3">
                  <div className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-slate-700">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      className="h-5 w-5 text-slate-200 animate-spin"
                    >
                      <path d="M12 2L2 7l10 5 10-5-10-5z" />
                      <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
                    </svg>
                  </div>
                  <div className="text-sm text-slate-400">Processing...</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Fixed input area at the bottom */}
        <div className="w-full max-w-4xl mx-auto border-t border-slate-800 p-4">
          <form onSubmit={handleSubmit} className="w-full">
            <div className="flex items-end gap-3">
              <div className="flex-1 flex flex-col">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    isProcessing
                      ? "Processing video... hang tight."
                      : "Ask me things like 'Find a person holding a laptop'"
                  }
                  rows={1}
                  className="w-full resize-none bg-slate-800/60 border border-slate-700 rounded-2xl px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none min-h-[48px] max-h-[120px]"
                  style={{
                    height: "auto",
                    overflowY: "auto",
                  }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = "auto";
                    target.style.height =
                      Math.min(target.scrollHeight, 120) + "px";
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e as any);
                    }
                  }}
                  disabled={isProcessing}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={onFileSelected}
                />

                <button
                  type="button"
                  onClick={onUploadButtonClick}
                  className="h-12 w-12 shrink-0 flex items-center justify-center rounded-xl border border-slate-700 bg-slate-800/60 text-slate-200 transition-colors disabled:opacity-60"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#0C8CE9";
                    e.currentTarget.style.color = "#0C8CE9";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "";
                    e.currentTarget.style.color = "";
                  }}
                  disabled={isProcessing}
                  aria-label="Upload video"
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
                  className="h-12 w-12 shrink-0 flex items-center justify-center rounded-xl text-slate-950 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ backgroundColor: "#0C8CE9" }}
                  onMouseEnter={(e) => {
                    if (!e.currentTarget.disabled) {
                      e.currentTarget.style.backgroundColor = "#0A7BD6";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!e.currentTarget.disabled) {
                      e.currentTarget.style.backgroundColor = "#0C8CE9";
                    }
                  }}
                  disabled={isProcessing && !results.length}
                  aria-label="Send message"
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
            </div>
          </form>
        </div>
      </div>

      {/* Lightbox for frame preview */}
      {lightboxFrame && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 px-4"
          onClick={() => setLightboxFrame(null)}
        >
          <div
            className="relative w-full max-w-4xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxFrame(null)}
              className="absolute -right-2 -top-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-slate-200 shadow-lg hover:bg-slate-800"
              aria-label="Close preview"
            >
              ✕
            </button>
            {lightboxFrame.image ? (
              <img
                src={`data:image/jpeg;base64,${lightboxFrame.image}`}
                alt={`Frame ${lightboxFrame.frameIndex}`}
                className="w-full max-h-[75vh] rounded-3xl object-contain"
              />
            ) : (
              <div className="flex h-[60vh] items-center justify-center rounded-3xl border border-slate-700 bg-slate-900/70 text-slate-300">
                No preview available
              </div>
            )}
            <div className="rounded-2xl border border-slate-700/70 bg-slate-900/80 p-4 text-sm text-slate-200">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="rounded-full bg-slate-800/80 px-3 py-1 text-xs font-semibold"
                  style={{ color: "#0C8CE9" }}
                >
                  {lightboxFrame.timestampFormatted}
                </span>
                <span className="rounded-full bg-slate-800/80 px-3 py-1 text-xs font-semibold text-slate-300">
                  Frame #{lightboxFrame.frameIndex}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {lightboxFrame.objects.map((obj, idx) => (
                  <span
                    key={`${lightboxFrame.frameIndex}-${idx}-${obj.class}`}
                    className="rounded-full px-3 py-1 text-xs font-semibold"
                    style={{
                      border: "1px solid rgba(12, 140, 233, 0.4)",
                      backgroundColor: "rgba(12, 140, 233, 0.1)",
                      color: "#0C8CE9",
                    }}
                  >
                    {obj.class} {(obj.confidence * 100).toFixed(0)}%
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
