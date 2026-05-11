import { useState } from 'react';
import { CheckCircle2, Circle, Plus } from 'lucide-react';
import type { Screen, Child } from '../App';

interface TodoListScreenProps {
  onNavigate: (screen: Screen) => void;
  children: Child[];
}

export default function TodoListScreen({ onNavigate, children }: TodoListScreenProps) {
  const [filter, setFilter] = useState<'all' | 'today' | 'tomorrow' | 'week'>('all');
  const [selectedChild, setSelectedChild] = useState<string>('all');

  const [todos, setTodos] = useState(
    children.length > 0
      ? [
          {
            id: '1',
            title: '미술 준비물 가져가기',
            childId: children[0].id,
            childName: children[0].name,
            category: '준비물',
            dueDate: '오늘',
            completed: false,
            items: '도화지, 크레파스, 물감'
          },
          ...(children.length > 1
            ? [
                {
                  id: '2',
                  title: '수학 숙제 하기',
                  childId: children[1].id,
                  childName: children[1].name,
                  category: '숙제',
                  dueDate: '내일',
                  completed: false,
                  items: '수학 익힘책 15~17쪽'
                },
                {
                  id: '3',
                  title: '체험학습 동의서 제출',
                  childId: children[0].id,
                  childName: children[0].name,
                  category: '제출물',
                  dueDate: '5월 14일',
                  completed: false
                },
                {
                  id: '4',
                  title: '영어 단어 외우기',
                  childId: children[1].id,
                  childName: children[1].name,
                  category: '숙제',
                  dueDate: '5월 15일',
                  completed: true
                }
              ]
            : [])
        ]
      : []
  );

  const toggleTodo = (id: string) => {
    setTodos(
      todos.map((todo) => (todo.id === id ? { ...todo, completed: !todo.completed } : todo))
    );
  };

  let filteredByChild = selectedChild === 'all' ? todos : todos.filter((todo) => todo.childId === selectedChild);

  const activeTodos = filteredByChild.filter((todo) => !todo.completed);
  const completedTodos = filteredByChild.filter((todo) => todo.completed);

  const filterButtons = [
    { key: 'all' as const, label: '전체' },
    { key: 'today' as const, label: '오늘' },
    { key: 'tomorrow' as const, label: '내일' },
    { key: 'week' as const, label: '이번 주' }
  ];

  return (
    <div className="p-5 space-y-6">
      <div className="space-y-4 pt-4">
        <h1>할 일</h1>

        {children.length > 0 && (
          <div className="space-y-3">
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

            <div className="flex gap-2 overflow-x-auto pb-2">
              {filterButtons.map((btn) => (
                <button
                  key={btn.key}
                  onClick={() => setFilter(btn.key)}
                  className={`px-3 py-1.5 text-sm rounded-lg whitespace-nowrap transition-colors ${
                    filter === btn.key
                      ? 'bg-gray-900 text-white'
                      : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-6">
        {activeTodos.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3>해야 할 일</h3>
              <span className="text-sm text-gray-500">{activeTodos.length}개</span>
            </div>

            <div className="space-y-3">
              {activeTodos.map((todo) => (
                <div
                  key={todo.id}
                  className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleTodo(todo.id)}
                      className="mt-1 flex-shrink-0"
                    >
                      <Circle className="w-6 h-6 text-gray-300 hover:text-blue-500 transition-colors" />
                    </button>
                    <div className="flex-1 space-y-2">
                      <p>{todo.title}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs">
                          {todo.category}
                        </span>
                        <span className="text-xs text-gray-500">{todo.childName}</span>
                        <span className="text-xs text-gray-500">• {todo.dueDate}</span>
                      </div>
                      {todo.items && (
                        <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                          {todo.items}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {completedTodos.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3>완료한 일</h3>
              <span className="text-sm text-gray-500">{completedTodos.length}개</span>
            </div>

            <div className="space-y-3">
              {completedTodos.map((todo) => (
                <div
                  key={todo.id}
                  className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3 opacity-60"
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleTodo(todo.id)}
                      className="mt-1 flex-shrink-0"
                    >
                      <CheckCircle2 className="w-6 h-6 text-blue-600" />
                    </button>
                    <div className="flex-1 space-y-2">
                      <p className="line-through">{todo.title}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs">
                          {todo.category}
                        </span>
                        <span className="text-xs text-gray-500">{todo.childName}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTodos.length === 0 && completedTodos.length === 0 && (
          <div className="bg-gray-50 rounded-2xl p-12 text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-gray-400" />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-gray-900">아직 할 일이 없어요</p>
              <p className="text-sm text-gray-500">
                알림장을 올리면 준비물과 숙제를 정리해드릴게요.
              </p>
            </div>
            <button
              onClick={() => onNavigate('upload')}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              알림장 올리기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
