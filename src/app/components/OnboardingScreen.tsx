import { Bell, Calendar, CheckCircle2 } from 'lucide-react';

interface OnboardingScreenProps {
  onComplete: () => void;
}

export default function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const features = [
    {
      icon: <span className="text-3xl">📸</span>,
      title: '알림장 사진을 읽어요',
      description: '사진을 올리면 AI가 내용을 자동으로 분석해요'
    },
    {
      icon: <span className="text-3xl">📝</span>,
      title: '준비물과 숙제를 정리해요',
      description: '아이별로 할 일을 체계적으로 관리할 수 있어요'
    },
    {
      icon: <span className="text-3xl">📅</span>,
      title: '중요한 일정은 캘린더에 저장해요',
      description: '구글 캘린더에 자동으로 일정이 추가돼요'
    }
  ];

  return (
    <div className="min-h-screen flex flex-col items-center justify-between p-8 bg-gradient-to-b from-blue-50 to-white">
      <div className="flex-1 flex flex-col items-center justify-center space-y-12 max-w-md w-full">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-600 rounded-3xl mb-4">
            <span className="text-4xl">📚</span>
          </div>
          <h1 className="text-3xl">키즈노티</h1>
          <p className="text-xl text-gray-600">
            알림장을 올리면<br />
            준비물과 일정을 알아서 정리해드려요
          </p>
        </div>

        <div className="space-y-6 w-full">
          {features.map((feature, index) => (
            <div
              key={index}
              className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
                  {feature.icon}
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg">{feature.title}</h3>
                  <p className="text-sm text-gray-600">{feature.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="w-full max-w-md space-y-3 pb-8">
        <button
          onClick={onComplete}
          className="w-full bg-blue-600 text-white rounded-2xl py-4 px-6 hover:bg-blue-700 transition-colors"
        >
          시작하기
        </button>
        <p className="text-center text-xs text-gray-500">
          시작하기를 누르면 서비스 이용약관에 동의하게 됩니다
        </p>
      </div>
    </div>
  );
}
