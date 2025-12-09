"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Detection,
  DetectionResult,
  DetectionSummary,
  ProcessVideoResponse,
} from "@/types";
import { Header } from "@/components/layout/header";
import { ChatMessage } from "@/components/chat/chat-message";
import { ChatInput } from "@/components/chat/chat-input";
import { Lightbox } from "@/components/media/lightbox";

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

type ChatMessageData = {
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
  const [messages, setMessages] = useState<ChatMessageData[]>([
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

  const colorMatches = useCallback((detectedColor: string | undefined, queryColor: string): boolean => {
    if (!detectedColor) return false;
    
    const detected = detectedColor.toLowerCase().trim();
    const query = queryColor.toLowerCase().trim();
    
    // Strict exact match only
    return detected === query;
  }, []);

  const findMatchingFrames = useCallback(
    (targets: string[], colors: string[], pairs: Array<{object: string, color: string}>): FrameMatch[] => {
      // If pairs are specified, use conjunctive matching (ALL pairs must be present)
      if (pairs && pairs.length > 0) {
        return results.reduce<FrameMatch[]>((acc, frame) => {
          // Check if ALL pairs are satisfied in this frame
          const allPairsSatisfied = pairs.every((pair) => {
            return frame.objects.some((obj) => {
              if (obj.confidence < MIN_CONFIDENCE) return false;
              
              const label = obj.class.toLowerCase();
              const objectMatches = label.includes(pair.object.toLowerCase());
              const colorMatchesObj = colorMatches(obj.color, pair.color);
              
              return objectMatches && colorMatchesObj;
            });
          });
          
          if (!allPairsSatisfied) {
            return acc;
          }
          
          // Collect all objects that match any of the pairs
          const matchingObjects = frame.objects.filter((obj) => {
            if (obj.confidence < MIN_CONFIDENCE) return false;
            
            return pairs.some((pair) => {
              const label = obj.class.toLowerCase();
              const objectMatches = label.includes(pair.object.toLowerCase());
              const colorMatchesObj = colorMatches(obj.color, pair.color);
              return objectMatches && colorMatchesObj;
            });
          });
          
          acc.push({
            frameIndex: frame.frame_index,
            timestamp: frame.timestamp,
            timestampFormatted: formatTimestamp(frame.timestamp),
            image: frame.image,
            objects: matchingObjects,
          });
          return acc;
        }, []);
      }
      
      // Fallback to old behavior for backward compatibility
      if (!targets.length && !colors.length) return [];
      const normalizedTargets = targets
        .map((target) => target.trim().toLowerCase())
        .filter(Boolean);
      const normalizedColors = colors
        .map((color) => color.trim().toLowerCase())
        .filter(Boolean);

      if (!normalizedTargets.length && !normalizedColors.length) return [];

      return results.reduce<FrameMatch[]>((acc, frame) => {
        const matchingObjects = frame.objects.filter((obj) => {
          if (obj.confidence < MIN_CONFIDENCE) return false;
          
          // Check object type match
          const label = obj.class.toLowerCase();
          const typeMatches = normalizedTargets.length === 0 || 
            normalizedTargets.some((term) => label.includes(term));
          
          // Check color match
          const colorMatchesQuery = normalizedColors.length === 0 || 
            normalizedColors.some((queryColor) => colorMatches(obj.color, queryColor));
          
          return typeMatches && colorMatchesQuery;
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
    [results, colorMatches]
  );

  const interpretQuery = useCallback(
    async (text: string): Promise<{ targets: string[]; colors: string[]; pairs: Array<{object: string, color: string}> }> => {
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
          const targets = Array.isArray(data.targets)
            ? data.targets
                .map((target: unknown) =>
                  typeof target === "string" ? target.trim().toLowerCase() : ""
                )
                .filter((target: string) => target && !STOPWORDS.has(target))
            : [];
          const colors = Array.isArray(data.colors)
            ? data.colors
                .map((color: unknown) =>
                  typeof color === "string" ? color.trim().toLowerCase() : ""
                )
                .filter((color: string) => color)
            : [];
          const pairs = Array.isArray(data.pairs)
            ? data.pairs
                .filter((pair: any) => pair && typeof pair === "object")
                .map((pair: any) => ({
                  object: String(pair.object || "").trim().toLowerCase(),
                  color: String(pair.color || "").trim().toLowerCase(),
                }))
                .filter((pair: any) => pair.object && pair.color)
            : [];
          
          if (targets.length || colors.length || pairs.length) {
            return {
              targets: Array.from(new Set(targets)),
              colors: Array.from(new Set(colors)),
              pairs,
            };
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
      return { targets: Array.from(new Set(fallback)), colors: [], pairs: [] };
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
          } catch {
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

      const { targets, colors, pairs } = await interpretQuery(message);

      if (!targets.length && !colors.length && !pairs.length) {
        appendMessage(
          "assistant",
          "I'm not sure what objects to look for there. Try mentioning the items explicitly."
        );
        return;
      }

      const matches = findMatchingFrames(targets, colors, pairs);

      if (!matches.length) {
        if (pairs.length > 0) {
          const pairDescriptions = pairs.map(p => `${p.color} ${p.object}`).join(" and ");
          appendMessage(
            "assistant",
            `I searched for frames with ${pairDescriptions} but couldn't find any matches. All specified items must be present in the same frame.`
          );
        } else {
          const searchTerms = [...targets, ...colors].join(", ");
          appendMessage(
            "assistant",
            `I searched for ${searchTerms} but couldn't spot them in this footage.`
          );
        }
        return;
      }

      const matchedLabels = Array.from(
        new Set(
          matches.flatMap((frame) =>
            frame.objects.map((obj) => obj.class.toLowerCase())
          )
        )
      );
      
      const matchedColors = Array.from(
        new Set(
          matches.flatMap((frame) =>
            frame.objects.map((obj) => obj.color).filter(Boolean)
          )
        )
      );

      let summaryLine = `Here ${matches.length > 1 ? "are" : "is"} ${
        matches.length
      } frame${matches.length > 1 ? "s" : ""}`;
      
      if (pairs.length > 0) {
        const pairDescriptions = pairs.map(p => `${p.color} ${p.object}`).join(" and ");
        summaryLine += ` with ${pairDescriptions}`;
      } else {
        summaryLine += ` showing ${matchedLabels.join(", ")}`;
        if (matchedColors.length > 0) {
          summaryLine += ` (colors: ${matchedColors.join(", ")})`;
        }
      }
      
      summaryLine += ".";

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
    <main className="flex h-screen bg-transparent text-slate-100 overflow-hidden relative selection:bg-indigo-500/30">
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-900/20 rounded-full blur-[120px] animate-pulse-glow" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-pink-900/10 rounded-full blur-[100px]" />
      </div>

      <div className="w-full flex flex-col h-full z-10 relative">
        <Header 
          processedFrames={summary?.processed_frames}
          detectionsFound={summary?.detections_found}
        />

        {/* Main chat container */}
        <div className="flex-1 mx-auto w-full max-w-4xl flex flex-col px-6 overflow-hidden mt-4">
          <div className="flex-1 flex flex-col min-h-0 relative">
            {/* Scrollable messages container */}
            <div
              className="space-y-6 p-6 flex-1 overflow-y-auto min-h-0 hide-scrollbar bg-slate-950/60 backdrop-blur-md rounded-2xl border border-white/5"
              style={{
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}
            >
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-4 animate-fade-in">
                  <div className="h-20 w-20 rounded-2xl bg-slate-800/50 flex items-center justify-center border border-white/5 shadow-xl">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      className="h-10 w-10 text-indigo-400"
                    >
                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                      <line x1="21" x2="9" y1="12" y2="12" />
                      <path d="M21 12l-5-5" />
                      <path d="M21 12l-5 5" />
                    </svg>
                  </div>
                  <div className="text-center">
                    <h3 className="text-xl font-semibold text-slate-200 mb-2">Welcome to Sherlocked</h3>
                    <p className="text-sm">Upload a video to start your investigation.</p>
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  id={msg.id}
                  role={msg.role}
                  content={msg.content}
                  frames={msg.frames}
                  timestamp={msg.timestamp}
                  onFrameClick={(frame) => setLightboxFrame(frame)}
                />
              ))}

              {/* Auto-scroll anchor */}
              <div ref={messagesEndRef} />

              {isProcessing && (
                <div className="flex items-center gap-3 animate-slide-up pl-2">
                  <div className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-slate-800/80 border border-white/5">
                    <div className="h-5 w-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                  </div>
                  <div className="text-sm text-slate-400 font-medium">Processing footage...</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Input Area */}
        <div className="w-full max-w-4xl mx-auto p-6 pb-8">
          <ChatInput
            input={input}
            setInput={setInput}
            onSubmit={(e) => handleSubmit(e as unknown as React.FormEvent<HTMLFormElement>)}
            onUploadClick={onUploadButtonClick}
            isProcessing={isProcessing}
            hasResults={results.length > 0}
          />
          
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={onFileSelected}
          />
        </div>
      </div>

      {/* Lightbox */}
      {lightboxFrame && (
        <Lightbox 
          frame={lightboxFrame} 
          onClose={() => setLightboxFrame(null)} 
        />
      )}
    </main>
  );
}
