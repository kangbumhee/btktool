import React, { useRef, useState } from 'react';
import JSZip from 'jszip';
import html2canvas from 'html2canvas';
import { GeneratedCopy, ProductData, GeneratedImage } from '../types';
import { Button } from './Button';
import { refineCopySection, editProductImage } from '../services/geminiService';

interface DetailPagePreviewProps {
  images: GeneratedImage[];
  mainImageIndex: number;
  copy: GeneratedCopy;
  productData: ProductData;
  onImageUpdate: (newImage: string, index: number) => void;
  onMainImageSelect: (index: number) => void;
  onReset: () => void;
  onCopyUpdate: (sectionKey: keyof GeneratedCopy, newData: any) => void;
  onRegenerateImage: (index: number, prompt: string) => Promise<void>;
  originalImages?: string[];
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onImageReorder?: (fromIndex: number, toIndex: number) => void;
}

const SectionCheckbox: React.FC<{ 
  sectionId: string; 
  label: string;
  hiddenSections: Set<string>;
  onToggle: (sectionId: string) => void;
}> = ({ sectionId, label, hiddenSections, onToggle }) => (
  <div className="flex items-center gap-2 mb-2 p-2 bg-slate-100 rounded-lg">
    <input
      type="checkbox"
      id={`section-${sectionId}`}
      checked={!hiddenSections.has(sectionId)}
      onChange={() => onToggle(sectionId)}
      className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
    />
    <label 
      htmlFor={`section-${sectionId}`}
      className={`text-sm font-medium cursor-pointer ${hiddenSections.has(sectionId) ? 'text-gray-400 line-through' : 'text-gray-700'}`}
    >
      {label}
    </label>
  </div>
);

const SectionEditControl: React.FC<{
  sectionName: string;
  onUpdate: (feedback: string) => Promise<void>;
}> = ({ sectionName, onUpdate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!feedback.trim()) return;
    setIsLoading(true);
    try {
      await onUpdate(feedback);
      setIsOpen(false);
      setFeedback('');
    } catch (e) {
      console.error(e);
      alert('수정 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="absolute top-2 right-2 z-30 flex flex-col items-end opacity-0 group-hover:opacity-100 transition-opacity duration-200">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-white/90 p-2 rounded-full shadow-md text-slate-500 hover:text-blue-600 hover:bg-white transition-all border border-slate-200 backdrop-blur-sm"
          title={`${sectionName} 텍스트 수정`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
      ) : (
        <div className="bg-white p-3 rounded-lg shadow-xl border border-slate-200 w-72 animate-in fade-in zoom-in duration-200 z-40 text-left">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
              ✏️ {sectionName} 텍스트 수정
            </span>
            <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
          </div>
          <textarea
            className="w-full text-sm p-2 border border-slate-200 rounded mb-2 focus:ring-2 focus:ring-blue-500 outline-none resize-none text-gray-900 bg-white"
            rows={3}
            placeholder="예: 좀 더 감성적인 톤으로, 길이를 짧게"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
          <Button 
            onClick={handleSubmit} 
            isLoading={isLoading} 
            disabled={!feedback.trim()}
            className="w-full py-1 text-sm h-8"
          >
            AI 수정 요청
          </Button>
        </div>
      )}
    </div>
  );
};

