import { Plus, Bell, Calendar, ChevronRight } from 'lucide-react';
import type { Screen, Child } from '../App';

interface ChildManageScreenProps {
  onNavigate: (screen: Screen) => void;
  children: Child[];
}

export default function ChildManageScreen({ onNavigate, children }: ChildManageScreenProps) {

  return (
    <div className="p-5 space-y-6">
      <div className="space-y-2 pt-4">
        <h1>아이 정보</h1>
        <p className="text-gray-500">아이별로 알림장을 관리할 수 있어요</p>
      </div>

      {children.length > 0 ? (
        <div className="space-y-4">
          {children.map((child) => (
            <div
              key={child.id}
              className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <h3>{child.name}</h3>
                  <p className="text-sm text-gray-600">
                    {child.school} {child.grade} {child.class}
                  </p>
                </div>
                <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Bell className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-gray-500">알림 시간</p>
                    <p className="text-gray-900">{child.notificationTime || '전날 오후 8시'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-sm">
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-gray-500">구글 캘린더</p>
                    <p className="text-gray-900">연결됨</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-gray-50 rounded-2xl p-12 text-center space-y-4">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center">
              <Plus className="w-8 h-8 text-gray-400" />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-gray-900">아직 등록된 아이가 없어요</p>
            <p className="text-sm text-gray-500">
              아이를 등록하면 알림장 내용을 아이별로 정리할 수 있어요.
            </p>
          </div>
        </div>
      )}

      <button
        onClick={() => onNavigate('add-child')}
        className="w-full bg-blue-600 text-white rounded-2xl py-4 px-6 hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
      >
        <Plus className="w-5 h-5" />
        아이 추가하기
      </button>

      <div className="space-y-4 pt-4 border-t border-gray-200">
        <h3>설정</h3>

        <button className="w-full bg-white border border-gray-200 rounded-2xl p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-left">
              <p>구글 캘린더 연동</p>
              <p className="text-sm text-gray-500">일정을 캘린더에 저장</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400" />
        </button>

        <button className="w-full bg-white border border-gray-200 rounded-2xl p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Bell className="w-5 h-5 text-purple-600" />
            </div>
            <div className="text-left">
              <p>알림 설정</p>
              <p className="text-sm text-gray-500">알림 시간 관리</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400" />
        </button>
      </div>
    </div>
  );
}
