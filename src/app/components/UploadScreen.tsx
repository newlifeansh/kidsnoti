import { useState } from 'react';
import { Upload, Image as ImageIcon, X } from 'lucide-react';
import type { Screen } from '../App';

interface UploadScreenProps {
  onNavigate: (screen: Screen) => void;
}

export default function UploadScreen({ onNavigate }: UploadScreenProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyze = () => {
    onNavigate('analyzing');
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
  };

  return (
    <div className="p-5 space-y-6">
      <div className="space-y-2 pt-4">
        <h1>알림장 사진을 올려주세요</h1>
        <p className="text-gray-500">사진은 내용을 읽은 뒤 저장하지 않아요.</p>
      </div>

      {!selectedImage ? (
        <label className="block">
          <input
            type="file"
            accept="image/jpeg,image/png"
            onChange={handleImageSelect}
            className="hidden"
          />
          <div className="border-2 border-dashed border-gray-300 rounded-2xl p-12 text-center space-y-4 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors">
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <ImageIcon className="w-8 h-8 text-blue-600" />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-gray-900">사진을 선택해주세요</p>
              <p className="text-sm text-gray-500">JPG, PNG 이미지를 올릴 수 있어요.</p>
            </div>
          </div>
        </label>
      ) : (
        <div className="space-y-4">
          <div className="relative bg-gray-100 rounded-2xl overflow-hidden">
            <img src={selectedImage} alt="선택한 알림장" className="w-full h-auto" />
            <button
              onClick={handleRemoveImage}
              className="absolute top-3 right-3 w-8 h-8 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
            <p className="text-sm text-blue-900">알림장 이미지를 확인했어요.</p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <p className="text-sm text-gray-600">알림장에서 찾을 내용</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-700">📅 일정</div>
          <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-700">📝 준비물</div>
          <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-700">📚 숙제</div>
          <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-700">📋 안내사항</div>
        </div>
      </div>

      <button
        onClick={handleAnalyze}
        disabled={!selectedImage}
        className="w-full bg-blue-600 text-white rounded-2xl py-4 px-6 hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <Upload className="w-5 h-5" />
        알림장 읽기
      </button>
    </div>
  );
}
