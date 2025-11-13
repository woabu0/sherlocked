// app/page.tsx
'use client';

import { useState, useCallback, useRef } from 'react';
import {
  Detection,
  DetectionResult,
  DetectionSummary,
  ProcessVideoResponse,
} from '@/types';

const MIN_CONFIDENCE = 0.6;
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
const STOPWORDS = new Set([
  'find',
  'show',
  'frame',
  'frames',
  'with',
  'please',
  'can',
  'you',
  'the',
  'a',
  'an',
  'any',
  'all',
  'of',
  'for',
  'look',
  'search',
  'detect',
  'spot',
  'every',
  'and',
  'to',
  'in',
  'on',
  'at',
  'video',
  'footage',
  'frames',
  'objects',
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
  role: 'assistant' | 'user';
  content?: string;
  frames?: FrameMatch[];
};

const formatTimestamp = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export default function Home() {
  const [results, setResults] = useState<DetectionResult[]>([]);
  const [summary, setSummary] = useState<DetectionSummary | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: Date.now(),
      role: 'assistant',
      content:
        '👋 Tap the camera icon to upload a video. I’ll slice it into frames, then you can ask in natural language what to find.',
    },
  ]);
  const [input, setInput] = useState('');
  const [lightboxFrame, setLightboxFrame] = useState<FrameMatch | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const appendMessage = useCallback(
    (role: 'assistant' | 'user', content?: string, frames?: FrameMatch[]) => {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + Math.random(),
          role,
          content,
          frames,
        },
      ]);
    },
    []
  );

  const handleLog = useCallback(
    (message: string, role: 'assistant' | 'system' = 'assistant') => {
      appendMessage(role === 'system' ? 'assistant' : role, message);
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
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: text }),
        });

        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data.targets)) {
            const targets = data.targets
              .map((target: unknown) =>
                typeof target === 'string' ? target.trim().toLowerCase() : ''
              )
              .filter((target: string) => target && !STOPWORDS.has(target));
            if (targets.length) {
              return Array.from(new Set(targets));
            }
          }
        }
      } catch (error) {
        console.error('Intent parsing failed:', error);
        handleLog('I had trouble interpreting that. I will fall back to keywords.', 'assistant');
      }

      const fallback = (text.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? []).filter(
        (word) => !STOPWORDS.has(word)
      );
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
        `Uploading “${file.name}” (${(file.size / (1024 * 1024)).toFixed(2)} MB). Sit tight while I extract frames…`,
        'assistant'
      );

      const formData = new FormData();
      formData.append('file', file);

      try {
        const response = await fetch(`${BACKEND_URL}/api/process-video`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          let errorDetail = 'Failed to process video';
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
          throw new Error(data.error || 'Processing failed');
        }

        setResults(data.results ?? []);
        setSummary(data.summary ?? null);

        if (data.summary) {
          handleLog(
            `Done! Processed ${data.summary.processed_frames} frames in ${data.summary.duration_seconds.toFixed(
              1
            )}s. Ask me which objects to pull up.`,
            'assistant'
          );
        } else {
          handleLog('Video processed. Ready for queries.', 'assistant');
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Error processing video. Please try again.';
        handleLog(message, 'assistant');
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
      if (!file.type.startsWith('video/')) {
        alert('Please select a valid video file (MP4, AVI, MOV, etc.).');
        event.target.value = '';
        return;
      }
      if (file.size > 500 * 1024 * 1024) {
        alert('Video file too large. Please select a file smaller than 500MB.');
        event.target.value = '';
        return;
      }
      void processVideo(file);
      event.target.value = '';
    },
    [processVideo]
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const message = input.trim();
      if (!message) return;

      appendMessage('user', message);
      setInput('');

      if (!results.length) {
        appendMessage(
          'assistant',
          'Please upload a video first so I can extract frames before searching for objects.'
        );
        return;
      }

      if (isProcessing) {
        appendMessage('assistant', 'Hang on—your footage is still being processed.');
        return;
      }

      const targets = await interpretQuery(message);

      if (!targets.length) {
        appendMessage(
          'assistant',
          "I'm not sure what objects to look for there. Try mentioning the items explicitly."
        );
        return;
      }

      const matches = findMatchingFrames(targets);

      if (!matches.length) {
        appendMessage(
          'assistant',
          `I searched for ${targets.join(', ')} but couldn't spot them in this footage.`
        );
        return;
      }

      const matchedLabels = Array.from(
        new Set(matches.flatMap((frame) => frame.objects.map((obj) => obj.class.toLowerCase())))
      );

      const summaryLine = `Here ${matches.length > 1 ? 'are' : 'is'} ${matches.length} frame${
        matches.length > 1 ? 's' : ''
      } showing ${matchedLabels.join(', ')}.`;

      appendMessage('assistant', summaryLine, matches);
    },
    [appendMessage, findMatchingFrames, input, interpretQuery, isProcessing, results.length]
  );

  return (
    <main className="relative min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-10 pb-52">
        <header className="space-y-4 text-center lg:text-left">
          <div className="inline-flex items-center gap-2 self-start rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-emerald-200">
            Sherlocked Vision
          </div>
          <h1 className="text-4xl font-bold text-slate-50">Video Object Detective</h1>
          <p className="text-sm text-slate-400 max-w-2xl">
            Upload surveillance footage, let the model slice it into frames, then ask in natural
            language for any objects to track. Only detections with at least 60% confidence are shown.
          </p>
        </header>

        {summary ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryTile
              label="Frames Processed"
              value={summary.processed_frames.toString()}
              description={`${summary.frame_interval_seconds}s sampling`}
            />
            <SummaryTile
              label="Detections Found"
              value={summary.detections_found.toString()}
              description={`${summary.processed_frames} frames checked`}
            />
            <SummaryTile
              label="Target Hits"
              value={summary.target_hits.toString()}
              description={summary.target_object ? summary.target_object : 'Awaiting query'}
            />
            <SummaryTile
              label="Video Duration"
              value={formatTimestamp(summary.duration_seconds)}
              description={`${Math.round(summary.fps)} FPS`}
            />
          </div>
        ) : (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-400">
            Upload a video to generate summary metrics. After processing, you can ask for objects using
            everyday language like “Find the person holding a laptop”.
          </div>
        )}

        <div className="flex-1">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 backdrop-blur shadow-2xl shadow-black/40">
            <div
              className="scrollbar-thin max-h-[68vh] overflow-y-auto px-6 py-8 space-y-4"
              style={{ maxHeight: 'calc(100vh - 260px)' }}
            >
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.role === 'assistant' ? 'justify-start' : 'justify-end'
                  }`}
                >
                  <div
                    className={`w-full max-w-[85%] rounded-3xl px-5 py-4 text-sm leading-relaxed shadow-lg ${
                      message.role === 'assistant'
                        ? 'bg-slate-800/80 text-slate-100 border border-slate-700/70'
                        : 'bg-emerald-500 text-slate-950 font-semibold'
                    }`}
                  >
                    {message.content && <p>{message.content}</p>}

                    {message.frames && message.frames.length > 0 && (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {message.frames.map((frame) => (
                          <button
                            key={`${frame.frameIndex}-${frame.timestamp}`}
                            type="button"
                            onClick={() => setLightboxFrame(frame)}
                            className="group relative overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/60 transition-transform hover:-translate-y-1"
                          >
                            {frame.image ? (
                              <img
                                src={`data:image/jpeg;base64,${frame.image}`}
                                alt={`Frame ${frame.frameIndex}`}
                                className="h-40 w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-40 w-full items-center justify-center bg-slate-800 text-xs text-slate-400">
                                No preview available
                              </div>
                            )}
                            <div className="absolute inset-0 bg-linear-to-t from-slate-950/80 via-transparent" />
                            <div className="absolute left-3 bottom-3 flex items-center gap-2 text-xs font-semibold text-emerald-200">
                              <span className="rounded-full bg-slate-950/70 px-2 py-1">
                                {frame.timestampFormatted}
                              </span>
                              <span className="rounded-full bg-slate-950/40 px-2 py-1">
                                Frame #{frame.frameIndex}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none fixed bottom-6 left-1/2 z-40 w-full max-w-3xl -translate-x-1/2 px-4">
        <form onSubmit={handleSubmit} className="pointer-events-auto">
          <div className="flex items-end gap-3 rounded-3xl border border-slate-700/70 bg-slate-900/90 px-4 py-3 shadow-xl shadow-emerald-500/10 backdrop-blur">
            <button
              type="button"
              onClick={onUploadButtonClick}
              className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-700/70 bg-slate-900/60 text-slate-200 transition-colors hover:border-emerald-400 hover:text-emerald-300 disabled:opacity-60"
              disabled={isProcessing}
              aria-label="Upload video"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                className="h-5 w-5"
              >
                <path d="M3 7h2l2-3h6l2 3h2a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3z" />
                <path d="m10 12 2 2 3-3" />
              </svg>
            </button>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                isProcessing
                  ? 'Processing video… hang tight.'
                  : 'Ask me things like “Find a person holding a laptop”'
              }
              rows={1}
              className="max-h-32 flex-1 resize-none bg-transparent text-base text-slate-100 placeholder:text-slate-500 focus:outline-none"
            />

            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={onFileSelected}
            />

            <button
              type="submit"
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-slate-950 transition-colors hover:bg-emerald-400 disabled:opacity-60"
              disabled={isProcessing && !results.length}
              aria-label="Send message"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                className="h-5 w-5"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </button>
          </div>
        </form>
      </div>

      {lightboxFrame && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
          <div className="relative w-full max-w-4xl space-y-4">
            <button
              type="button"
              onClick={() => setLightboxFrame(null)}
              className="absolute -right-2 -top-2 flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-slate-200 shadow-lg hover:bg-slate-800"
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
                <span className="rounded-full bg-slate-800/80 px-3 py-1 text-xs font-semibold text-emerald-200">
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
                    className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200"
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

function SummaryTile({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 shadow-inner shadow-black/30">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-100">{value}</p>
      {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
    </div>
  );
}