const ImageFeedbackControl: React.FC<{
  imageIndex: number;
  currentImage: GeneratedImage;
  onUpdate: (newImage: string, index: number) => void;
  onRegenerate: (index: number, prompt: string) => Promise<void>;
  originalImages?: string[];
  onScaleChange?: (index: number, scale: number) => void;
}> = ({ imageIndex, currentImage, onUpdate, onRegenerate, originalImages, onScaleChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [imageScale, setImageScale] = useState(100); // 퍼센트 단위
  const [editablePrompt, setEditablePrompt] = useState(currentImage.prompt || '');
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [translatedPrompt, setTranslatedPrompt] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);

  const handleEdit = async () => {
    if (!prompt.trim()) return;
    setIsLoading(true);
    try {
      const originalRef = originalImages && originalImages.length > 0 ? originalImages[0] : undefined;
      const newImage = await editProductImage(currentImage.url, prompt, originalRef);
      onUpdate(newImage, imageIndex);
      setIsOpen(false);
      setPrompt('');
    } catch (e) {
      console.error(e);
      alert('이미지 수정 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      await onRegenerate(imageIndex, editablePrompt);
      setIsOpen(false);
      setIsEditingPrompt(false);
    } catch (e) {
      console.error(e);
      alert('이미지 재생성 중 오류가 발생했습니다.');
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleTranslate = async () => {
    if (!currentImage.prompt) return;
    setIsTranslating(true);
    try {
      // 간단한 번역 API 호출 또는 Gemini 사용
      const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dt=t&q=${encodeURIComponent(currentImage.prompt)}`);
      const data = await response.json();
      const translated = data[0].map((item: any) => item[0]).join('');
      setTranslatedPrompt(translated);
    } catch (error) {
      console.error('번역 실패:', error);
      setTranslatedPrompt('번역에 실패했습니다.');
    }
    setIsTranslating(false);
  };

  return (
    <div className="absolute top-2 left-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
      {!isOpen ? (
        <div className="flex gap-1">
          {/* 이미지 수정 버튼 */}
          <button
            onClick={() => setIsOpen(true)}
            className="bg-black/60 text-white px-2 py-1.5 rounded-l-full shadow-lg hover:bg-black/80 transition-all backdrop-blur-sm flex items-center gap-1 text-xs font-bold border border-white/20"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
            수정
          </button>
          
          {/* 이미지 저장 버튼 */}
          <button
            type="button"
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              try {
                // CORS 프록시를 통해 이미지 가져오기
                const corsProxy = 'https://api.allorigins.win/raw?url=';
                const imageUrl = currentImage.url;
                
                let blob;
                if (imageUrl.startsWith('data:')) {
                  // Base64 이미지인 경우
                  const response = await fetch(imageUrl);
                  blob = await response.blob();
                } else {
                  // 외부 URL인 경우 프록시 사용
                  const proxyUrl = corsProxy + encodeURIComponent(imageUrl);
                  const response = await fetch(proxyUrl);
                  blob = await response.blob();
                }
                
                // 다운로드 링크 생성
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `image_${imageIndex + 1}_${Date.now()}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
              } catch (error) {
                console.error('이미지 저장 실패:', error);
                alert('이미지 저장에 실패했습니다.');
              }
            }}
            className="bg-green-600/80 text-white px-2 py-1.5 shadow-lg hover:bg-green-700 transition-all backdrop-blur-sm flex items-center gap-1 text-xs font-bold border border-white/20"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            저장
          </button>
          
          {/* 이미지 불러오기 버튼 */}
          <label className="bg-blue-600/80 text-white px-2 py-1.5 shadow-lg hover:bg-blue-700 transition-all backdrop-blur-sm flex items-center gap-1 text-xs font-bold border border-white/20 cursor-pointer">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            불러오기
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    const newImageUrl = event.target?.result as string;
                    if (newImageUrl) {
                      onUpdate(newImageUrl, imageIndex);
                    }
                  };
                  reader.readAsDataURL(file);
                }
              }}
            />
          </label>
          
          {/* 확대/축소 버튼 */}
          <div className="flex items-center gap-1 bg-black/60 rounded-full px-2 py-1 backdrop-blur-sm border border-white/20">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const newScale = Math.max(50, imageScale - 10);
                setImageScale(newScale);
                console.log('축소:', newScale);
                onScaleChange?.(imageIndex, newScale);
              }}
              className="text-white hover:bg-white/20 rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold cursor-pointer"
            >
              -
            </button>
            <span className="text-white text-xs font-medium min-w-[40px] text-center">
              {imageScale}%
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const newScale = Math.min(150, imageScale + 10);
                setImageScale(newScale);
                console.log('확대:', newScale);
                onScaleChange?.(imageIndex, newScale);
              }}
              className="text-white hover:bg-white/20 rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold cursor-pointer"
            >
              +
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white p-3 rounded-lg shadow-2xl border border-slate-200 w-80 animate-in fade-in zoom-in duration-200 z-40 text-left">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
              ✨ AI 이미지 부분 수정
            </span>
            <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
          </div>
          
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs text-slate-500 font-medium">사용된 프롬프트:</p>
              <button
                type="button"
                onClick={() => setIsEditingPrompt(!isEditingPrompt)}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                {isEditingPrompt ? '취소' : '✏️ 수정'}
              </button>
              <button
                type="button"
                onClick={handleTranslate}
                disabled={isTranslating}
                className="text-xs text-green-600 hover:text-green-800 font-medium disabled:opacity-50"
              >
                {isTranslating ? '번역 중...' : '🌐 번역'}
              </button>
            </div>
            
            {isEditingPrompt ? (
              <textarea
                value={editablePrompt}
                onChange={(e) => setEditablePrompt(e.target.value)}
                className="w-full p-2 text-xs border border-slate-300 rounded-lg bg-white text-gray-900 resize-none"
                rows={4}
              />
            ) : (
              <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg whitespace-pre-wrap">
                {currentImage.prompt || '프롬프트 정보 없음'}
              </p>
            )}
            
            {translatedPrompt && (
              <div className="mt-2 p-2 bg-green-50 rounded-lg border border-green-200">
                <p className="text-xs text-green-800 font-medium mb-1">🇰🇷 한국어 번역:</p>
                <p className="text-xs text-green-700">{translatedPrompt}</p>
              </div>
            )}
          </div>

          <Button
            onClick={handleRegenerate}
            isLoading={isRegenerating}
            disabled={isRegenerating}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white py-2.5 px-4 rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 transition-all flex items-center justify-center gap-2 mb-4"
          >
            🔄 {isEditingPrompt ? '수정된 프롬프트로 재생성' : '다시 생성 (Re-roll)'}
          </Button>

          <div className="border-t border-slate-100 my-2"></div>

          <p className="text-xs text-slate-500 mb-2">🖌️ AI 이미지 편집 요청</p>
          <textarea
            className="w-full text-sm p-2 border border-slate-700 bg-slate-800 text-white rounded mb-2 focus:ring-2 focus:ring-purple-500 outline-none resize-none placeholder-slate-400"
            rows={2}
            placeholder="현재 이미지를 기반으로 수정할 내용을 입력하세요&#10;예: 배경을 숲속으로, 조명을 더 밝게, 제품을 더 크게"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleEdit();
              }
            }}
          />
          <Button 
            onClick={handleEdit} 
            isLoading={isLoading} 
            disabled={!prompt.trim()}
            className="w-full py-1 text-sm h-8 bg-purple-600 hover:bg-purple-700 shadow-purple-500/30"
          >
            수정 실행
          </Button>
        </div>
      )}
    </div>
  );
};

