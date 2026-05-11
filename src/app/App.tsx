import { useState } from 'react';
import { Home, Upload, CheckCircle2, ListTodo, Users, Settings, ArrowLeft } from 'lucide-react';
import OnboardingScreen from './components/OnboardingScreen';
import HomeScreen from './components/HomeScreen';
import UploadScreen from './components/UploadScreen';
import AnalyzingScreen from './components/AnalyzingScreen';
import ResultScreen from './components/ResultScreen';
import TodoListScreen from './components/TodoListScreen';
import ChildManageScreen from './components/ChildManageScreen';
import AddChildScreen from './components/AddChildScreen';

export type Screen = 'onboarding' | 'home' | 'upload' | 'analyzing' | 'result' | 'todo' | 'child' | 'add-child';

export interface Child {
  id: string;
  name: string;
  school?: string;
  grade?: string;
  class?: string;
  notificationTime?: string;
}

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('onboarding');
  const [children, setChildren] = useState<Child[]>([]);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);

  const handleCompleteOnboarding = () => {
    setHasCompletedOnboarding(true);
    setCurrentScreen('home');
  };

  const handleAddChild = (child: Child) => {
    const newChildren = [...children, child];
    setChildren(newChildren);
    // 첫 아이 등록이면 홈으로, 아니면 아이 관리 화면으로
    if (children.length === 0) {
      setCurrentScreen('home');
    } else {
      setCurrentScreen('child');
    }
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 'onboarding':
        return <OnboardingScreen onComplete={handleCompleteOnboarding} />;
      case 'home':
        return <HomeScreen onNavigate={setCurrentScreen} children={children} />;
      case 'upload':
        return <UploadScreen onNavigate={setCurrentScreen} />;
      case 'analyzing':
        return <AnalyzingScreen onNavigate={setCurrentScreen} />;
      case 'result':
        return <ResultScreen onNavigate={setCurrentScreen} />;
      case 'todo':
        return <TodoListScreen onNavigate={setCurrentScreen} children={children} />;
      case 'child':
        return <ChildManageScreen onNavigate={setCurrentScreen} children={children} />;
      case 'add-child':
        return (
          <AddChildScreen
            onNavigate={setCurrentScreen}
            onAddChild={handleAddChild}
            hasChildren={children.length > 0}
          />
        );
      default:
        return <HomeScreen onNavigate={setCurrentScreen} children={children} />;
    }
  };

  const showBackButton = currentScreen !== 'home' && currentScreen !== 'onboarding';
  const showNav = hasCompletedOnboarding && currentScreen !== 'onboarding';

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center">
      <div className="w-full max-w-[480px] bg-white min-h-screen flex flex-col">
        {showBackButton && (
          <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center gap-3 z-10">
            <button
              onClick={() => setCurrentScreen('home')}
              className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
          </header>
        )}

        <main className={`flex-1 overflow-y-auto ${showNav ? 'pb-20' : ''}`}>
          {renderScreen()}
        </main>

        {showNav && (
          <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white border-t border-gray-200 px-5 py-3">
          <div className="flex justify-around items-center">
            <NavButton
              icon={<Home className="w-6 h-6" />}
              label="홈"
              active={currentScreen === 'home'}
              onClick={() => setCurrentScreen('home')}
            />
            <NavButton
              icon={<Upload className="w-6 h-6" />}
              label="업로드"
              active={currentScreen === 'upload'}
              onClick={() => setCurrentScreen('upload')}
            />
            <NavButton
              icon={<ListTodo className="w-6 h-6" />}
              label="할 일"
              active={currentScreen === 'todo'}
              onClick={() => setCurrentScreen('todo')}
            />
            <NavButton
              icon={<Users className="w-6 h-6" />}
              label="아이"
              active={currentScreen === 'child'}
              onClick={() => setCurrentScreen('child')}
            />
          </div>
        </nav>
        )}
      </div>
    </div>
  );
}

function NavButton({
  icon,
  label,
  active,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 py-2 px-4 rounded-lg transition-colors ${
        active ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {icon}
      <span className="text-xs">{label}</span>
    </button>
  );
}
