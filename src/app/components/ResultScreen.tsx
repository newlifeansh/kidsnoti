import { Calendar, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { Screen } from '../App';

interface ResultScreenProps {
  onNavigate: (screen: Screen) => void;
}

export default function ResultScreen({ onNavigate }: ResultScreenProps) {
  const mockCalendarEvents = [
    {
      id: '1',
      title: '학부모 상담',
      date: '5월 15일',
      time: '오후 2시',
      child: '민준',
      location: '3학년 2반 교실'
    }
  ];

  const mockTodos = [
    {
      id: '1',
      title: '미술 준비물 가져가기',
      category: '준비물',
      dueDate: '5월 12일',
      child: '민준',
      items: '도화지, 크레파스, 물감'
    },
    {
      id: '2',
      title: '수학 숙제 하기',
      category: '숙제',
      dueDate: '5월 13일',
      child: '서연',
      items: '수학 익힘책 15~17쪽'
    },
    {
      id: '3',
      title: '체험학습 동의서 제출',
      category: '제출물',
      dueDate: '5월 14일',
      child: '민준',
      needsCheck: true
    }
  ];

  const handleSave = () => {
    onNavigate('home');
  };

  return (
    <div className="p-5 space-y-6 pb-8">
      <div className="space-y-2 pt-4">
        <h1>이렇게 정리했어요</h1>
        <p className="text-gray-500">틀린 내용이 있으면 저장하기 전에 수정할 수 있어요.</p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3>캘린더 일정</h3>
          <span className="text-sm text-gray-500">{mockCalendarEvents.length}개</span>
        </div>

        {mockCalendarEvents.map((event) => (
          <div
            key={event.id}
            className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3"
          >
            <div className="flex items-start justify-between">
              <p>{event.title}</p>
              <span className="px-2 py-1 bg-green-100 text-green-700 rounded-lg text-xs whitespace-nowrap">
                캘린더 저장 예정
              </span>
            </div>
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>{event.date}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>{event.time}</span>
              </div>
              {event.location && (
                <div className="flex items-center gap-2">
                  <span>📍</span>
                  <span>{event.location}</span>
                </div>
              )}
            </div>
            <span className="text-xs text-gray-500">{event.child}</span>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3>할 일</h3>
          <span className="text-sm text-gray-500">{mockTodos.length}개</span>
        </div>

        {mockTodos.map((todo) => (
          <div
            key={todo.id}
            className={`bg-white border rounded-2xl p-4 space-y-3 ${
              todo.needsCheck ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p>{todo.title}</p>
              {todo.needsCheck && (
                <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs whitespace-nowrap flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  확인 필요
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs">
                {todo.category}
              </span>
              <span className="text-xs text-gray-500">{todo.child}</span>
              <span className="text-xs text-gray-500">• {todo.dueDate}</span>
            </div>
            {todo.items && (
              <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{todo.items}</p>
            )}
          </div>
        ))}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm text-blue-900">총 {mockCalendarEvents.length}개 일정과 {mockTodos.length}개 할 일을 찾았어요.</p>
          <p className="text-xs text-blue-700">확인 후 저장하면 구글 캘린더와 할 일 목록에 추가됩니다.</p>
        </div>
      </div>

      <div className="space-y-3">
        <button
          onClick={handleSave}
          className="w-full bg-blue-600 text-white rounded-2xl py-4 px-6 hover:bg-blue-700 transition-colors"
        >
          확인하고 저장하기
        </button>
        <button
          onClick={() => onNavigate('upload')}
          className="w-full bg-white text-gray-700 border border-gray-300 rounded-2xl py-4 px-6 hover:bg-gray-50 transition-colors"
        >
          다시 분석하기
        </button>
      </div>
    </div>
  );
}
