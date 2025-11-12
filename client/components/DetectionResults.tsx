// components/DetectionResults.tsx
'use client';
import { useState, useMemo } from 'react';
import { DetectionResult } from '@/types';
import ObjectSearch from './ObjectSearch';

interface DetectionResultsProps {
  results: DetectionResult[];
  isProcessing: boolean;
}

export default function DetectionResults({ results, isProcessing }: DetectionResultsProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [minConfidence, setMinConfidence] = useState(0.3);

  const filteredResults = useMemo(() => {
    return results.filter(result =>
      result.objects.some(obj =>
        obj.class.toLowerCase().includes(searchTerm.toLowerCase()) &&
        obj.confidence >= minConfidence
      )
    );
  }, [results, searchTerm, minConfidence]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isProcessing) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Processing video footage...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Detection Results</h2>
          <p className="text-gray-600">
            Found {filteredResults.length} instances across {results.length} timestamps
          </p>
        </div>
      </div>

      {/* Search and Filter */}
      <ObjectSearch
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        minConfidence={minConfidence}
        onConfidenceChange={setMinConfidence}
        results={results}
      />

      {/* Results Grid */}
      <div className="grid gap-4">
        {filteredResults.map((result, index) => (
          <div
            key={index}
            className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex justify-between items-start mb-3">
              <span className="font-semibold text-lg text-blue-600">
                {formatTime(result.timestamp)}
              </span>
              <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                {result.objects.length} objects
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {result.objects.map((obj, objIndex) => (
                <div
                  key={objIndex}
                  className="flex justify-between items-center p-3 bg-gray-50 rounded-lg"
                >
                  <span className="font-medium text-gray-800 capitalize">
                    {obj.class}
                  </span>
                  <span
                    className={`px-2 py-1 rounded text-sm font-medium ${
                      obj.confidence > 0.7
                        ? 'bg-green-100 text-green-800'
                        : obj.confidence > 0.5
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {(obj.confidence * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {filteredResults.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No objects found matching your criteria
        </div>
      )}
    </div>
  );
}