// app/page.tsx
'use client';
import { useState } from 'react';
import VideoUpload from '@/components/VideoUpload';
import DetectionResults from '@/components/DetectionResults';
import { DetectionResult } from '@/types';

export default function Home() {
  const [results, setResults] = useState<DetectionResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Criminal Detection System
          </h1>
          <p className="text-gray-600">
            Upload video footage to detect objects using YOLOv11s
          </p>
        </div>

        {/* Upload Section */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
          <VideoUpload 
            onProcessingChange={setIsProcessing}
            onResults={setResults}
          />
        </div>

        {/* Results Section */}
        {results.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <DetectionResults 
              results={results} 
              isProcessing={isProcessing}
            />
          </div>
        )}
      </div>
    </main>
  );
}