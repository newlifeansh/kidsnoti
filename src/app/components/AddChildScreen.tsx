import { useState } from 'react';
import type { Screen, Child } from '../App';

interface AddChildScreenProps {
  onNavigate: (screen: Screen) => void;
  onAddChild: (child: Child) => void;
  hasChildren?: boolean;
}

export default function AddChildScreen({ onNavigate, onAddChild, hasChildren = false }: AddChildScreenProps) {
  const [name, setName] = useState('');
  const [school, setSchool] = useState('');
  const [grade, setGrade] = useState('');
  const [classNum, setClassNum] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      alert('아이 이름을 입력해주세요');
      return;
    }

    const newChild: Child = {
      id: Date.now().toString(),
      name: name.trim(),
      school: school.trim() || undefined,
      grade: grade.trim() || undefined,
      class: classNum.trim() || undefined,
      notificationTime: '전날 오후 8시'
    };

    onAddChild(newChild);
  };

  return (
    <div className="p-5 space-y-6">
      <div className="space-y-2 pt-4">
        <h1>아이 정보를 등록해주세요</h1>
        <p className="text-gray-500">아이별로 알림장을 관리할 수 있어요</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-gray-700">
              아이 이름 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예) 민준"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              maxLength={20}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-gray-700">학교/기관명</label>
            <input
              type="text"
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              placeholder="예) 서울초등학교"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm text-gray-700">학년</label>
              <input
                type="text"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                placeholder="예) 3학년"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-gray-700">반</label>
              <input
                type="text"
                value={classNum}
                onChange={(e) => setClassNum(e.target.value)}
                placeholder="예) 2반"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <span className="text-lg">💡</span>
            <div className="space-y-1">
              <p className="text-sm text-blue-900">기본 알림 시간은 전날 오후 8시로 설정돼요</p>
              <p className="text-xs text-blue-700">나중에 아이 관리에서 변경할 수 있어요</p>
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-4">
          <button
            type="submit"
            className="w-full bg-blue-600 text-white rounded-2xl py-4 px-6 hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            disabled={!name.trim()}
          >
            아이 등록하기
          </button>
          {hasChildren && (
            <button
              type="button"
              onClick={() => onNavigate('child')}
              className="w-full bg-white text-gray-700 border border-gray-300 rounded-2xl py-4 px-6 hover:bg-gray-50 transition-colors"
            >
              취소
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
