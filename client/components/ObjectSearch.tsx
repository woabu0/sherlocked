// components/ObjectSearch.tsx
'use client';
import { useMemo } from 'react';
import { DetectionResult } from '@/types';

interface ObjectSearchProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  minConfidence: number;
  onConfidenceChange: (confidence: number) => void;
  results: DetectionResult[];
}

export default function ObjectSearch({
  searchTerm,
  onSearchChange,
  minConfidence,
  onConfidenceChange,
  results,
}: ObjectSearchProps) {
  const objectTypes = useMemo(() => {
    const types = new Set<string>();
    results.forEach(result => {
      result.objects.forEach(obj => types.add(obj.class));
    });
    return Array.from(types).sort();
  }, [results]);

  return (
    <div className="bg-gray-50 rounded-lg p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Search Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Search Objects
          </label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="e.g., watch, pen, person..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Confidence Slider */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Minimum Confidence: {(minConfidence * 100).toFixed(0)}%
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={minConfidence}
            onChange={(e) => onConfidenceChange(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
          />
        </div>
      </div>

      {/* Object Type Tags */}
      {objectTypes.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Quick Search:
          </label>
          <div className="flex flex-wrap gap-2">
            {objectTypes.map((type) => (
              <button
                key={type}
                onClick={() => onSearchChange(type)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  searchTerm === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}