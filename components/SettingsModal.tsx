import React, { useState, useEffect } from 'react';
import { Button } from './Button';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  autoCloseOnSave?: boolean;
}

const API_KEY_STORAGE_KEY = 'nanoBananaApiKey';

export const getStoredApiKey = (): string | null => {
  return localStorage.getItem(API_KEY_STORAGE_KEY);
};

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, autoCloseOnSave = false }) => {
  const [apiKey, setApiKey] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const storedKey = getStoredApiKey();
      if (storedKey) {
        setApiKey(storedKey);
        setIsSaved(true);
      }
    }
  }, [isOpen]);

  const handleSave = () => {
    if (apiKey.trim()) {
      localStorage.setItem(API_KEY_STORAGE_KEY, apiKey.trim());
      setIsSaved(true);
      // autoCloseOnSave가 true면 저장 후 모달 닫기
      if (autoCloseOnSave) {
        setTimeout(() => {
          onClose();
        }, 300); // 저장 완료 메시지 표시 후 닫기
      }
    }
  };

  const handleClear = () => {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
    setApiKey('');
    setIsSaved(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <span>⚙️</span> API 설정
          </h2>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          {/* API 키 입력 섹션 */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              🔑 Nano Banana API Key
            </label>
            <div className="relative">
              <input 
                type={showKey ? "text" : "password"}
                className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 pr-20"
                placeholder="API 키를 입력하세요"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setIsSaved(false);
                }}
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm"
              >
                {showKey ? '숨기기' : '보기'}
              </button>
            </div>
            {isSaved && (
              <p className="text-green-600 text-sm mt-2 flex items-center gap-1">
                ✅ 저장됨
              </p>
            )}
          </div>

          {/* 발급 방법 안내 */}
          <div className="bg-purple-50 border border-purple-100 rounded-lg p-4">
            <h3 className="text-purple-800 font-bold mb-3 flex items-center gap-2">
              📋 API 키 발급 방법
            </h3>
            <ol className="text-purple-700 text-sm space-y-2 list-decimal list-inside">
              <li>
                <a 
                  href="https://kie.ai" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-purple-600 underline hover:text-purple-800 font-medium"
                >
                  kie.ai
                </a>
                {" "}사이트에 접속하여 회원가입/로그인
              </li>
              <li>
                <a 
                  href="https://kie.ai/api-key" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-purple-600 underline hover:text-purple-800 font-medium"
                >
                  API Key 관리 페이지
                </a>
                {" "}로 이동
              </li>
              <li>새 API Key 생성 버튼 클릭</li>
              <li>생성된 키를 복사하여 위에 붙여넣기</li>
            </ol>
          </div>

          {/* 요금 안내 */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
            <h3 className="text-blue-800 font-bold mb-2 flex items-center gap-2">
              💰 이미지 생성 요금
            </h3>
            <ul className="text-blue-700 text-sm space-y-1">
              <li>• <strong>Nano Banana:</strong> 이미지 1장당 $0.02 (약 27원)</li>
              <li>• <strong>Nano Banana Pro:</strong> 이미지 1장당 $0.09~0.12</li>
              <li>• 상세페이지 1건 (12장): 약 $0.24 (약 320원)</li>
            </ul>
          </div>

          {/* 버튼들 */}
          <div className="flex gap-3">
            <Button 
              onClick={handleSave} 
              disabled={!apiKey.trim() || isSaved}
              className="flex-1 bg-purple-600 hover:bg-purple-700"
            >
              저장
            </Button>
            <Button 
              onClick={handleClear} 
              variant="secondary"
              className="flex-1"
            >
              초기화
            </Button>
          </div>
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
          <Button onClick={onClose} variant="secondary" className="text-sm">
            닫기
          </Button>
        </div>
      </div>
    </div>
  );
};
