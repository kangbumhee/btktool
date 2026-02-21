import React, { useState, useEffect } from 'react';
import { ProductInput } from './components/ProductInput';
import { DetailPagePreview } from './components/DetailPagePreview';
import { SettingsModal, getStoredApiKey } from './components/SettingsModal';
import { AppState, ProductData, GeneratedCopy, HistoryItem } from './types';
import { generateMarketingCopy, generateVariedScenes, generateSingleScene } from './services/geminiService';

const App: React.FC = () => {
  // Key Management State
  const [isKeyReady, setIsKeyReady] = useState<boolean>(false);
  const [isCheckingKey, setIsCheckingKey] = useState<boolean>(true);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [pendingGenerate, setPendingGenerate] = useState<boolean>(false);
  const [pendingProductData, setPendingProductData] = useState<ProductData | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isViewingSharedPage, setIsViewingSharedPage] = useState(false);
  const [sharedPageData, setSharedPageData] = useState<any>(null);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [isMobilePreview, setIsMobilePreview] = useState(false);

  // Undo/Redo를 위한 상태 히스토리
  const [stateHistory, setStateHistory] = useState<AppState[]>([]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(-1);
  const [isUndoRedoAction, setIsUndoRedoAction] = useState(false);

  // App Logic State
  const [state, setState] = useState<AppState>({
    step: 'input',
    productData: { 
      name: '', 
      description: '', 
      targetAudience: '', 
      images: [], 
      selectedModel: 'flash',
      platform: 'coupang',
      price: 0,
      discountRate: 0,
      promotionText: ''
    },
    originalImages: [],
    generatedImages: [],
    mainImageIndex: 0,
    generatedCopy: null,
    isEditingImage: false
  });

  // Check API Key on Mount
  useEffect(() => {
    const checkKey = () => {
      // Check localStorage first (user input)
      const storedKey = getStoredApiKey();
      if (storedKey) {
        setIsKeyReady(true);
        setIsCheckingKey(false);
        return;
      }
      
      // Check environment variable (development)
      const envKey = (import.meta as any).env?.VITE_NANO_BANANA_API_KEY;
      if (envKey) {
        setIsKeyReady(true);
        setIsCheckingKey(false);
        return;
      }
      
      // Legacy check for aistudio environment
      try {
        const win = window as any;
        if (win.aistudio) {
          win.aistudio.hasSelectedApiKey().then((hasKey: boolean) => {
            setIsKeyReady(hasKey);
            setIsCheckingKey(false);
          });
        } else {
          setIsKeyReady(false);
          setIsCheckingKey(false);
        }
      } catch (e) {
        console.error("API Key check failed:", e);
        setIsKeyReady(false);
        setIsCheckingKey(false);
      }
    };
    checkKey();
  }, []);

  // 로딩 타이머
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (state.step === 'processing') {
      setElapsedTime(0); // 시작 시 초기화
      interval = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      setElapsedTime(0); // 로딩 끝나면 초기화
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [state.step]);

  // 히스토리 로드 (앱 시작 시)
  useEffect(() => {
    const savedHistory = localStorage.getItem('detailpage_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error('히스토리 로드 실패:', e);
      }
    }
  }, []);

  // 히스토리 저장 (변경 시) - 용량 초과 방지
  useEffect(() => {
    if (history.length > 0) {
      try {
        // 이미지 URL만 저장 (Base64 제외하여 용량 절약)
        const compactHistory = history.map(item => ({
          ...item,
          generatedImages: item.generatedImages.map(img => ({
            ...img,
            url: img.url.startsWith('data:') ? '' : img.url // Base64는 저장 안함
          })).filter(img => img.url), // 빈 URL 제거
          thumbnail: item.thumbnail?.startsWith('data:') ? '' : item.thumbnail
        }));
        
        localStorage.setItem('detailpage_history', JSON.stringify(compactHistory));
      } catch (e) {
        console.error('히스토리 저장 실패 (용량 초과):', e);
        // 용량 초과 시 오래된 항목 삭제 후 재시도
        if (history.length > 1) {
          setHistory(prev => prev.slice(0, Math.max(1, prev.length - 1)));
        }
      }
    }
  }, [history]);

  // 뷰 페이지 확인
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const viewData = urlParams.get('view');
    
    if (viewData) {
      try {
        // Base64 디코딩
        const decoded = decodeURIComponent(escape(atob(viewData)));
        const parsedData = JSON.parse(decoded);
        
        console.log('공유 페이지 데이터:', parsedData);
        
        setSharedPageData(parsedData);
        setIsViewingSharedPage(true);
        
        // URL에서 파라미터 제거
        window.history.replaceState({}, '', window.location.pathname);
      } catch (error) {
        console.error('공유 데이터 파싱 실패:', error);
      }
    }
  }, []);

  // 자동저장: state가 변경될 때마다 히스토리에 저장 (preview 단계에서만)
  useEffect(() => {
    // Undo/Redo 액션으로 인한 변경은 히스토리에 추가하지 않음
    if (isUndoRedoAction) {
      setIsUndoRedoAction(false);
      return;
    }
    
    // preview 단계이고 이미지가 있을 때만 히스토리에 추가
    if (state.step === 'preview' && state.generatedImages.length > 0) {
      setStateHistory(prev => {
        // 현재 인덱스 이후의 히스토리는 삭제 (새 분기점)
        const newHistory = prev.slice(0, currentHistoryIndex + 1);
        // 새 상태 추가 (최대 50개 유지)
        const updated = [...newHistory, { ...state }].slice(-50);
        return updated;
      });
      setCurrentHistoryIndex(prev => Math.min(prev + 1, 49));
    }
  }, [state.generatedImages, state.generatedCopy]);

  const handleSelectKey = () => {
    setShowSettings(true);
  };

  const handleSettingsClose = () => {
    setShowSettings(false);
    // Check if key was saved
    const storedKey = getStoredApiKey();
    if (storedKey) {
      setIsKeyReady(true);
      
      // API Key 저장 후 자동 생성 실행
      if (pendingGenerate && pendingProductData) {
        setPendingGenerate(false);
        const dataToGenerate = pendingProductData;
        setPendingProductData(null);
        // 저장된 productData로 생성 실행
        executeGenerate(dataToGenerate);
      }
    } else {
      // API Key가 저장되지 않았으면 pending 상태 초기화
      setPendingGenerate(false);
      setPendingProductData(null);
    }
  };

  const handleInputSubmit = async (data: ProductData) => {
    // API Key 체크
    const apiKey = getStoredApiKey() || (import.meta as any).env?.VITE_NANO_BANANA_API_KEY;
    
    if (!apiKey) {
      // API Key가 없으면 모달 표시하고 생성 대기
      setPendingProductData(data);
      setPendingGenerate(true);
      setShowSettings(true);
      return;
    }
    
    // API Key가 있으면 생성 진행
    await executeGenerate(data);
  };

  const executeGenerate = async (data: ProductData) => {
    setState(prev => ({ 
      ...prev, 
      step: 'processing', 
      productData: data, 
      originalImages: data.images, 
      generatedImages: [], // Clear previous
      mainImageIndex: 0
    }));
    
    try {
      // Execute in parallel: Marketing Copy + Additional Scenes
      const [copy, newScenes] = await Promise.all([
        generateMarketingCopy(data),
        generateVariedScenes(data)
      ]);

      // DO NOT include original low-quality images.
      // Use ONLY the AI generated high-quality scenes.
      const allImages = [...newScenes];

      setState(prev => ({ 
        ...prev, 
        step: 'preview', 
        generatedCopy: copy,
        generatedImages: allImages
      }));
    } catch (error: any) {
      console.error("Error generating content:", error);
      
      // 크레딧 부족 에러 처리
      if (error.message?.includes("CREDITS_INSUFFICIENT") || 
          error.message?.toLowerCase().includes("insufficient") || 
          error.message?.toLowerCase().includes("credits")) {
        alert("⚠️ Nano Banana API 크레딧이 부족합니다!\n\nkie.ai에서 크레딧을 충전해주세요.\n\n👉 https://kie.ai/pricing");
        setState(prev => ({ ...prev, step: 'input' }));
        return;
      }
      
      // 기타 에러
      alert("컨텐츠 생성 중 오류가 발생했습니다. API 키가 설정되어 있는지 확인해주세요.\n\n" + (error.message || ""));
      setState(prev => ({ ...prev, step: 'input' }));
    }
  };

  const handleImageUpdate = (newImageUrl: string, index: number) => {
    setState(prev => {
      const updatedImages = [...prev.generatedImages];
      // Keep previous prompt, just update URL
      updatedImages[index] = { ...updatedImages[index], url: newImageUrl };
      return { ...prev, generatedImages: updatedImages };
    });
  };

  const handleImageReorder = (fromIndex: number, toIndex: number) => {
    setState(prev => {
      const newImages = [...prev.generatedImages];
      const [movedImage] = newImages.splice(fromIndex, 1);
      newImages.splice(toIndex, 0, movedImage);
      
      // mainImageIndex도 업데이트
      let newMainIndex = prev.mainImageIndex;
      if (fromIndex === prev.mainImageIndex) {
        newMainIndex = toIndex;
      } else if (fromIndex < prev.mainImageIndex && toIndex >= prev.mainImageIndex) {
        newMainIndex = prev.mainImageIndex - 1;
      } else if (fromIndex > prev.mainImageIndex && toIndex <= prev.mainImageIndex) {
        newMainIndex = prev.mainImageIndex + 1;
      }
      
      return {
        ...prev,
        generatedImages: newImages,
        mainImageIndex: newMainIndex
      };
    });
  };

  const handleRegenerateImage = async (index: number, prompt: string) => {
    try {
      // 로딩 상태 설정
      setState(prev => ({ ...prev, isEditingImage: true }));
      
      // 모델명 결정: pro면 nano-banana-pro, 아니면 nano-banana-edit
      const modelName = state.productData.selectedModel === 'pro' ? 'nano-banana-pro' : 'nano-banana-edit';
      
      // 참고 이미지(원본 제품 이미지) 포함하여 재생성
      const referenceImages = state.productData.images || [];
      const newImageUrl = await generateSingleScene(modelName, referenceImages, prompt);
      
      // 이미지 업데이트
      setState(prev => {
        const updatedImages = [...prev.generatedImages];
        updatedImages[index] = { ...updatedImages[index], url: newImageUrl, prompt };
        return { ...prev, generatedImages: updatedImages, isEditingImage: false };
      });
    } catch (error) {
      console.error('이미지 재생성 실패:', error);
      setState(prev => ({ ...prev, isEditingImage: false }));
      alert('이미지 재생성에 실패했습니다. 다시 시도해주세요.');
    }
  };

  const handleCopyUpdate = (sectionKey: keyof GeneratedCopy, newData: any) => {
    setState(prev => ({
      ...prev,
      generatedCopy: prev.generatedCopy ? { ...prev.generatedCopy, [sectionKey]: newData } : null
    }));
  };

  // Undo 함수
  const handleUndo = () => {
    if (currentHistoryIndex > 0) {
      setIsUndoRedoAction(true);
      const newIndex = currentHistoryIndex - 1;
      setCurrentHistoryIndex(newIndex);
      setState(stateHistory[newIndex]);
    }
  };

  // Redo 함수
  const handleRedo = () => {
    if (currentHistoryIndex < stateHistory.length - 1) {
      setIsUndoRedoAction(true);
      const newIndex = currentHistoryIndex + 1;
      setCurrentHistoryIndex(newIndex);
      setState(stateHistory[newIndex]);
    }
  };

  const handleMainImageSelect = (index: number) => {
    setState(prev => ({ ...prev, mainImageIndex: index }));
  };

  // 히스토리에 저장
  const saveToHistory = () => {
    if (!state.generatedCopy || state.generatedImages.length === 0) return;
    
    // 외부 URL만 저장 (Base64 이미지 제외)
    const filteredImages = state.generatedImages.filter(img => 
      img.url && !img.url.startsWith('data:')
    );
    
    if (filteredImages.length === 0) {
      alert('저장 가능한 이미지가 없습니다. (외부 URL 이미지만 저장 가능)');
      return;
    }
    
    const newItem: HistoryItem = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      productName: state.productData.name || '제목 없음',
      productData: {
        ...state.productData,
        images: [] // 원본 이미지(Base64)는 저장하지 않음
      },
      generatedImages: filteredImages,
      generatedCopy: state.generatedCopy,
      thumbnail: filteredImages[0]?.url || '',
      originalImages: state.productData.images.filter(url => !url.startsWith('data:'))  // 외부 URL만 저장
    };
    
    setHistory(prev => [newItem, ...prev].slice(0, 200)); // 최대 200개 저장, 초과 시 오래된 항목 자동 삭제
    alert('히스토리에 저장되었습니다!');
  };

  // 히스토리에서 불러오기
  const loadFromHistory = (item: HistoryItem) => {
    setState({
      step: 'preview',
      productData: {
        ...item.productData,
        images: item.originalImages || item.productData.images || []  // 참고 이미지 복원
      },
      originalImages: item.originalImages || [],
      generatedImages: item.generatedImages,
      mainImageIndex: 0,
      generatedCopy: item.generatedCopy,
      isEditingImage: false
    });
    setShowHistory(false);
  };

  // 히스토리 삭제
  const deleteFromHistory = (id: string) => {
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  // 공유 링크 생성
  const generateShareLink = async () => {
    try {
      setIsGeneratingLink(true);
      
      if (state.generatedImages.length === 0) {
        alert('공유할 이미지가 없습니다.');
        return;
      }
      
      // 1. 이미지들을 1장으로 합치기
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        alert('캔버스를 생성할 수 없습니다.');
        return;
      }
      
      // 이미지 로드
      const loadedImages: HTMLImageElement[] = [];
      for (const img of state.generatedImages) {
        try {
          const imageElement = new Image();
          imageElement.crossOrigin = 'anonymous';
          await new Promise<void>((resolve, reject) => {
            imageElement.onload = () => resolve();
            imageElement.onerror = () => reject(new Error('이미지 로드 실패'));
            imageElement.src = img.url;
          });
          loadedImages.push(imageElement);
        } catch (e) {
          console.error('이미지 로드 실패:', e);
        }
      }
      
      if (loadedImages.length === 0) {
        alert('이미지를 로드할 수 없습니다.');
        return;
      }
      
      // 캔버스 크기 설정 (모든 이미지 세로로 합치기)
      const maxWidth = Math.max(...loadedImages.map(img => img.width));
      const totalHeight = loadedImages.reduce((sum, img) => sum + (img.height * maxWidth / img.width), 0);
      
      canvas.width = maxWidth;
      canvas.height = totalHeight;
      
      // 배경색 설정
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // 이미지 그리기
      let currentY = 0;
      for (const img of loadedImages) {
        const scaledHeight = img.height * maxWidth / img.width;
        ctx.drawImage(img, 0, currentY, maxWidth, scaledHeight);
        currentY += scaledHeight;
      }
      
      // 2. 합쳐진 이미지를 base64로 변환 후 imgbb 업로드
      const mergedImageBase64 = canvas.toDataURL('image/jpeg', 0.9);
      const base64Data = mergedImageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
      
      const apiKey = (import.meta as any).env?.VITE_IMGBB_API_KEY;
      if (!apiKey) {
        throw new Error('imgbb API 키가 설정되지 않았습니다.');
      }
      
      const formData = new FormData();
      formData.append('image', base64Data);
      
      const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
        method: 'POST',
        body: formData
      });
      
      const imgbbData = await response.json();
      
      if (!imgbbData.success || !imgbbData.data?.url) {
        throw new Error('이미지 업로드 실패');
      }
      
      const imageUrl = imgbbData.data.url;
      
      // 3. 공유 데이터 생성
      const shareData = {
        title: state.productData?.name || 'AI 상세페이지',
        description: state.productData?.description || '',
        image: imageUrl,
        createdAt: new Date().toISOString()
      };
      
      // 4. Base64로 인코딩하여 URL 파라미터로 전달
      const encodedData = btoa(unescape(encodeURIComponent(JSON.stringify(shareData))));
      const shareUrl = `${window.location.origin}${window.location.pathname}?view=${encodedData}`;
      
      // 5. 클립보드에 링크만 복사
      console.log('복사할 URL:', shareUrl);  // 디버깅용
      
      try {
        await navigator.clipboard.writeText(shareUrl);
        console.log('클립보드 복사 성공');
        alert('✅ 링크가 복사되었습니다!');
      } catch (clipboardError) {
        console.error('클립보드 복사 실패:', clipboardError);
        // fallback
        const textArea = document.createElement('textarea');
        textArea.value = shareUrl;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert('✅ 링크가 복사되었습니다!');
      }
      
    } catch (error) {
      console.error('공유 링크 생성 실패:', error);
      alert('공유 링크 생성에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsGeneratingLink(false);
    }
  };

  // 공유 링크에서 데이터 로드
  const loadFromShareLink = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const shareParam = urlParams.get('share');
    
    if (shareParam) {
      try {
        const decoded = JSON.parse(decodeURIComponent(atob(shareParam)));
        
        // 공유 데이터로 프리뷰 모드 설정
        setState({
          step: 'preview',
          productData: {
            ...decoded.productData,
            images: decoded.originalImages || decoded.productData?.images || []  // 참고 이미지 복원
          },
          originalImages: decoded.originalImages || [],
          generatedImages: decoded.images.map((url: string) => ({
            url,
            prompt: ''
          })),
          generatedCopy: decoded.copy,
          mainImageIndex: decoded.mainImageIndex || 0,
          isEditingImage: false
        });
        
        // URL에서 share 파라미터 제거
        window.history.replaceState({}, '', window.location.pathname);
      } catch (error) {
        console.error('공유 링크 로드 실패:', error);
      }
    }
  };

  const handleReset = () => {
    // Reset all state to initial values immediately
    setState({
      step: 'input',
      productData: { 
        name: '', 
        description: '', 
        targetAudience: '', 
        images: [], 
        selectedModel: 'flash',
        platform: 'coupang',
        price: 0,
        discountRate: 0,
        promotionText: ''
      },
      originalImages: [],
      generatedImages: [],
      mainImageIndex: 0,
      generatedCopy: null,
      isEditingImage: false
    });
  };

  // 1. Loading State (Checking Key) - 최초 로딩만 표시
  if (isCheckingKey) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  // 2. 뷰 페이지 표시
  if (isViewingSharedPage && sharedPageData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        {/* 헤더 */}
        <header className="sticky top-0 z-50 bg-white shadow-sm">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">🛍️</span>
              <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600">
                AI 상세페이지
              </span>
            </div>
            <a 
              href={window.location.origin + window.location.pathname}
              className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-bold rounded-full hover:opacity-90 transition-opacity"
            >
              🚀 나도 만들기
            </a>
          </div>
        </header>
        
        {/* 메인 컨텐츠 */}
        <main className="max-w-2xl mx-auto px-4 py-6">
          {/* 상품 정보 카드 */}
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-6">
            <div className="p-5 border-b border-slate-100">
              <h1 className="text-xl font-bold text-slate-800 mb-2">{sharedPageData.title}</h1>
              {sharedPageData.description && (
                <p className="text-sm text-slate-600 line-clamp-3">{sharedPageData.description}</p>
              )}
            </div>
            
            {/* 상세페이지 이미지 (1장) */}
            <div className="p-4">
              <img 
                src={sharedPageData.image} 
                alt={sharedPageData.title}
                className="w-full rounded-xl shadow-sm"
                loading="lazy"
              />
            </div>
          </div>
          
          {/* 홍보 영역 */}
          <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl p-6 text-white text-center shadow-lg">
            <div className="text-3xl mb-3">✨</div>
            <h2 className="text-xl font-bold mb-2">AI로 상세페이지 무료 제작</h2>
            <p className="text-sm opacity-90 mb-5">
              사진 한 장만 올리면 전문가급 상세페이지가 자동 생성됩니다!
            </p>
            <a 
              href={window.location.origin + window.location.pathname}
              className="inline-block px-8 py-3 bg-white text-purple-600 font-bold rounded-full hover:bg-slate-100 transition-colors shadow-md"
            >
              무료로 시작하기 →
            </a>
          </div>
          
          {/* 기능 소개 */}
          <div className="mt-6 grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl p-4 text-center shadow">
              <div className="text-2xl mb-2">📸</div>
              <p className="text-xs text-slate-600">사진 업로드</p>
            </div>
            <div className="bg-white rounded-xl p-4 text-center shadow">
              <div className="text-2xl mb-2">🤖</div>
              <p className="text-xs text-slate-600">AI 자동 생성</p>
            </div>
            <div className="bg-white rounded-xl p-4 text-center shadow">
              <div className="text-2xl mb-2">💾</div>
              <p className="text-xs text-slate-600">바로 다운로드</p>
            </div>
          </div>
          
          {/* 푸터 */}
          <p className="text-center text-xs text-slate-400 mt-8 mb-4">
            © AI 상세페이지 제작 • ai-detail-page.netlify.app
          </p>
        </main>
      </div>
    );
  }

  // 3. Main App UI (항상 표시)
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      
      {/* Header */}
      <header className="bg-white/95 backdrop-blur border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 md:h-16 flex items-center justify-between">
          {/* Left: Logo & Title */}
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <span className="text-xl md:text-2xl">🛍️</span>
            <div className="text-left">
              <h1 className="text-base md:text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                AI 상세페이지 제작
              </h1>
              <p className="text-[10px] md:text-xs text-slate-400">v1.7.0</p>
            </div>
          </button>
          
          {/* Right: Actions */}
          <div className="flex items-center gap-1 sm:gap-2 md:gap-3">
             {state.step === 'input' && (
               <>
                 <button
                   onClick={() => setShowHistory(true)}
                   className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 bg-white shadow-sm md:shadow-lg hover:shadow-md md:hover:shadow-xl rounded-lg md:rounded-xl text-xs md:text-sm text-slate-600 border border-slate-200 transition-all duration-200 md:duration-300 md:hover:scale-105"
                 >
                   <span>📋</span>
                   <span className="font-medium">히스토리 ({history.length})</span>
                 </button>
                 {/* Mobile icon buttons */}
                 <button
                   onClick={() => setShowHistory(true)}
                   className="sm:hidden flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-600 text-lg shadow-sm"
                   aria-label="히스토리"
                 >
                   📋
                 </button>
                 <button
                   onClick={() => setShowSettings(true)}
                   className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 bg-white shadow-sm md:shadow-lg hover:shadow-md md:hover:shadow-xl rounded-lg md:rounded-xl text-xs md:text-sm text-slate-600 border border-slate-200 transition-all duration-200 md:duration-300 md:hover:scale-105"
                 >
                   <span>⚙️</span>
                   <span className="font-medium">API 설정</span>
                 </button>
                 <button
                   onClick={() => setShowSettings(true)}
                   className="sm:hidden flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-600 text-lg shadow-sm"
                   aria-label="API 설정"
                 >
                   ⚙️
                 </button>
               </>
             )}
             {state.step === 'preview' && (
               <>
                 {/* 모바일 되돌리기/앞으로 버튼 */}
                 <div className="flex sm:hidden mr-1">
                   <button
                     onClick={handleUndo}
                     disabled={currentHistoryIndex <= 0}
                     className="px-2 py-1 bg-gradient-to-r from-purple-500 to-purple-600 text-white text-xs font-medium rounded-l-lg disabled:opacity-30 disabled:cursor-not-allowed"
                   >
                     ↶ 되돌리기
                   </button>
                   <button
                     onClick={handleRedo}
                     disabled={currentHistoryIndex >= stateHistory.length - 1}
                     className="px-2 py-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-xs font-medium rounded-r-lg disabled:opacity-30 disabled:cursor-not-allowed"
                   >
                     앞으로 ↷
                   </button>
                 </div>
                 {/* 데스크톱 정보 표시 */}
                 <div className="flex items-center gap-4 hidden md:flex">
                   <span className="px-2 py-1 bg-slate-100 rounded text-xs text-slate-500 font-mono">
                     Model: {state.productData.selectedModel === 'pro' ? 'Nano Banana Pro' : 'Nano Banana'}
                   </span>
                   <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold uppercase">
                     {state.productData.platform}
                   </span>
                   <div className="text-sm font-medium text-slate-500">
                      {state.productData.name}
                   </div>
                 </div>
               </>
             )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow p-4 md:p-8">
        {state.step === 'input' && (
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 bg-purple-100 text-purple-700 px-4 py-2 rounded-full text-sm font-medium mb-4">
                <span>✨</span> AI가 만드는 프로페셔널 상세페이지
              </div>
              <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3">
                단 몇 분 만에,<br/>
                <span className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                  판매를 높이는 상세페이지
                </span>
              </h1>
              <p className="text-slate-500 text-lg max-w-xl mx-auto">
                사진 한 장과 제품명만 입력하세요.<br/>
                쿠팡, 스마트스토어 규정에 맞는 전문가급 페이지가 자동으로 완성됩니다.
              </p>
            </div>
            <ProductInput onSubmit={handleInputSubmit} isLoading={false} />
          </div>
        )}

        {state.step === 'processing' && (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="relative w-24 h-24 mb-8">
              <div className="absolute inset-0 border-4 border-slate-200 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
            </div>
            
            {/* 타이머 표시 */}
            <div className="text-4xl font-bold text-blue-600 mb-4 font-mono">
              {Math.floor(elapsedTime / 60).toString().padStart(2, '0')}:{(elapsedTime % 60).toString().padStart(2, '0')}
            </div>
            
            <h3 className="text-2xl font-bold text-slate-800 mb-2">AI가 상세페이지를 디자인 중입니다</h3>
            <p className="text-slate-500 mb-2 font-medium text-blue-600">
              {state.productData.platform === 'coupang' ? '쿠팡' : '스마트스토어'} 맞춤 디자인 적용 중...
            </p>
            <p className="text-slate-400 text-sm">레퍼런스 스타일을 분석하여 고화질 이미지를 생성합니다.</p>
          </div>
        )}

        {state.step === 'preview' && state.generatedCopy && state.generatedImages.length > 0 && (
          <>
            {/* 히스토리 저장 버튼 */}
            <div className="flex justify-end gap-2 mb-4">
              {/* PC에서만 표시: 모바일 미리보기 토글 */}
              <button
                onClick={() => setIsMobilePreview(!isMobilePreview)}
                className="hidden md:flex px-3 py-2 bg-slate-100 text-slate-600 rounded-xl font-medium hover:bg-slate-200 transition-all items-center gap-2"
              >
                {isMobilePreview ? '🖥️ PC 보기' : '📱 모바일 보기'}
              </button>
              <button
                onClick={saveToHistory}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg shadow-md hover:bg-purple-700 transition-all flex items-center gap-2"
              >
                💾 히스토리에 저장
              </button>
              <button
                onClick={generateShareLink}
                disabled={isGeneratingLink}
                className="bg-green-600 text-white px-4 py-2 rounded-lg shadow-md hover:bg-green-700 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGeneratingLink ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>링크 생성중...</span>
                  </>
                ) : (
                  <>
                    <span>🔗</span>
                    <span>공유 링크 복사</span>
                  </>
                )}
              </button>
            </div>
            
            {/* 상세페이지 미리보기 */}
            <div className={isMobilePreview ? "flex justify-center py-4" : ""}>
              <div className={isMobilePreview ? "w-[375px] bg-white shadow-2xl rounded-lg overflow-hidden" : "w-full"}>
                <DetailPagePreview 
                  images={state.generatedImages}
                  mainImageIndex={state.mainImageIndex}
                  copy={state.generatedCopy}
                  productData={state.productData}
                  onImageUpdate={handleImageUpdate}
                  onMainImageSelect={handleMainImageSelect}
                  onReset={handleReset}
                  onCopyUpdate={handleCopyUpdate}
                  onRegenerateImage={handleRegenerateImage}
                  originalImages={state.productData.images}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  canUndo={currentHistoryIndex > 0}
                  canRedo={currentHistoryIndex < stateHistory.length - 1}
                  onImageReorder={handleImageReorder}
                />
              </div>
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-8">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-center items-center gap-4">
          <div className="text-slate-400 text-sm text-center">
            Powered by Nano Banana AI
          </div>
        </div>
      </footer>
      
      {/* Settings Modal */}
      <SettingsModal 
        isOpen={showSettings} 
        onClose={handleSettingsClose}
        autoCloseOnSave={pendingGenerate}
      />

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-slate-800">📋 히스토리</h2>
              <button
                onClick={() => setShowHistory(false)}
                className="text-slate-400 hover:text-slate-600 text-2xl"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {history.length === 0 ? (
                <div className="text-center text-slate-500 py-12">
                  <p className="text-4xl mb-4">📭</p>
                  <p>저장된 히스토리가 없습니다.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {history.map(item => (
                    <div 
                      key={item.id} 
                      className="border border-slate-200 rounded-xl overflow-hidden hover:shadow-lg transition-shadow"
                    >
                      <div className="aspect-video bg-slate-100 relative">
                        {item.thumbnail ? (
                          <img 
                            src={item.thumbnail} 
                            alt={item.productName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400">
                            🖼️
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <h3 className="font-bold text-slate-800 truncate">{item.productName}</h3>
                        <p className="text-xs text-slate-500 mt-1">
                          {new Date(item.timestamp).toLocaleDateString('ko-KR', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          이미지 {item.generatedImages.length}장
                        </p>
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => loadFromHistory(item)}
                            className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                          >
                            불러오기
                          </button>
                          <button
                            onClick={() => deleteFromHistory(item.id)}
                            className="bg-red-100 text-red-600 px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;