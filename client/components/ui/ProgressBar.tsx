// components/UI/ProgressBar.tsx
interface ProgressBarProps {
    value: number;
    max: number;
  }
  
  export default function ProgressBar({ value, max }: ProgressBarProps) {
    const percentage = (value / max) * 100;
  
    return (
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    );
  }