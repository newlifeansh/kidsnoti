import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { Screen } from '../App';

interface AnalyzingScreenProps {
  onNavigate: (screen: Screen) => void;
}

export default function AnalyzingScreen({ onNavigate }: AnalyzingScreenProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    '알림장을 읽고 있어요',
    '날짜와 준비물을 찾고 있어요',
    '캘린더 일정과 할 일을 나누고 있어요'
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev < steps.length - 1) {
          return prev + 1;
        }
        return prev;
      });
    }, 1500);

    const timeout = setTimeout(() => {
      onNavigate('result');
    }, 5000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [onNavigate]);

  return (
    <div className="min-h-[calc(100vh-160px)] flex flex-col items-center justify-center p-5 space-y-8">
      <div className="space-y-6 text-center">
        <div className="flex justify-center">
          <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
          </div>
        </div>

        <div className="space-y-2">
          <h2>{steps[currentStep]}</h2>
          <p className="text-gray-500">잠시만 기다려주세요</p>
        </div>
      </div>

      <div className="w-full max-w-sm space-y-3">
        {steps.map((step, index) => (
          <div
            key={index}
            className={`flex items-center gap-3 p-4 rounded-xl transition-all ${
              index === currentStep
                ? 'bg-blue-50 border border-blue-200'
                : index < currentStep
                ? 'bg-gray-50'
                : 'bg-white border border-gray-200'
            }`}
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                index < currentStep
                  ? 'bg-blue-600 text-white'
                  : index === currentStep
                  ? 'bg-blue-100 border-2 border-blue-600'
                  : 'bg-gray-200'
              }`}
            >
              {index < currentStep && (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path d="M5 13l4 4L19 7"></path>
                </svg>
              )}
            </div>
            <span
              className={`text-sm ${
                index <= currentStep ? 'text-gray-900' : 'text-gray-400'
              }`}
            >
              {step}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