export const DetailPagePreview: React.FC<DetailPagePreviewProps> = ({ 
  images, 
  mainImageIndex,
  copy, 
  productData,
  onImageUpdate,
  onMainImageSelect,
  onReset,
  onCopyUpdate,
  onRegenerateImage,
  originalImages,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onImageReorder
}) => {
  const mainImage = images[mainImageIndex];
  const detailPageRef = useRef<HTMLDivElement>(null);
  const [imageScales, setImageScales] = useState<Record<number, number>>({});
  const [hiddenSections, setHiddenSections] = useState<Set<string>>(new Set());
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isSectionControlOpen, setIsSectionControlOpen] = useState(false);
  
  const handleScaleChange = (index: number, scale: number) => {
    console.log('Scale changed:', index, scale);
    setImageScales(prev => ({ ...prev, [index]: scale }));
  };
  
  const toggleSection = (sectionId: string) => {
    setHiddenSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    console.log('드래그 시작:', index);
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    console.log('드래그 진입:', index);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('드롭:', draggedIndex, '->', dropIndex);
    
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      return;
    }
    
    if (onImageReorder) {
      onImageReorder(draggedIndex, dropIndex);
    }
    setDraggedIndex(null);
  };

  const handleDragEnd = () => {
    console.log('드래그 종료');
    setDraggedIndex(null);
  };
  
  // Use data from props or defaults
  const price = productData.price || 32900;
  const discountRate = productData.discountRate || 0;
  const originalPrice = discountRate > 0 
    ? Math.floor(price * 100 / (100 - discountRate)) 
    : price;

  const hasPromotion = !!(productData.promotionText && productData.promotionText.trim().length > 0);
  
  let imgCursor = 0;
  const totalImages = images.length;
  
  // Modified to return object with index for specific updates
  const getNextImage = () => {
    const index = imgCursor % totalImages;
    const imgData = images[index];
    imgCursor++;
    return { data: imgData, index };
  };

  // 1. Promotion (optional)
  const promotionImage = hasPromotion ? getNextImage() : null;

  // 2. Hero
  const heroImage = getNextImage();

  // 3. Lifestyle (Intro)
  const lifestyleImage = getNextImage();

  // 4. Features (N items)
  const features = copy.features || [];
  const featureImages = features.map(() => getNextImage());

  // 5. Usage Context (for Usage Scenarios section)
  const usageContextImage = getNextImage();

  // --- CALCULATE REMAINING IMAGES ---
  const remainingCount = Math.max(0, totalImages - imgCursor);
  // We need to fetch these carefully to preserve indices
  const remainingImages = [];
  for(let i = 0; i < remainingCount; i++) {
     remainingImages.push(getNextImage()); // This advances cursor and gets index
  }

  // Requirement: "Detail View" max 3 images. Rest go to Description.
  const detailViewImageCount = Math.min(3, remainingImages.length);
  const descriptionExtraCount = Math.max(0, remainingImages.length - detailViewImageCount);

  // Split remaining
  const descriptionExtraImages = remainingImages.slice(0, descriptionExtraCount);
  const detailViewImages = remainingImages.slice(descriptionExtraCount);

  const handleDownloadZip = async () => {
    const zip = new JSZip();
    const folder = zip.folder("ai_detailpage_images");
    
    if (folder) {
      images.forEach((img, idx) => {
        const base64Data = img.url.split(',')[1];
        folder.file(`image_${idx + 1}.png`, base64Data, { base64: true });
      });
      
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ai_detailpage_images.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handleDownloadFullPage = async () => {
    if (!detailPageRef.current) {
      alert('다운로드할 콘텐츠가 없습니다.');
      return;
    }
    
    try {
      // 저장 중 표시를 위해 스크롤을 맨 위로
      detailPageRef.current.scrollTop = 0;
      
      const canvas = await html2canvas(detailPageRef.current, {
        useCORS: true,
        allowTaint: true,
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        // 전체 높이를 캡처하도록 설정
        windowHeight: detailPageRef.current.scrollHeight,
        height: detailPageRef.current.scrollHeight,
      });
      
      const url = canvas.toDataURL("image/jpeg", 0.92);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${productData?.name || '상세페이지'}_${new Date().toISOString().slice(0, 10)}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error("Screenshot failed", err);
      alert("상세페이지 저장 중 오류가 발생했습니다. 다시 시도해주세요.");
    }
  };

  const handleCopyHTML = async () => {
    const element = detailPageRef.current;
    if (!element) return;

    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'html-loading';
    loadingDiv.innerHTML = `<div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 99999; color: white; font-size: 18px;">HTML 생성 중...</div>`;
    document.body.appendChild(loadingDiv);

    try {
      const sectionsToHide: HTMLElement[] = [];
      hiddenSections.forEach(sectionId => {
        const sectionElement = element.querySelector(`[data-section="${sectionId}"]`) as HTMLElement;
        if (sectionElement) {
          sectionsToHide.push(sectionElement);
          sectionElement.style.display = 'none';
        }
      });

      // 복제본 생성
      const clonedElement = element.cloneNode(true) as HTMLElement;

      // 에디터 요소 제거
      const removeSelectors = ['button', 'input', 'label', 'svg'];
      removeSelectors.forEach(selector => {
        clonedElement.querySelectorAll(selector).forEach(el => el.remove());
      });

      // HTML 순서대로 조립
      let html = `<div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: 'Malgun Gothic', sans-serif; background: #fff;">`;

      // DOM 순서대로 순회하며 HTML 생성
      const processNode = (node: Node): string => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent?.trim();
          if (text && text.length > 2 && 
              !text.includes('수정') && !text.includes('저장') && 
              !text.includes('불러오기') && !text.includes('100%') &&
              !text.includes('번역')) {
            return text;
          }
          return '';
        }

        if (node.nodeType !== Node.ELEMENT_NODE) return '';

        const el = node as HTMLElement;
        const tagName = el.tagName.toLowerCase();

        // 이미지
        if (tagName === 'img') {
          const src = el.getAttribute('src');
          if (src && !src.includes('data:')) {
            return `<div style="text-align: center; margin: 20px 0;"><img src="${src}" style="max-width: 100%; height: auto; border-radius: 8px;" /></div>`;
          }
          return '';
        }

        // 제목들
        if (tagName === 'h1') {
          const text = el.textContent?.trim();
          if (text && !text.includes('수정') && !text.includes('저장')) {
            return `<h1 style="font-size: 28px; font-weight: bold; text-align: center; margin: 30px 0 20px; color: #1a1a1a;">${text}</h1>`;
          }
          return '';
        }

        if (tagName === 'h2') {
          const text = el.textContent?.trim();
          if (text && !text.includes('수정') && !text.includes('저장')) {
            return `<h2 style="font-size: 24px; font-weight: bold; text-align: center; margin: 25px 0 15px; color: #333; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${text}</h2>`;
          }
          return '';
        }

        if (tagName === 'h3') {
          const text = el.textContent?.trim();
          if (text && !text.includes('수정') && !text.includes('저장')) {
            return `<h3 style="font-size: 20px; font-weight: bold; text-align: center; margin: 25px 0 10px; color: #444;">${text}</h3>`;
          }
          return '';
        }

        if (tagName === 'h4') {
          const text = el.textContent?.trim();
          if (text && !text.includes('수정') && !text.includes('저장')) {
            return `<h4 style="font-size: 18px; font-weight: bold; text-align: center; margin: 20px 0 8px; color: #555;">${text}</h4>`;
          }
          return '';
        }

        // 문단
        if (tagName === 'p') {
          const text = el.textContent?.trim();
          if (text && text.length > 5 && 
              !text.includes('수정') && !text.includes('저장') && 
              !text.includes('불러오기') && !text.includes('100%')) {
            return `<p style="font-size: 16px; line-height: 1.8; text-align: center; margin: 12px 0; color: #555;">${text}</p>`;
          }
          return '';
        }

        // span (POINT, PROBLEM 등)
        if (tagName === 'span') {
          const text = el.textContent?.trim();
          if (text && text.length > 2 && text.length < 50 &&
              !text.includes('수정') && !text.includes('저장') &&
              (text.includes('POINT') || text.includes('PROBLEM') || text.includes('Q.') || text.includes('A.'))) {
            return `<p style="font-size: 14px; font-weight: bold; text-align: center; margin: 15px 0 5px; color: #667eea;">${text}</p>`;
          }
          return '';
        }

        // div 등 컨테이너는 자식 순회
        let childHtml = '';
        el.childNodes.forEach(child => {
          childHtml += processNode(child);
        });
        return childHtml;
      };

      html += processNode(clonedElement);
      html += `</div>`;

      sectionsToHide.forEach(section => {
        section.style.display = '';
      });

      await navigator.clipboard.writeText(html);
      alert('HTML이 클립보드에 복사되었습니다!\n쿠팡 HTML 모드에 붙여넣기 하세요.');

    } catch (error) {
      console.error('HTML 복사 실패:', error);
      alert('HTML 복사에 실패했습니다.');
    } finally {
      const loading = document.getElementById('html-loading');
      if (loading) loading.remove();
    }
  };

  const handleSectionUpdate = async (key: keyof GeneratedCopy, feedback: string) => {
    try {
      const refinedData = await refineCopySection(key, copy[key], feedback);
      // refinedData가 null이나 undefined가 아니고, 문자열이거나 배열이거나 객체인 경우에만 업데이트
      if (refinedData !== null && refinedData !== undefined && refinedData !== '') {
        // 문자열인 경우 길이 체크, 배열인 경우 길이 체크, 객체인 경우 키 개수 체크
        const isValid = typeof refinedData === 'string' 
          || (Array.isArray(refinedData) && refinedData.length > 0)
          || (typeof refinedData === 'object' && Object.keys(refinedData).length > 0);
        
        if (isValid) {
          onCopyUpdate(key, refinedData);
        } else {
          console.error('refineCopySection 반환값이 유효하지 않음:', refinedData);
          alert('텍스트 수정에 실패했습니다. 다시 시도해주세요.');
        }
      } else {
        console.error('refineCopySection 반환값이 비어있음');
        alert('텍스트 수정에 실패했습니다. 다시 시도해주세요.');
      }
    } catch (error) {
      console.error('섹션 수정 실패:', error);
      alert('텍스트 수정 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-8 items-start max-w-[1400px] mx-auto">
      {/* Sidebar Controls (Editor) */}
      <div className="w-full lg:w-[360px] lg:sticky lg:top-8 order-2 lg:order-1 space-y-6">
        <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-100">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-slate-800">편집 도구</h2>
            <button 
              onClick={onReset}
              className="text-sm text-slate-500 hover:text-red-500 underline"
            >
              처음으로
            </button>
          </div>
          
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">생성된 장면들 (총 {images.length}장)</label>
            <div className="grid grid-cols-3 gap-2">
              {images.map((img, idx) => {
                let label = "";
                if (hasPromotion && idx === 0) label = "🎉";
                return (
                  <div
                    key={idx}
                    draggable={true}
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={(e) => handleDragOver(e)}
                    onDragEnter={(e) => handleDragEnter(e, idx)}
                    onDrop={(e) => handleDrop(e, idx)}
                    onDragEnd={handleDragEnd}
                    onClick={() => onMainImageSelect(idx)}
                    className={`aspect-square rounded-lg overflow-hidden border-2 transition-all relative cursor-move
                      ${mainImageIndex === idx ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200 hover:border-slate-300'}
                      ${draggedIndex === idx ? 'opacity-50 scale-95' : ''}
                      ${draggedIndex !== null && draggedIndex !== idx ? 'hover:border-blue-400 hover:bg-blue-50' : ''}
                    `}
                  >
                    {label && <span className="absolute top-0 left-0 bg-yellow-400 text-xs px-1 font-bold z-10">{label}</span>}
                    <img src={img.url} alt={`Scene ${idx + 1}`} className="w-full h-full object-cover pointer-events-none" />
                    {mainImageIndex === idx && (
                      <div className="absolute top-1 left-1 bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded font-medium">
                        대표
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          
          {/* 섹션 표시/숨기기 컨트롤 */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-4 overflow-hidden">
            <button
              onClick={() => setIsSectionControlOpen(!isSectionControlOpen)}
              className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
            >
              <h4 className="font-bold text-slate-800 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-600" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                  <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                </svg>
                섹션 표시 설정
              </h4>
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className={`h-5 w-5 text-slate-400 transition-transform ${isSectionControlOpen ? 'rotate-180' : ''}`}
                viewBox="0 0 20 20" 
                fill="currentColor"
              >
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
            
            {isSectionControlOpen && (
              <div className="p-4 pt-0 border-t border-slate-100">
                <div className="space-y-1">
                  <SectionCheckbox sectionId="header" label="상단 인증 배지" hiddenSections={hiddenSections} onToggle={toggleSection} />
                  <SectionCheckbox sectionId="pricing" label="가격 정보" hiddenSections={hiddenSections} onToggle={toggleSection} />
                  <SectionCheckbox sectionId="hero" label="메인 히어로 이미지" hiddenSections={hiddenSections} onToggle={toggleSection} />
                  <SectionCheckbox sectionId="features" label="제품 특징" hiddenSections={hiddenSections} onToggle={toggleSection} />
                  <SectionCheckbox sectionId="usage" label="사용 시나리오" hiddenSections={hiddenSections} onToggle={toggleSection} />
                  <SectionCheckbox sectionId="cta" label="구매 유도 (CTA)" hiddenSections={hiddenSections} onToggle={toggleSection} />
                  <SectionCheckbox sectionId="footer" label="하단 CTA & 저작권" hiddenSections={hiddenSections} onToggle={toggleSection} />
                </div>
                <p className="text-xs text-slate-400 mt-2">체크 해제 시 해당 섹션이 숨겨지고 저장에서 제외됩니다.</p>
              </div>
            )}
          </div>

          <div className="space-y-3">
             <Button onClick={handleDownloadZip} variant="secondary" className="w-full text-sm">
                📂 개별 이미지 ZIP 다운로드
             </Button>
             <div className="flex gap-2">
               <Button onClick={handleDownloadFullPage} className="flex-1 text-sm bg-green-600 hover:bg-green-700">
                 🖼️ JPG 저장
               </Button>
               <Button onClick={handleCopyHTML} className="flex-1 text-sm bg-blue-600 hover:bg-blue-700">
                 📋 HTML 복사
               </Button>
             </div>
             
            {/* Undo/Redo 버튼 - 데스크톱에서만 표시 */}
            {(onUndo || onRedo) && (
              <div className="hidden sm:flex gap-2 mt-3">
                <button
                  onClick={onUndo}
                  disabled={!canUndo}
                  className={`flex-1 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all ${
                    !canUndo
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-slate-600 text-white hover:bg-slate-700'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd" />
                  </svg>
                  되돌리기
                </button>
                
                <button
                  onClick={onRedo}
                  disabled={!canRedo}
                  className={`flex-1 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all ${
                    !canRedo
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-slate-600 text-white hover:bg-slate-700'
                  }`}
                >
                  앞으로
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail Page Preview (Long Scrolling Layout) */}
      <div className="flex-1 order-1 lg:order-2 bg-white shadow-2xl overflow-hidden max-w-[860px] mx-auto border-x border-slate-200" ref={detailPageRef}>
        
        {/* Mock Marketplace Header */}
        {!hiddenSections.has('header') && (
        <div className="bg-white border-b border-slate-200 p-6 relative group" data-section="header">
           <div className="flex flex-col md:flex-row justify-between items-start gap-4">
             <div className="space-y-2 flex-1">
                {!hiddenSections.has('pricing') && (
                <div data-section="pricing">
                  <h1 className="text-3xl md:text-2xl font-medium text-slate-900 leading-snug break-keep">{productData.name}</h1>
                  <div className="flex items-end gap-2 mt-2">
                     {discountRate > 0 && <span className="text-red-500 font-bold text-3xl md:text-2xl">{discountRate}%</span>}
                     <span className="text-slate-900 font-bold text-4xl md:text-3xl">{price.toLocaleString()}원</span>
                     {discountRate > 0 && <span className="text-slate-400 line-through text-base md:text-sm mb-1">{originalPrice.toLocaleString()}원</span>}
                  </div>
                </div>
                )}
             </div>
             {!hiddenSections.has('pricing') && (
             <div className="text-right w-full md:w-auto" data-section="pricing">
                <div className="flex items-center gap-1 justify-end text-yellow-400 mb-1">
                   {'★★★★★'.split('').map((s, i) => <span key={i}>{s}</span>)}
                   <span className="text-slate-400 text-base md:text-sm font-medium ml-1">(4,892)</span>
                </div>
                <span className="inline-block px-3 py-1.5 bg-slate-100 text-slate-600 text-sm md:text-xs rounded font-medium">무료배송</span>
                <span className="inline-block px-3 py-1.5 bg-blue-50 text-blue-600 text-sm md:text-xs rounded font-medium ml-1">오늘출발</span>
             </div>
             )}
           </div>
           <div className="h-4 bg-slate-50 border-y border-slate-100 -mx-6 mt-6"></div>
        </div>
        )}

        {/* --- LONG FORM DETAIL CONTENT START --- */}
        <div className="flex flex-col">

          {/* 0. PROMOTION BANNER (If exists) */}
          {hasPromotion && promotionImage && (
            <div className="relative w-full group">
              <ImageFeedbackControl 
                imageIndex={promotionImage.index} 
                currentImage={promotionImage.data} 
                onUpdate={onImageUpdate}
                onRegenerate={onRegenerateImage}
                originalImages={originalImages}
                onScaleChange={handleScaleChange}
              />
              <div className="bg-red-600 text-white text-center py-2 font-bold uppercase tracking-widest text-xs">Special Event</div>
              <div className="relative w-full overflow-hidden">
                <img 
                  src={promotionImage.data.url} 
                  alt="Promotion Banner" 
                  className="w-full h-auto object-cover transition-transform duration-200"
                  style={{ 
                    transform: `scale(${(imageScales[promotionImage.index] || 100) / 100})`,
                    transformOrigin: 'center center'
                  }}
                />
              </div>
              <div className="bg-slate-900 text-yellow-400 text-center py-3 font-bold text-lg">
                📢 {productData.promotionText}
              </div>
            </div>
          )}
          
          {/* 1. HERO SECTION */}
          {!hiddenSections.has('hero') && (
          <div className="relative w-full group" data-section="hero">
             <ImageFeedbackControl 
                imageIndex={heroImage.index} 
                currentImage={heroImage.data} 
                onUpdate={onImageUpdate}
                onRegenerate={onRegenerateImage}
                originalImages={originalImages}
                onScaleChange={handleScaleChange}
             />
             <div className="relative w-full overflow-hidden">
               <img 
                 src={heroImage.data.url} 
                 alt="Main Hero" 
                 className="w-full h-auto object-cover transition-transform duration-200"
                 style={{ 
                   transform: `scale(${(imageScales[heroImage.index] || 100) / 100})`,
                   transformOrigin: 'center center'
                 }}
               />
             </div>
          </div>
          )}

          {/* 2. HOOK / INTRO (Headline & Pain Points) */}
          <div className="bg-slate-900 text-white py-24 px-8 text-center space-y-8 relative group">
             <SectionEditControl 
                sectionName="헤드라인/후킹" 
                onUpdate={async (feedback) => {
                   await handleSectionUpdate('headline', feedback);
                }} 
             />

             <p className="text-blue-400 font-bold tracking-[0.2em] text-sm uppercase">PREMIUM QUALITY</p>
             <h2 className="text-2xl md:text-5xl font-bold leading-tight break-keep">
               {copy.headline}
             </h2>
             <div className="w-16 h-1 bg-white mx-auto opacity-30 my-8"></div>
             
             {/* Pain Points Visualization */}
             {copy.painPoints && copy.painPoints.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12 max-w-2xl mx-auto text-left relative group">
                  <SectionEditControl 
                    sectionName="문제제기(PainPoint)" 
                    onUpdate={(fb) => handleSectionUpdate('painPoints', fb)} 
                  />
                  {copy.painPoints.map((point, idx) => (
                    <div key={idx} className="bg-slate-800 p-6 rounded-xl border border-slate-700">
                      <div className="text-red-400 font-bold mb-2 text-sm flex items-center gap-2">
                        <span>⚠️ PROBLEM 0{idx+1}</span>
                      </div>
                      <h4 className="text-xl md:text-lg font-bold text-white mb-2">{point.title}</h4>
                      <p className="text-slate-400 text-base md:text-sm leading-relaxed">{point.description}</p>
                    </div>
                  ))}
                </div>
             )}
          </div>

          {/* 3. LIFESTYLE / EMPATHY */}
          <div className="relative group">
             <SectionEditControl 
                sectionName="감성 문구" 
                onUpdate={(fb) => handleSectionUpdate('emotionalBenefit', fb)} 
             />
             <ImageFeedbackControl 
                imageIndex={lifestyleImage.index} 
                currentImage={lifestyleImage.data} 
                onUpdate={onImageUpdate}
                onRegenerate={onRegenerateImage}
                originalImages={originalImages}
                onScaleChange={handleScaleChange}
             />
             <div className="relative w-full overflow-hidden">
               <img 
                 src={lifestyleImage.data.url} 
                 alt="Lifestyle" 
                 className="w-full h-auto object-cover transition-transform duration-200"
                 style={{ 
                   transform: `scale(${(imageScales[lifestyleImage.index] || 100) / 100})`,
                   transformOrigin: 'center center'
                 }}
               />
             </div>
             <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-10 text-white text-center pointer-events-none">
                <p className="text-xl md:text-3xl font-light italic leading-relaxed">
                  "{copy.emotionalBenefit}"
                </p>
             </div>
          </div>

          {/* 4. SOLUTION TEXT */}
          <div className="py-20 px-8 text-center bg-white relative group">
            <SectionEditControl 
               sectionName="솔루션" 
               onUpdate={(fb) => handleSectionUpdate('solution', fb)} 
            />
            <h3 className="text-blue-600 font-bold text-2xl md:text-xl mb-4">이제 고민하지 마세요</h3>
            <p className="text-slate-800 text-xl md:text-2xl font-bold leading-relaxed max-w-3xl mx-auto break-keep">
              {copy.solution}
            </p>
          </div>

          {/* 5. KEY FEATURES (Alternating Layout) */}
          {!hiddenSections.has('features') && (
          <div className="flex flex-col gap-0 relative group" data-section="features">
             <SectionEditControl 
               sectionName="주요 특징"
               onUpdate={(fb) => handleSectionUpdate('features', fb)}
             />
             {features.map((feature, idx) => {
               const featureImg = featureImages[idx % featureImages.length];
               if (!featureImg) return null;
               
               return (
                 <div key={idx} className={`flex flex-col ${idx % 2 === 0 ? 'bg-slate-50' : 'bg-white'}`}>
                    <div className="py-16 px-8 text-center max-w-3xl mx-auto">
                       <span className="inline-block px-3 py-1 bg-black text-white text-xs font-bold mb-5 rounded-full">
                         POINT 0{idx + 1}
                       </span>
                       <h3 className="text-5xl md:text-4xl font-bold text-slate-900 mb-4 break-keep">{feature.title}</h3>
                       <p className="text-2xl md:text-lg text-blue-600 font-medium mb-6">{feature.subtitle}</p>
                       <p className="text-slate-600 text-2xl md:text-lg leading-relaxed break-keep">{feature.description}</p>
                    </div>
                    
                    <div className="w-full relative group">
                       <ImageFeedbackControl 
                          imageIndex={featureImg.index}
                          currentImage={featureImg.data}
                          onUpdate={onImageUpdate}
                          onRegenerate={onRegenerateImage}
                          originalImages={originalImages}
                          onScaleChange={handleScaleChange}
                       />
                       <div 
                         className="relative w-full"
                         style={{ 
                           maxHeight: '600px',
                           display: 'flex',
                           justifyContent: 'center',
                           alignItems: 'center',
                           backgroundColor: idx % 2 === 0 ? '#f8fafc' : '#ffffff'
                         }}
                       >
                         <img 
                            src={featureImg.data.url}
                            alt={feature.title}
                            style={{ 
                              maxWidth: '100%',
                              maxHeight: '600px',
                              width: 'auto',
                              height: 'auto',
                              objectFit: 'contain',
                              transform: `scale(${(imageScales[featureImg.index] || 100) / 100})`,
                              transformOrigin: 'center center',
                              transition: 'transform 0.2s'
                            }}
                         />
                       </div>
                    </div>
                 </div>
               );
             })}
          </div>
          )}

          {/* 5.5 EXTRA DESCRIPTION GALLERY (Inserted to use remaining images) */}
          {descriptionExtraImages.length > 0 && (
            <div className="bg-white">
              <div className="py-12 px-6 text-center">
                 <h3 className="text-xl font-bold text-slate-400 tracking-widest uppercase mb-4">Product Lookbook</h3>
              </div>
              <div className="flex flex-col gap-0">
                {descriptionExtraImages.map((img, idx) => (
                  <div key={`extra-${idx}`} className="w-full relative group">
                    <ImageFeedbackControl 
                       imageIndex={img.index} 
                       currentImage={img.data} 
                       onUpdate={onImageUpdate}
                       onRegenerate={onRegenerateImage}
                       originalImages={originalImages}
                       onScaleChange={handleScaleChange}
                    />
                    <div className="relative w-full overflow-hidden">
                      <img 
                        src={img.data.url} 
                        alt={`Lookbook ${idx + 1}`} 
                        className="w-full h-auto object-cover transition-transform duration-200"
                        style={{ 
                          transform: `scale(${(imageScales[img.index] || 100) / 100})`,
                          transformOrigin: 'center center'
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 6. USAGE SCENARIOS */}
          {!hiddenSections.has('usage') && (
          <div className="py-24 px-8 bg-slate-900 text-white relative group" data-section="usage">
             <SectionEditControl 
               sectionName="활용 예시" 
               onUpdate={(fb) => handleSectionUpdate('usageScenarios', fb)} 
             />
             <h3 className="text-5xl md:text-4xl font-bold text-center mb-12">이렇게 활용해보세요</h3>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
                {(copy.usageScenarios || []).map((usage, idx) => (
                  <div key={idx} className="bg-slate-800 p-6 rounded-2xl border border-slate-700 hover:border-blue-500 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold mb-4">
                      {idx + 1}
                    </div>
                    <h4 className="text-2xl md:text-xl font-bold mb-3">{usage.situation}</h4>
                    <p className="text-slate-400 text-2xl md:text-lg leading-relaxed">{usage.benefit}</p>
                  </div>
                ))}
             </div>
             {/* Context Image */}
             <div className="mt-12 max-w-4xl mx-auto rounded-2xl overflow-hidden border border-slate-700 relative group">
                <ImageFeedbackControl 
                   imageIndex={usageContextImage.index} 
                   currentImage={usageContextImage.data} 
                   onUpdate={onImageUpdate}
                   onRegenerate={onRegenerateImage}
                   originalImages={originalImages}
                   onScaleChange={handleScaleChange}
                />
                <div className="relative w-full overflow-hidden">
                  <img 
                    src={usageContextImage.data.url} 
                    alt="Context" 
                    className="w-full h-auto object-cover opacity-80 transition-transform duration-200"
                    style={{ 
                      transform: `scale(${(imageScales[usageContextImage.index] || 100) / 100})`,
                      transformOrigin: 'center center'
                    }}
                  />
                </div>
             </div>
          </div>
          )}

          {/* 7. DETAIL GALLERY (LIMITED TO 3 IMAGES) */}
          {detailViewImages.length > 0 && (
            <div className="py-20 px-0 bg-white border-t border-slate-100">
              <div className="text-center mb-12">
                <span className="text-blue-600 font-bold tracking-widest text-sm uppercase mb-2 block">DETAIL VIEW</span>
                <h3 className="text-5xl md:text-4xl font-bold text-slate-900">제품 디테일</h3>
              </div>
              <div className="flex flex-col gap-0 max-w-[860px] mx-auto">
                {detailViewImages.map((img, idx) => (
                  <div key={`detail-${idx}`} className="w-full relative group">
                    <ImageFeedbackControl 
                       imageIndex={img.index} 
                       currentImage={img.data} 
                       onUpdate={onImageUpdate}
                       onRegenerate={onRegenerateImage}
                       originalImages={originalImages}
                       onScaleChange={handleScaleChange}
                    />
                    <div className="relative w-full overflow-hidden">
                      <img 
                        src={img.data.url} 
                        alt={`Detail view ${idx + 1}`} 
                        className="w-full h-auto block transition-transform duration-200"
                        style={{ 
                          transform: `scale(${(imageScales[img.index] || 100) / 100})`,
                          transformOrigin: 'center center'
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 8. SPECS & FAQ */}
          <div className="py-20 px-6 bg-slate-50 border-t border-slate-200 relative group">
             <SectionEditControl 
               sectionName="FAQ 수정" 
               onUpdate={(fb) => handleSectionUpdate('faq', fb)} 
             />
             <h3 className="text-4xl md:text-3xl font-bold text-center mb-12 text-slate-900">자주 묻는 질문 (FAQ)</h3>
             <div className="max-w-3xl mx-auto space-y-4 mb-20">
               {(copy.faq || []).map((item, idx) => (
                 <div key={idx} className="border border-slate-200 rounded-lg p-6 bg-white shadow-sm">
                   <div className="flex items-start gap-3 mb-3">
                    <span className="text-blue-600 font-bold text-2xl md:text-xl">Q.</span>
                    <h4 className="font-bold text-slate-800 text-2xl md:text-xl">{item.question}</h4>
                   </div>
                   <div className="flex items-start gap-3 pl-1">
                    <span className="text-slate-400 font-bold text-2xl md:text-xl">A.</span>
                    <p className="text-slate-600 text-xl md:text-base leading-relaxed">{item.answer}</p>
                   </div>
                 </div>
               ))}
             </div>

             <div className="relative group pt-10">
               <SectionEditControl 
                  sectionName="제품 상세 스펙" 
                  onUpdate={(fb) => handleSectionUpdate('specs', fb)} 
               />
               <h3 className="text-4xl md:text-3xl font-bold text-center mb-8 text-slate-900">제품 상세 스펙</h3>
               <div className="max-w-xl mx-auto border-t-2 border-slate-900">
                 {(copy.specs || []).map((spec, idx) => (
                   <div key={idx} className="flex border-b border-slate-200 bg-white">
                     <div className="w-1/3 bg-slate-100 p-4 font-bold text-slate-700 text-xl md:text-base flex items-center justify-center">
                       {spec.label}
                     </div>
                     <div className="w-2/3 p-4 text-slate-700 text-xl md:text-base font-medium">
                       {spec.value}
                     </div>
                   </div>
                 ))}
               </div>
             </div>
          </div>

          {/* 9. FOOTER CTA */}
          {!hiddenSections.has('footer') && (
          <div className="bg-blue-50 py-16 px-6 text-center border-t border-blue-100" data-section="footer">
             <p className="text-blue-600 font-bold mb-4">지금 구매 시 혜택이 종료될 수 있습니다</p>
             <h3 className="text-3xl md:text-2xl font-bold text-slate-900 mb-8">고민은 배송만 늦출 뿐!</h3>
             <button className="w-full max-w-md bg-slate-900 text-white py-5 font-bold text-2xl md:text-xl rounded-full hover:bg-black transition-colors shadow-xl">
               최저가로 구매하기
             </button>
             <p className="mt-6 text-sm md:text-xs text-slate-400">
               본 상세페이지는 AI 상세페이지 제작 도구를 통해 생성된 가상 디자인 시안입니다.
             </p>
          </div>
          )}

        </div>
        {/* --- END LONG FORM CONTENT --- */}

      </div>
    </div>
  );
};