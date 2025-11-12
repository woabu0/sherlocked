// components/VideoUpload.tsx
'use client';
import { useCallback, useState } from 'react';
import { DetectionResult } from '@/types';

interface VideoUploadProps {
  onResults: (results: DetectionResult[]) => void;
  onProcessingChange: (processing: boolean) => void;
}

export default function VideoUpload({ onResults, onProcessingChange }: VideoUploadProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const processVideo = async (file: File) => {
    setIsProcessing(true);
    onProcessingChange(true);
    
    const formData = new FormData();
    formData.append('file', file); // Changed from 'video' to 'file'

    try {
      console.log('Uploading video to backend...', file.name, file.size);
      
      const response = await fetch('http://localhost:8000/api/process-video', {
        method: 'POST',
        body: formData,
        // Let browser set Content-Type automatically with boundary
      });

      console.log('Response status:', response.status);
      
      if (!response.ok) {
        let errorDetail = 'Failed to process video';
        try {
          const errorData = await response.json();
          errorDetail = errorData.detail || errorData.error || errorDetail;
        } catch (e) {
          // If response is not JSON, use status text
          errorDetail = response.statusText;
        }
        throw new Error(errorDetail);
      }

      const data = await response.json();
      console.log('Processing successful:', data);
      onResults(data.results);
      
    } catch (error) {
      console.error('Upload error:', error);
      alert(error instanceof Error ? error.message : 'Error processing video. Please try again.');
    } finally {
      setIsProcessing(false);
      onProcessingChange(false);
    }
  };

  const handleFileSelect = (file: File) => {
    if (file && file.type.startsWith('video/')) {
      // Check file size (optional)
      if (file.size > 500 * 1024 * 1024) { // 500MB limit
        alert('Video file too large. Please select a file smaller than 500MB.');
        return;
      }
      processVideo(file);
    } else {
      alert('Please select a valid video file (MP4, AVI, MOV, etc.)');
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  return (
    <div className="space-y-4">
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
          isDragging 
            ? 'border-blue-500 bg-blue-50' 
            : 'border-gray-300 hover:border-gray-400'
        } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <div className="space-y-4">
          <div className="text-gray-500">
            <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-medium text-gray-900">
              {isProcessing ? 'Processing Video...' : 'Drop video here or click to browse'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Supports MP4, AVI, MOV, MKV files
            </p>
          </div>
          
          {!isProcessing && (
            <>
              <input
                type="file"
                accept="video/*"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                className="hidden"
                id="video-upload"
              />
              <button
                onClick={() => document.getElementById('video-upload')?.click()}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Select Video
              </button>
            </>
          )}
        </div>
      </div>

      {isProcessing && (
        <div className="text-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Processing video... This may take a few minutes.</p>
        </div>
      )}
    </div>
  );
}