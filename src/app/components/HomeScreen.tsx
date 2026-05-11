import { useState } from 'react';
import { CheckCircle2, Clock, Calendar, Plus } from 'lucide-react';
import type { Screen, Child } from '../App';

interface HomeScreenProps {
  onNavigate: (screen: Screen) => void;
  children: Child[];
}

export default function HomeScreen({ onNavigate, children }: HomeScreenProps) {
  const [selectedChild, setSelectedChild] = useState<string>('all');

  const mockTodos = children.length > 0 ? [
    {
      id: '1',
      title: '미술 준비물 가져가기',
      childId: children[0].id,
      childName: children[0].name,
      category: '준비물',
      dueDate: '오늘',
      completed: false
    },
    ...(children.length > 1 ? [{
      id: '2',
      title: '수학 숙제 하기',
      childId: children[1].id,
      childName: children[1].name,
      category: '숙제',
      dueDate: '내일',
      completed: false
    }] : [])
  ] : [];

  const mockEvents = children.length > 0 ? [
    {
      id: '1',
      title: '학부모 상담',
      date: '5월 15일',
      time: '오후 2시',
      childId: children[0].id,
      childName: children[0].name
    }
  ] : [];

  const filteredTodos = selectedChild === 'all'
    ? mockTodos
    : mockTodos.filter(todo => todo.childId === selectedChild);

  const filteredEvents = selectedChild === 'all'
    ? mockEvents
    : mockEvents.filter(event => event.childId === selectedChild);

  if (children.length === 0) {
    return (
      <div className="min-h-[calc(100vh-80px)] flex flex-col items-center justify-center p-8">
        <div className="max-w-md w-full space-y-8 text-center">
          <div className="flex justify-center">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center">
              <Plus className="w-10 h-10 text-blue-600" />
            </div>
          </div>
          <div className="space-y-3">
            <h2>아이를 먼저 등록해주세요</h2>
            <p className="text-gray-500">
              아이를 등록하면 알림장 내용을<br />
              아이별로 정리해드릴게요
            </p>
          </div>
          <button
            onClick={() => onNavigate('add-child')}
            className="w-full bg-blue-600 text-white rounded-2xl py-4 px-6 hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" />
            아이 등록하기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-6">
      <div className="space-y-4 pt-4">
        <div className="space-y-2">
          <h1>{filteredTodos.length > 0 ? '오늘 챙길 준비물이 있어요' : '오늘은 챙길 준비물이 없어요'}</h1>
          <p className="text-gray-500">아이들의 알림장을 확인해보세요</p>
        </div>

        {children.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2">
            <button
              onClick={() => setSelectedChild('all')}
              className={`px-4 py-2 rounded-xl whitespace-nowrap transition-colors ${
                selectedChild === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              전체
            </button>
            {children.map((child) => (
              <button
                key={child.id}
                onClick={() => setSelectedChild(child.id)}
                className={`px-4 py-2 rounded-xl whitespace-nowrap transition-colors ${
                  selectedChild === child.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {child.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3>오늘 할 일</h3>
          <span className="text-sm text-gray-500">{filteredTodos.length}개</span>
        </div>

        {filteredTodos.length > 0 ? (
          <div className="space-y-3">
            {filteredTodos.map((todo) => (
              <div
                key={todo.id}
                className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-3">
                  <button className="mt-1 flex-shrink-0">
                    <div className="w-6 h-6 border-2 border-gray-300 rounded-full hover:border-blue-500 transition-colors"></div>
                  </button>
                  <div className="flex-1 space-y-1">
                    <p>{todo.title}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs">
                        {todo.category}
                      </span>
                      <span className="text-xs text-gray-500">{todo.childName}</span>
                      <span className="text-xs text-gray-500">• {todo.dueDate}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-2xl p-8 text-center space-y-4">
            <p className="text-gray-500">아직 정리된 알림장이 없어요</p>
            <p className="text-sm text-gray-400">알림장 사진을 올리면 준비물과 일정을 정리해드릴게요</p>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3>다가오는 일정</h3>
        </div>

        {filteredEvents.length > 0 ? (
          <div className="space-y-3">
            {filteredEvents.map((event) => (
              <div
                key={event.id}
                className="bg-white border border-gray-200 rounded-2xl p-4 space-y-2 hover:shadow-md transition-shadow"
              >
                <p>{event.title}</p>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {event.date}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {event.time}
                  </span>
                </div>
                <span className="text-xs text-gray-500">{event.childName}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-2xl p-8 text-center space-y-2">
            <p className="text-gray-500">다가오는 일정이 없어요</p>
          </div>
        )}
      </div>

      <button
        onClick={() => onNavigate('upload')}
        className="w-full bg-blue-600 text-white rounded-2xl py-4 px-6 hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
      >
        <Plus className="w-5 h-5" />
        알림장 올리기
      </button>
    </div>
  );
}
