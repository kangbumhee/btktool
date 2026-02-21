import React, { useState, ChangeEvent, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { ProductData, Platform } from '../types';
import { Button } from './Button';
import { Toast } from './Toast';
import { searchProductInfo, analyzeFileContent, analyzeProductImage, analyzeImageWithVision } from '../services/geminiService';

// Handle esm.sh export structure (handle default export if present)
const pdfjs = (pdfjsLib as any).default ?? pdfjsLib;

// Set worker for PDF.js
// using cdnjs for the worker script as it serves a classic script compatible with importScripts
if (pdfjs.GlobalWorkerOptions) {
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

interface ProductInputProps {
  onSubmit: (data: ProductData) => void;
  isLoading: boolean;
}

export const ProductInput: React.FC<ProductInputProps> = ({ onSubmit, isLoading }) => {
  const [data, setData] = useState<ProductData>({
    name: '',
    description: '',
    targetAudience: '',
    images: [],
    selectedModel: 'flash',
    platform: 'smartstore',
    price: 0,
    discountRate: 20,
    promotionText: ''
  });

  const [isSearching, setIsSearching] = useState(false);
  const [isAnalyzingFile, setIsAnalyzingFile] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showPriceSearchModal, setShowPriceSearchModal] = useState(false);
  const [priceSearchResults, setPriceSearchResults] = useState<any[]>([]);
  const [isPriceSearching, setIsPriceSearching] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [marginCalc, setMarginCalc] = useState({
    sellingPrice: 0,
    costPrice: 0,
    shippingCost: 3000
  });
  const [marginTab, setMarginTab] = useState<'byMargin' | 'byCost'>('byMargin');
  const [competitorShipping, setCompetitorShipping] = useState<number>(0); // 경쟁사 배송비 (0: 무료, 3000: 유료)
  const [analyzedProduct, setAnalyzedProduct] = useState<{
    productName: string;
    brand: string;
    category: string;
    features: string[];
  } | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [longPressTimer, setLongPressTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [isDraggable, setIsDraggable] = useState(false);

  const handleTextChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setData(prev => ({ ...prev, [name]: value as any }));
  };
  
  const handleNumberChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setData(prev => ({ ...prev, [name]: parseInt(value) || 0 }));
  };

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newImages: string[] = [];
      const fileList = Array.from(files).slice(0, 5) as File[];
      
      // 현재 이미지가 없을 때만 첫 번째 이미지 분석
      const shouldAnalyze = data.images.length === 0;
      
      let processed = 0;
      fileList.forEach((file, index) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            newImages.push(reader.result);
            
            // 첫 번째 이미지이고, 기존 이미지가 없을 때만 분석
            if (index === 0 && shouldAnalyze) {
              handleAnalyzeAndSearch(reader.result);
            }
          }
          processed++;
          if (processed === fileList.length) {
            setData(prev => ({ ...prev, images: [...prev.images, ...newImages] }));
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removeImage = (index: number) => {
    setData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
  };

  // 이미지 순서 변경
  const handleImageReorder = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    
    const newImages = [...data.images];
    const [movedImage] = newImages.splice(fromIndex, 1);
    newImages.splice(toIndex, 0, movedImage);
    
    setData(prev => ({ ...prev, images: newImages }));
  };

  // 드래그 시작 (PC)
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  // 드래그 오버 (PC) - 이미지 순서 변경용
  const handleImageDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  // 드래그 리브 (PC) - 이미지 순서 변경용
  const handleImageDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverIndex(null);
  };

  // 드래그 종료 (PC)
  const handleDragEnd = () => {
    if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
      handleImageReorder(draggedIndex, dragOverIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // 길게 누르기 시작 (모바일)
  const handleTouchStart = (index: number) => {
    const timer = setTimeout(() => {
      setIsDraggable(true);
      setDraggedIndex(index);
      // 진동 피드백 (지원되는 경우)
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, 500); // 500ms 길게 누르기
    setLongPressTimer(timer);
  };

  // 터치 이동 (모바일)
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDraggable || draggedIndex === null) return;
    
    const touch = e.touches[0];
    const elements = document.elementsFromPoint(touch.clientX, touch.clientY);
    
    for (const el of elements) {
      const indexAttr = el.getAttribute('data-image-index');
      if (indexAttr !== null) {
        const index = parseInt(indexAttr);
        if (index !== draggedIndex) {
          setDragOverIndex(index);
        }
        break;
      }
    }
  };

  // 터치 종료 (모바일)
  const handleTouchEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    
    if (isDraggable && draggedIndex !== null && dragOverIndex !== null) {
      handleImageReorder(draggedIndex, dragOverIndex);
    }
    
    setIsDraggable(false);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // 드래그 앤 드롭 핸들러들
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const imageFiles = Array.from(files).filter(file => 
        file.type.startsWith('image/')
      );
      
      if (imageFiles.length === 0) {
        setToast({ message: '이미지 파일만 업로드 가능합니다.', type: 'error' });
        return;
      }
      
      // 기존 handleImageChange 로직 재사용
      const newImages: string[] = [];
      const fileList = imageFiles.slice(0, 5) as File[];
      
      // 현재 이미지가 없을 때만 첫 번째 이미지 분석
      const shouldAnalyze = data.images.length === 0;
      
      let processed = 0;
      fileList.forEach((file, index) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            newImages.push(reader.result);
            
            // 첫 번째 이미지이고, 기존 이미지가 없을 때만 분석
            if (index === 0 && shouldAnalyze) {
              handleAnalyzeAndSearch(reader.result);
            }
          }
          processed++;
          if (processed === fileList.length) {
            setData(prev => ({ ...prev, images: [...prev.images, ...newImages] }));
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleSearch = async () => {
    if (!data.name.trim()) {
      setToast({ message: '제품명을 입력해주세요.', type: 'error' });
      return;
    }
    setIsSearching(true);
    try {
      const result = await searchProductInfo(data.name);
      if (!result.description && !result.targetAudience) {
          throw new Error("검색 결과가 없습니다.");
      }
      setData(prev => ({
        ...prev,
        description: result.description || prev.description,
        targetAudience: result.targetAudience || prev.targetAudience
      }));
      setToast({ message: '제품 정보를 가져왔습니다!', type: 'success' });
    } catch (e) {
      console.error(e);
      setToast({ message: '정보를 찾지 못했습니다. 직접 입력해주세요.', type: 'error' });
    } finally {
      setIsSearching(false);
    }
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzingFile(true);
    try {
      let text = '';
      if (file.type === 'application/pdf') {
        const arrayBuffer = await file.arrayBuffer();
        // Use document loading task to better handle worker errors if they occur
        const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          fullText += pageText + ' ';
        }
        text = fullText;
      } else {
        // Text or Markdown
        text = await file.text();
      }
      
      if (!text.trim()) {
         setToast({ message: '파일에서 텍스트를 추출할 수 없습니다. 내용이 있는 파일을 업로드해주세요.', type: 'error' });
         return;
      }

      const analysis = await analyzeFileContent(text);
      setData(prev => ({
        ...prev,
        description: analysis.description || prev.description,
        targetAudience: analysis.targetAudience || prev.targetAudience
      }));
      
      setToast({ message: '파일 분석이 완료되었습니다!', type: 'success' });
    } catch (error) {
      console.error("File analysis failed", error);
      setToast({ message: '파일 분석 중 오류가 발생했습니다. (PDF, TXT, MD 파일만 지원됩니다)', type: 'error' });
    } finally {
      setIsAnalyzingFile(false);
      e.target.value = ''; // Reset input so the same file can be selected again
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (data.images.length > 0) {
      onSubmit(data);
    }
  };

  const handleModelChange = (model: 'flash' | 'pro') => {
    setData(prev => ({...prev, selectedModel: model}));
  };

  const handlePlatformChange = (platform: Platform) => {
    setData(prev => ({...prev, platform}));
  };

  const handleImageUpload = () => {
    setShowUploadModal(true);
  };

  const handleAutoSearch = () => {
    handleSearch();
  };

  // 이미지 분석 후 최저가 자동 검색
  const handleAnalyzeAndSearch = async (imageBase64: string) => {
    setIsAnalyzing(true);
    try {
      // 1단계: Gemini Vision으로 먼저 시도 (글자 있는 상품)
      console.log('1단계: Gemini Vision 분석 시작...');
      let analyzed = await analyzeProductImage(imageBase64);
      
      // 2단계: 상품명 못 찾으면 Google Vision으로 재시도 (글자 없는 상품)
      if (!analyzed.productName || analyzed.productName.trim() === '') {
        console.log('Gemini 실패, 2단계: Google Vision 분석 시작...');
        try {
          const visionResult = await analyzeImageWithVision(imageBase64);
          
          if (visionResult.productName) {
            analyzed = {
              productName: visionResult.productName,
              brand: visionResult.logos[0] || '',
              category: visionResult.labels[0] || '',
              features: visionResult.labels.slice(0, 3)
            };
            console.log('Google Vision 성공:', analyzed);
          }
        } catch (visionError) {
          console.error('Google Vision 실패:', visionError);
        }
      }
      
      setAnalyzedProduct(analyzed);
      
      if (analyzed.productName) {
        // 상품명 자동 입력
        setData(prev => ({ ...prev, name: analyzed.productName }));
        
        // 최저가 자동 검색
        await handlePriceSearch(analyzed.productName);
        
        setToast({ message: `상품 인식: ${analyzed.productName}`, type: 'success' });
      } else {
        setToast({ message: '상품을 인식하지 못했습니다. 직접 검색해주세요.', type: 'error' });
      }
    } catch (error) {
      console.error('이미지 분석 실패:', error);
      
      // Gemini 실패 시 Google Vision으로 재시도
      console.log('Gemini 오류, Google Vision으로 재시도...');
      try {
        const visionResult = await analyzeImageWithVision(imageBase64);
        
        if (visionResult.productName) {
          const analyzed = {
            productName: visionResult.productName,
            brand: visionResult.logos[0] || '',
            category: visionResult.labels[0] || '',
            features: visionResult.labels.slice(0, 3)
          };
          
          setAnalyzedProduct(analyzed);
          setData(prev => ({ ...prev, name: analyzed.productName }));
          await handlePriceSearch(analyzed.productName);
          
          setToast({ message: `상품 인식: ${analyzed.productName}`, type: 'success' });
        } else {
          setToast({ message: '상품을 인식하지 못했습니다. 직접 검색해주세요.', type: 'error' });
        }
      } catch (visionError) {
        console.error('Google Vision도 실패:', visionError);
        setToast({ message: '이미지 분석에 실패했습니다.', type: 'error' });
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 검색어 정리 함수 (용량, 수량 정보 제거)
  const cleanSearchQuery = (query: string): string => {
    // 괄호 안 내용 제거: (350mg x 15캡슐), (15일분) 등
    let cleaned = query.replace(/\([^)]*\)/g, '');
    
    // 용량/수량 패턴 제거: 5.25g, 350mg, 15캡슐, 30정, 500ml 등
    cleaned = cleaned.replace(/\d+(\.\d+)?\s*(g|mg|kg|ml|L|캡슐|정|개|입|포|매|팩|세트|박스|통)/gi, '');
    
    // x 숫자 패턴 제거: x 15, x15, X 30 등
    cleaned = cleaned.replace(/[xX]\s*\d+/g, '');
    
    // 연속 공백 제거 및 trim
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    return cleaned;
  };

  // 최저가 검색
  const handlePriceSearch = async (searchQuery?: string) => {
    const rawQuery = searchQuery || data.name;
    if (!rawQuery.trim()) {
      setToast({ message: '검색어를 입력해주세요.', type: 'error' });
      return;
    }
    
    // 검색어 정리
    const query = cleanSearchQuery(rawQuery);
    console.log('원본 검색어:', rawQuery);
    console.log('정리된 검색어:', query);
    
    setIsPriceSearching(true);
    setShowPriceSearchModal(true);
    
    try {
      const response = await fetch(
        `https://detail-page-api.kbhjjan.workers.dev/naver/search?query=${encodeURIComponent(query)}`
      );
      const result = await response.json();
      setPriceSearchResults(result.items || []);
      
      // 검색된 검색어를 모달에 표시하기 위해 저장
      setAnalyzedProduct(prev => prev ? { ...prev, productName: query } : { productName: query, brand: '', category: '', features: [] });
    } catch (error) {
      console.error('최저가 검색 실패:', error);
      setPriceSearchResults([]);
      setToast({ message: '검색에 실패했습니다.', type: 'error' });
    } finally {
      setIsPriceSearching(false);
    }
  };

  // 목표 마진별 필요 판매가 계산
  const calculateRequiredPrice = (costPrice: number, shippingCost: number, targetMargin: number, feeRate: number) => {
    // 판매가 = (원가 + 배송비 + 목표마진) / (1 - 수수료율)
    const requiredPrice = (costPrice + shippingCost + targetMargin) / (1 - feeRate);
    return Math.ceil(requiredPrice / 100) * 100; // 100원 단위 올림
  };

  // 경쟁사 가격 기준 목표 마진별 필요 원가 계산
  const generateMarginTable = (competitorPrice: number) => {
    const coupangRate = 0.108;
    const smartstoreRate = 0.055;
    const targetMargins = [1000, 3000, 5000, 7000, 10000];
    
    return targetMargins.map(margin => {
      // 원가 = 판매가 - 수수료 - 배송비 - 목표마진
      // 원가 = 판매가 × (1 - 수수료율) - 배송비 - 목표마진
      
      // 무료배송 (배송비 0원)
      const coupangCostFree = Math.floor(competitorPrice * (1 - coupangRate) - margin);
      const smartstoreCostFree = Math.floor(competitorPrice * (1 - smartstoreRate) - margin);
      
      // 배송비 3,000원
      const coupangCostPaid = Math.floor(competitorPrice * (1 - coupangRate) - 3000 - margin);
      const smartstoreCostPaid = Math.floor(competitorPrice * (1 - smartstoreRate) - 3000 - margin);
      
      return {
        targetMargin: margin,
        coupangFreeShipping: coupangCostFree,
        smartstoreFreeShipping: smartstoreCostFree,
        coupangPaidShipping: coupangCostPaid,
        smartstorePaidShipping: smartstoreCostPaid,
      };
    });
  };

  // 실제 마진 계산 (판매가 입력 시)
  const calculateActualMargin = (sellingPrice: number, costPrice: number, shippingCost: number) => {
    const coupangRate = 0.108;
    const smartstoreRate = 0.055;
    
    const coupangFee = Math.round(sellingPrice * coupangRate);
    const smartstoreFee = Math.round(sellingPrice * smartstoreRate);
    
    const coupangMargin = sellingPrice - costPrice - shippingCost - coupangFee;
    const smartstoreMargin = sellingPrice - costPrice - shippingCost - smartstoreFee;
    
    return {
      coupangFee,
      smartstoreFee,
      coupangMargin,
      smartstoreMargin,
      coupangMarginRate: sellingPrice > 0 ? (coupangMargin / sellingPrice * 100).toFixed(1) : '0',
      smartstoreMarginRate: sellingPrice > 0 ? (smartstoreMargin / sellingPrice * 100).toFixed(1) : '0'
    };
  };

  const handleGenerate = (e: React.FormEvent) => {
    handleSubmit(e);
  };

  const canGenerate = data.images.length > 0 && data.name.trim().length > 0;

  return (
    <div className="max-w-5xl mx-auto">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-4 md:p-8">
        <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
          
          {/* AI 모델 안내 */}
          <div className="mb-4 md:mb-6 p-3 md:p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border border-purple-100">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">🤖</span>
              <span className="font-semibold text-sm md:text-base text-slate-700">AI 이미지 생성</span>
            </div>
            <p className="text-xs md:text-sm text-slate-600">
              Nano Banana AI 모델 사용 • <span className="text-purple-600 font-medium">1장당 ~27원 ($0.02)</span>
            </p>
          </div>

          {/* Platform Selection */}
          <div className="mb-4 md:mb-6">
            <label className="block text-sm md:text-base font-semibold text-slate-700 mb-2 md:mb-3 flex items-center gap-2">
              <span>🛒</span> 판매 플랫폼
            </label>
            <div className="grid grid-cols-2 gap-2 md:gap-3">
              {/* 스마트스토어 - 왼쪽 (첫 번째) */}
              <button
                type="button"
                onClick={() => handlePlatformChange('smartstore')}
                className={`p-3 md:p-4 rounded-xl border-2 transition-all duration-300 hover:scale-105 hover:-translate-y-1 hover:shadow-lg text-left ${
                  data.platform === 'smartstore'
                    ? 'border-green-500 bg-green-50'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="font-bold text-sm md:text-base text-slate-800">🛍️ 스마트스토어</div>
                <div className="text-xs md:text-sm text-slate-500 mt-1">9+ 장면 자동 생성</div>
                <p className="text-xs text-green-600 font-medium mt-1">9장 생성 • 약 243원</p>
              </button>
              {/* 쿠팡 - 오른쪽 (두 번째) */}
              <button
                type="button"
                onClick={() => handlePlatformChange('coupang')}
                className={`p-3 md:p-4 rounded-xl border-2 transition-all duration-300 hover:scale-105 hover:-translate-y-1 hover:shadow-lg text-left ${
                  data.platform === 'coupang'
                    ? 'border-red-500 bg-red-50'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="font-bold text-sm md:text-base text-slate-800">🚀 쿠팡</div>
                <div className="text-xs md:text-sm text-slate-500 mt-1">12+ 장면 자동 생성</div>
                <p className="text-xs text-orange-600 font-medium mt-1">12장 생성 • 약 324원</p>
              </button>
            </div>
          </div>

          {/* Product Images */}
          <div className="mb-4 md:mb-6">
            <label className="block text-sm md:text-base font-semibold text-slate-700 mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span>📸</span> 제품 사진
                <span className="text-xs md:text-sm font-normal text-slate-400">(여러 장 선택 가능)</span>
              </div>
              <p className="text-xs text-purple-500 font-normal mt-1">
                💡 첫 번째 사진만 AI가 분석합니다. 2번째부터는 참조 이미지로 사용됩니다.
              </p>
            </label>
            <div 
              className={`border-2 border-dashed rounded-xl p-4 md:p-8 text-center transition-all duration-300 cursor-pointer hover:scale-[1.02] hover:shadow-lg ${
                isDragging 
                  ? 'border-purple-500 bg-purple-100 scale-[1.02]' 
                  : 'border-slate-300 hover:border-purple-400 hover:bg-purple-50/50'
              }`}
              onClick={handleImageUpload}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <input 
                type="file" 
                ref={fileInputRef}
                className="hidden" 
                multiple 
                accept="image/*" 
                onChange={handleImageChange} 
              />
              <input 
                type="file" 
                ref={cameraInputRef}
                className="hidden" 
                accept="image/*" 
                capture="environment"
                onChange={handleImageChange} 
              />
              {data.images.length > 0 ? (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    {data.images.map((img, idx) => (
                      <div 
                        key={idx} 
                        data-image-index={idx}
                        draggable
                        onDragStart={(e) => handleDragStart(e, idx)}
                        onDragOver={(e) => handleImageDragOver(e, idx)}
                        onDragLeave={handleImageDragLeave}
                        onDragEnd={handleDragEnd}
                        onTouchStart={() => handleTouchStart(idx)}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        className={`relative aspect-square cursor-move transition-all duration-200 ${
                          draggedIndex === idx ? 'opacity-50 scale-95' : ''
                        } ${
                          dragOverIndex === idx ? 'ring-2 ring-purple-500 ring-offset-2' : ''
                        }`}
                      >
                        <img 
                          src={img} 
                          alt={`Upload ${idx}`} 
                          className="w-full h-full object-cover rounded-lg border border-slate-200 pointer-events-none" 
                        />
                        {/* 첫 번째 이미지 표시 */}
                        {idx === 0 && (
                          <div className="absolute top-1 left-1 bg-purple-500 text-white text-xs px-1.5 py-0.5 rounded-md font-medium">
                            메인
                          </div>
                        )}
                        {/* 순서 표시 */}
                        <div className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded-md">
                          {idx + 1}
                        </div>
                        {/* 삭제 버튼 */}
                        <button 
                          type="button" 
                          onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    ))}
                    {/* 추가 버튼 */}
                    <div 
                      onClick={() => setShowUploadModal(true)}
                      className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg hover:border-purple-400 hover:bg-purple-50/50 transition-all aspect-square cursor-pointer"
                    >
                      <span className="text-2xl text-slate-400">+</span>
                    </div>
                  </div>
                  {data.images.length > 1 && (
                    <p className="text-xs text-slate-400 mt-2 text-center">
                      💡 이미지를 드래그하여 순서를 변경할 수 있습니다 (모바일: 길게 누르기)
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="text-4xl mb-3">🖼️</div>
                  {isDragging ? (
                    <p className="text-slate-600 font-medium text-base">여기에 놓으세요!</p>
                  ) : (
                    <div className="flex flex-col items-center gap-2 md:gap-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowUploadModal(true);
                        }}
                        className="px-4 py-2.5 md:px-6 md:py-3 bg-purple-500 text-white rounded-xl font-medium text-sm md:text-base flex items-center gap-2 hover:bg-purple-600 transition-all"
                      >
                        📷 이미지 추가
                      </button>
                      <p className="text-xs md:text-sm text-slate-400">또는 이미지를 여기에 드래그하세요</p>
                      <p className="text-purple-500 text-xs mt-1">💡 깨끗한 흰색 배경 이미지가 가장 좋아요</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Product Name */}
          <div className="mb-4 md:mb-6">
            <label className="block text-sm md:text-base font-semibold text-slate-700 mb-2 md:mb-3 flex items-center gap-2">
              <span>📦</span> 제품명
            </label>
            <div className="flex flex-col md:flex-row gap-2">
              <input
                type="text"
                name="name"
                id="name"
                required
                placeholder="예: 프리미엄 무선 이어폰, 유기농 그린티 세트"
                className="flex-1 px-3 py-2.5 md:px-4 md:py-4 text-sm md:text-base border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                value={data.name}
                onChange={handleTextChange}
              />
              <div className="flex gap-2">
                <button 
                  type="button" 
                  onClick={handleAutoSearch}
                  disabled={isSearching || !data.name.trim()}
                  className="flex-1 md:flex-none px-3 py-2.5 md:px-5 md:py-3 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-xl font-bold text-sm md:text-base hover:opacity-90 transition-all duration-300 hover:scale-105 hover:shadow-lg flex items-center justify-center gap-1.5 md:gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  {isSearching ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <span>🔍</span>
                  )}
                  <span className="text-xs md:text-sm">자동검색</span>
                </button>
                <button 
                  type="button" 
                  onClick={() => handlePriceSearch()}
                  disabled={isPriceSearching || !data.name.trim()}
                  className="flex-1 md:flex-none px-3 py-2.5 md:px-4 md:py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl font-bold text-sm md:text-base hover:opacity-90 transition-all duration-300 hover:scale-105 hover:shadow-lg flex items-center justify-center gap-1.5 md:gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  {isPriceSearching ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <span>💰</span>
                  )}
                  <span className="text-xs md:text-sm">최저가</span>
                </button>
              </div>
            </div>
            <p className="text-slate-400 text-xs md:text-sm mt-2">
              제품명 입력 후 자동검색하면 설명과 타겟이 자동으로 채워집니다
            </p>
          </div>

          {/* Price & Discount - 상품명 아래로 이동 */}
          <div className="grid grid-cols-2 gap-2 md:gap-4 mb-4 md:mb-6">
             <div>
                <label htmlFor="price" className="block text-sm md:text-base font-semibold text-slate-700 mb-1.5 md:mb-2">💰 판매가 (원)</label>
                <input
                  type="number"
                  name="price"
                  id="price"
                  className="w-full px-3 py-2.5 md:px-4 md:py-4 text-sm md:text-base border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all"
                  placeholder="최저가 검색 후 자동 입력"
                  value={data.price || ''}
                  onChange={handleNumberChange}
                />
                <p className="text-slate-400 text-xs mt-1">최저가 검색에서 상품 선택 시 자동 입력됩니다</p>
             </div>
             <div>
                <label htmlFor="discountRate" className="block text-sm md:text-base font-semibold text-slate-700 mb-1.5 md:mb-2">🏷️ 할인율 (%)</label>
                <input
                  type="number"
                  name="discountRate"
                  id="discountRate"
                  className="w-full px-3 py-2.5 md:px-4 md:py-4 text-sm md:text-base border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all"
                  placeholder="20"
                  value={data.discountRate || ''}
                  onChange={handleNumberChange}
                />
             </div>
          </div>

          {/* File Upload */}
          <div className="mb-4 md:mb-6">
            <label className="block text-sm md:text-base font-semibold text-slate-700 mb-1.5 md:mb-2">제품 정보 파일 업로드 (PDF, TXT, MD)</label>
            <div className="relative">
              <input 
                type="file" 
                accept=".pdf,.txt,.md"
                onChange={handleFileUpload}
                className="w-full px-3 py-2.5 md:px-4 md:py-4 text-xs md:text-sm border border-slate-300 rounded-xl file:mr-2 md:file:mr-4 file:py-1.5 md:file:py-2 file:px-2 md:file:px-4 file:rounded-full file:border-0 file:text-xs md:file:text-sm file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700 cursor-pointer"
                disabled={isAnalyzingFile}
              />
              {isAnalyzingFile && (
                <div className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 flex items-center text-purple-600 text-xs md:text-sm">
                  <svg className="animate-spin h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="text-xs md:text-sm">파일 분석 중...</span>
                </div>
              )}
            </div>
            <p className="text-xs md:text-sm text-slate-400 mt-1.5 md:mt-2">파일을 업로드하면 내용을 자동으로 분석하여 설명과 타겟을 채워줍니다.</p>
          </div>

          {/* Description */}
          <div className="mb-4 md:mb-6">
            <label htmlFor="description" className="block text-sm md:text-base font-semibold text-slate-700 mb-1.5 md:mb-2">제품 설명</label>
            <textarea
              name="description"
              id="description"
              rows={4}
              required
              className="w-full px-3 py-2.5 md:px-4 md:py-4 text-sm md:text-base border border-slate-300 rounded-xl placeholder-slate-400 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all resize-none"
              placeholder="제품의 특징, 소재, 장점 등을 적거나 '자동검색' 또는 '파일업로드'를 이용하세요."
              value={data.description}
              onChange={handleTextChange}
            />
          </div>

          {/* Target Audience */}
          <div className="mb-4 md:mb-6">
            <label htmlFor="targetAudience" className="block text-sm md:text-base font-semibold text-slate-700 mb-1.5 md:mb-2">타겟 고객 / 분위기 (선택)</label>
            <input
              type="text"
              name="targetAudience"
              id="targetAudience"
              className="w-full px-3 py-2.5 md:px-4 md:py-4 text-sm md:text-base border border-slate-300 rounded-xl placeholder-slate-400 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all"
              placeholder="예: 20대 대학생, 미니멀리즘"
              value={data.targetAudience}
              onChange={handleTextChange}
            />
          </div>

          {/* Promotion */}
          <div className="mb-4 md:mb-6">
            <label htmlFor="promotionText" className="block text-sm md:text-base font-semibold text-slate-700 mb-1.5 md:mb-2">이벤트/프로모션 (선택)</label>
            <input
              type="text"
              name="promotionText"
              id="promotionText"
              className="w-full px-3 py-2.5 md:px-4 md:py-4 text-sm md:text-base border border-slate-300 rounded-xl placeholder-slate-400 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all"
              placeholder="예: 여름맞이 1+1 행사, 런칭 기념 30% 할인"
              value={data.promotionText || ''}
              onChange={handleTextChange}
            />
            <p className="text-xs md:text-sm text-slate-400 mt-1.5 md:mt-2">입력 시 상세페이지 최상단에 이벤트 배너 장면이 추가됩니다.</p>
          </div>

          {/* Generate Button */}
          <button
            type="submit"
            onClick={handleGenerate}
            disabled={isLoading || !canGenerate}
            className="w-full py-3.5 md:py-5 bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 text-white rounded-xl md:rounded-2xl font-bold text-base md:text-xl shadow-lg shadow-purple-200 hover:shadow-2xl hover:shadow-purple-300 transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:translate-y-0 flex items-center justify-center gap-2 md:gap-3"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 md:w-5 md:h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span className="text-sm md:text-base">생성 중...</span>
              </>
            ) : (
              <>
                <span>🚀</span> <span className="text-sm md:text-base">상세페이지 생성하기</span>
              </>
            )}
          </button>

          {/* Checklist */}
          <div className="mt-4 md:mt-6 p-3 md:p-5 bg-slate-50 rounded-xl transition-all duration-300 hover:bg-slate-100 hover:shadow-md">
            <div className="flex items-center gap-2 mb-2 md:mb-3">
              <span>✅</span>
              <span className="font-semibold text-sm md:text-base text-slate-700">자동 적용 사항</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5 md:gap-2 text-sm md:text-base">
              <div className="flex items-center gap-2 text-slate-600 transition-all duration-200 hover:text-purple-600 hover:translate-x-1">
                <span className="text-green-500">✓</span> 플랫폼 규정 자동 준수
              </div>
              <div className="flex items-center gap-2 text-slate-600 transition-all duration-200 hover:text-purple-600 hover:translate-x-1">
                <span className="text-green-500">✓</span> 1000px 정방형 이미지
              </div>
              <div className="flex items-center gap-2 text-slate-600 transition-all duration-200 hover:text-purple-600 hover:translate-x-1">
                <span className="text-green-500">✓</span> 모바일 최적화 디자인
              </div>
            </div>
          </div>
        </form>
      </div>
      
      {/* 이미지 업로드 모달 */}
      {showUploadModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowUploadModal(false)}
        >
          <div 
            className="bg-white rounded-2xl p-6 mx-4 w-full max-w-xs shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-center mb-4">이미지 추가</h3>
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => {
                  cameraInputRef.current?.click();
                  setShowUploadModal(false);
                }}
                className="w-full py-3 bg-blue-500 text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-blue-600"
              >
                📷 사진 촬영
              </button>
              <button
                type="button"
                onClick={() => {
                  fileInputRef.current?.click();
                  setShowUploadModal(false);
                }}
                className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-gray-200"
              >
                📁 갤러리에서 선택
              </button>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="w-full py-2 text-gray-400 text-sm"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 이미지 분석 중 로딩 오버레이 */}
      {isAnalyzing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 mx-4 text-center shadow-xl">
            <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-lg font-bold text-slate-700">🔍 AI가 상품을 분석하고 있습니다...</p>
            <p className="text-sm text-slate-500 mt-2">잠시만 기다려주세요</p>
          </div>
        </div>
      )}

      {/* 자동검색 중 로딩 오버레이 */}
      {isSearching && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 mx-4 text-center shadow-xl">
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-lg font-bold text-slate-700">🔍 상품 정보를 검색하고 있습니다...</p>
            <p className="text-sm text-slate-500 mt-2">잠시만 기다려주세요</p>
          </div>
        </div>
      )}

      {/* 최저가 검색 모달 */}
      {showPriceSearchModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 overflow-y-auto py-4"
          onClick={() => setShowPriceSearchModal(false)}
        >
          <div 
            className="bg-white rounded-2xl p-4 mx-2 w-full max-w-2xl shadow-xl my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="p-4 border-b bg-gradient-to-r from-green-500 to-emerald-500 text-white flex-shrink-0">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold">💰 최저가 검색</h3>
                  <p className="text-sm text-green-100 mt-1">
                    {analyzedProduct?.productName || data.name} | {priceSearchResults.length}개 상품
                  </p>
                </div>
                <button 
                  onClick={() => setShowPriceSearchModal(false)}
                  className="text-white hover:bg-white/20 rounded-full p-2 text-xl"
                >
                  ✕
                </button>
              </div>
              {/* 분석 결과 표시 */}
              {analyzedProduct && (
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {analyzedProduct.brand && (
                    <span className="px-2 py-1 bg-white/20 rounded">브랜드: {analyzedProduct.brand}</span>
                  )}
                  {analyzedProduct.category && (
                    <span className="px-2 py-1 bg-white/20 rounded">카테고리: {analyzedProduct.category}</span>
                  )}
                </div>
              )}
              {/* 수동 검색 */}
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  placeholder="검색어 수정..."
                  className="flex-1 px-3 py-2 rounded-lg text-slate-800 text-sm"
                  defaultValue={analyzedProduct?.productName || data.name}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handlePriceSearch((e.target as HTMLInputElement).value);
                    }
                  }}
                />
                <button
                  onClick={(e) => {
                    const input = (e.currentTarget.previousElementSibling as HTMLInputElement);
                    handlePriceSearch(input.value);
                  }}
                  className="px-4 py-2 bg-white text-green-600 rounded-lg font-medium hover:bg-green-50"
                >
                  재검색
                </button>
              </div>
            </div>

            {/* 검색 결과 */}
            <div className="p-4">
              {isPriceSearching || isAnalyzing ? (
                <div className="flex flex-col items-center justify-center py-10">
                  <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="mt-3 text-slate-600">
                    {isAnalyzing ? '이미지 분석 중...' : '최저가 검색 중...'}
                  </span>
                </div>
              ) : priceSearchResults.length === 0 ? (
                <div className="text-center py-10 text-slate-500">
                  <p className="text-4xl mb-3">🔍</p>
                  <p>검색 결과가 없습니다</p>
                  <p className="text-sm mt-1">검색어를 수정해보세요</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {priceSearchResults.map((item, index) => (
                    <div key={index}>
                      {/* 상품 카드 */}
                      <div 
                        className={`flex gap-2 p-2 border rounded-xl hover:shadow-md transition-all cursor-pointer ${
                          selectedProduct?.link === item.link ? 'border-green-500 bg-green-50 shadow-md' : 'border-slate-200 hover:border-green-300'
                        }`}
                        onClick={() => {
                          if (selectedProduct?.link === item.link) {
                            setSelectedProduct(null);
                          } else {
                            setSelectedProduct(item);
                            setMarginCalc(prev => ({ ...prev, sellingPrice: item.price, costPrice: item.price }));
                            setData(prev => ({ ...prev, price: item.price }));
                          }
                        }}
                      >
                        {/* 상품 이미지 */}
                        {item.image && (
                          <img 
                            src={item.image} 
                            alt={item.title} 
                            className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                          />
                        )}
                        
                        {/* 상품 정보 */}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-700 line-clamp-2">{item.title}</p>
                          <p className="text-sm font-bold text-green-600 mt-1">{item.price?.toLocaleString()}원</p>
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            <span className="text-xs text-slate-500">{item.mallName}</span>
                            {item.isOfficial && (
                              <span className="text-xs bg-blue-100 text-blue-600 px-1 rounded">공식</span>
                            )}
                          </div>
                        </div>
                        
                        {/* 선택 표시 */}
                        <div className="flex items-center">
                          {selectedProduct?.link === item.link ? (
                            <span className="text-green-500 text-lg">✓</span>
                          ) : (
                            <span className="text-slate-300 text-sm">선택</span>
                          )}
                        </div>
                      </div>
                      
                      {/* 선택된 상품 바로 아래에 마진 계산기 표시 */}
                      {selectedProduct?.link === item.link && (
                        <div className="bg-slate-50 border border-t-0 border-green-500 rounded-b-xl p-3 -mt-1">
                          {/* 마진 계산기 헤더 */}
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-bold text-slate-700 text-sm flex items-center gap-1">
                              📊 마진 계산기
                            </h4>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedProduct(null);
                              }}
                              className="text-slate-400 hover:text-slate-600 p-1"
                            >
                              ✕
                            </button>
                          </div>
                          
                          {/* 경쟁사 최저가 + 링크 + 배송비 설정 */}
                          <div className="bg-green-100 p-2 rounded-lg mb-2">
                            <a 
                              href={item.link} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="block hover:underline"
                            >
                              <p className="text-sm font-bold text-green-700">
                                경쟁사 최저가: {item.price?.toLocaleString()}원 
                                <span className="text-xs font-normal ml-1">🔗 클릭하여 확인</span>
                              </p>
                            </a>
                            
                            {/* 경쟁사 배송비 설정 */}
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-xs text-slate-600">경쟁사 배송비:</span>
                              <div className="flex bg-slate-200 rounded-lg p-0.5">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setCompetitorShipping(0); }}
                                  className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                                    competitorShipping === 0 ? 'bg-white text-green-600 shadow-sm' : 'text-slate-500'
                                  }`}
                                >
                                  무료배송
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setCompetitorShipping(3000); }}
                                  className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                                    competitorShipping === 3000 ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500'
                                  }`}
                                >
                                  +3,000원
                                </button>
                              </div>
                              <span className="text-xs text-slate-500">
                                (실제가: {(item.price + competitorShipping)?.toLocaleString()}원)
                              </span>
                            </div>
                          </div>

                          {/* 수동 판매가 입력 */}
                          <div className="mb-3">
                            <label className="block text-xs font-medium text-slate-600 mb-1">내 판매가 (원)</label>
                            <input
                              type="number"
                              value={marginCalc.sellingPrice || ''}
                              onChange={(e) => {
                                e.stopPropagation();
                                const price = Number(e.target.value);
                                setMarginCalc(prev => ({ ...prev, sellingPrice: price }));
                                setData(prev => ({ ...prev, price: price }));
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full px-2 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                              placeholder="판매가 입력"
                            />
                            {marginCalc.sellingPrice > 0 && item.price && (
                              <p className={`text-xs mt-1 ${marginCalc.sellingPrice > (item.price + competitorShipping) ? 'text-red-500' : 'text-blue-500'}`}>
                                경쟁사 대비 {marginCalc.sellingPrice > (item.price + competitorShipping) ? '+' : ''}{(marginCalc.sellingPrice - (item.price + competitorShipping)).toLocaleString()}원 
                                ({marginCalc.sellingPrice > (item.price + competitorShipping) ? '비쌈' : '저렴'})
                              </p>
                            )}
                          </div>

                          {/* 탭 선택 */}
                          <div className="flex mb-2 bg-slate-200 rounded-lg p-0.5">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setMarginTab('byMargin'); }}
                              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                                marginTab === 'byMargin' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500'
                              }`}
                            >
                              목표 마진 → 필요 원가
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setMarginTab('byCost'); }}
                              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                                marginTab === 'byCost' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500'
                              }`}
                            >
                              원가 입력 → 마진 계산
                            </button>
                          </div>

                          {/* 탭1: 목표 마진 → 필요 원가 */}
                          {marginTab === 'byMargin' && (
                            <div className="overflow-x-auto">
                              <p className="text-xs font-medium text-slate-700 mb-1">
                                💡 목표 마진을 남기려면 원가가 이하여야 합니다 
                                <span className="text-slate-500">(경쟁사 배송비 {competitorShipping === 0 ? '무료' : '+3천원'} 기준)</span>
                              </p>
                              <table className="w-full text-xs border-collapse">
                                <thead>
                                  <tr className="bg-slate-200">
                                    <th className="border border-slate-300 px-1 py-1 text-center">목표 마진</th>
                                    <th className="border border-slate-300 px-1 py-1 text-center" colSpan={2}>무료배송</th>
                                    <th className="border border-slate-300 px-1 py-1 text-center" colSpan={2}>배송비 3천원</th>
                                  </tr>
                                  <tr className="bg-slate-100">
                                    <th className="border border-slate-300 px-1 py-1"></th>
                                    <th className="border border-slate-300 px-1 py-1 text-xs text-orange-600">쿠팡</th>
                                    <th className="border border-slate-300 px-1 py-1 text-xs text-green-600">스토어</th>
                                    <th className="border border-slate-300 px-1 py-1 text-xs text-orange-600">쿠팡</th>
                                    <th className="border border-slate-300 px-1 py-1 text-xs text-green-600">스토어</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {[1000, 3000, 5000, 7000, 10000].map((targetMargin, idx) => {
                                    const basePrice = (marginCalc.sellingPrice || item.price) + competitorShipping;
                                    const coupangRate = 0.108;
                                    const smartstoreRate = 0.055;
                                    
                                    // 내가 무료배송일 때: 배송비를 내가 부담하므로 원가에서 3000원 빠짐
                                    const coupangFree = Math.floor(basePrice * (1 - coupangRate) - 3000 - targetMargin);
                                    const smartstoreFree = Math.floor(basePrice * (1 - smartstoreRate) - 3000 - targetMargin);
                                    
                                    // 내가 배송비 3천원 받을 때: 고객이 배송비 부담하므로 원가 여유 있음
                                    const coupangPaid = Math.floor(basePrice * (1 - coupangRate) - targetMargin);
                                    const smartstorePaid = Math.floor(basePrice * (1 - smartstoreRate) - targetMargin);
                                    
                                    return (
                                      <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                        <td className="border border-slate-300 px-1 py-1 text-center font-medium text-blue-600">
                                          +{(targetMargin / 1000).toFixed(0)}천원
                                        </td>
                                        <td className={`border border-slate-300 px-1 py-1 text-center ${coupangFree < 0 ? 'text-red-500' : 'text-orange-600'}`}>
                                          {coupangFree < 0 ? '불가' : `${(coupangFree / 1000).toFixed(1)}천`}
                                        </td>
                                        <td className={`border border-slate-300 px-1 py-1 text-center ${smartstoreFree < 0 ? 'text-red-500' : 'text-green-600'}`}>
                                          {smartstoreFree < 0 ? '불가' : `${(smartstoreFree / 1000).toFixed(1)}천`}
                                        </td>
                                        <td className={`border border-slate-300 px-1 py-1 text-center ${coupangPaid < 0 ? 'text-red-500' : 'text-orange-600'}`}>
                                          {coupangPaid < 0 ? '불가' : `${(coupangPaid / 1000).toFixed(1)}천`}
                                        </td>
                                        <td className={`border border-slate-300 px-1 py-1 text-center ${smartstorePaid < 0 ? 'text-red-500' : 'text-green-600'}`}>
                                          {smartstorePaid < 0 ? '불가' : `${(smartstorePaid / 1000).toFixed(1)}천`}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* 탭2: 원가 입력 → 마진 계산 */}
                          {marginTab === 'byCost' && (
                            <div>
                              <p className="text-xs text-slate-500 mb-2">
                                (경쟁사 배송비 {competitorShipping === 0 ? '무료' : '+3천원'} 기준, 실제 경쟁가: {(item.price + competitorShipping)?.toLocaleString()}원)
                              </p>
                              
                              <div className="mb-2">
                                <label className="block text-xs font-medium text-slate-600 mb-1">내 원가 (원)</label>
                                <input
                                  type="number"
                                  value={marginCalc.costPrice || ''}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    setMarginCalc(prev => ({ ...prev, costPrice: Number(e.target.value) }));
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-full px-2 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                  placeholder="원가 입력"
                                />
                              </div>

                              {marginCalc.costPrice > 0 && (
                                <div className="bg-white p-2 rounded-lg border border-slate-200">
                                  <p className="text-xs font-medium text-slate-700 mb-2">
                                    💰 예상 마진 (판매가: {(marginCalc.sellingPrice || item.price)?.toLocaleString()}원 기준)
                                  </p>
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="bg-orange-50 p-2 rounded">
                                      <p className="text-orange-600 font-medium">쿠팡 (10.8%)</p>
                                      <p className="text-slate-600">내가 무료배송: <span className={`font-bold ${((marginCalc.sellingPrice || item.price) * 0.892 - marginCalc.costPrice) < 0 ? 'text-red-500' : 'text-orange-600'}`}>
                                        {Math.floor((marginCalc.sellingPrice || item.price) * 0.892 - marginCalc.costPrice).toLocaleString()}원
                                      </span></p>
                                      <p className="text-slate-600">내가 3천원: <span className={`font-bold ${((marginCalc.sellingPrice || item.price) * 0.892 - marginCalc.costPrice - 3000) < 0 ? 'text-red-500' : 'text-orange-600'}`}>
                                        {Math.floor((marginCalc.sellingPrice || item.price) * 0.892 - marginCalc.costPrice - 3000).toLocaleString()}원
                                      </span></p>
                                    </div>
                                    <div className="bg-green-50 p-2 rounded">
                                      <p className="text-green-600 font-medium">스마트스토어 (5.5%)</p>
                                      <p className="text-slate-600">내가 무료배송: <span className={`font-bold ${((marginCalc.sellingPrice || item.price) * 0.945 - marginCalc.costPrice) < 0 ? 'text-red-500' : 'text-green-600'}`}>
                                        {Math.floor((marginCalc.sellingPrice || item.price) * 0.945 - marginCalc.costPrice).toLocaleString()}원
                                      </span></p>
                                      <p className="text-slate-600">내가 3천원: <span className={`font-bold ${((marginCalc.sellingPrice || item.price) * 0.945 - marginCalc.costPrice - 3000) < 0 ? 'text-red-500' : 'text-green-600'}`}>
                                        {Math.floor((marginCalc.sellingPrice || item.price) * 0.945 - marginCalc.costPrice - 3000).toLocaleString()}원
                                      </span></p>
                                    </div>
                                  </div>

                                  {/* 목표 마진 입력 → 필요 판매가 */}
                                  <div className="mt-3 pt-2 border-t border-slate-200">
                                    <label className="block text-xs font-medium text-slate-600 mb-1">목표 마진 입력 (원)</label>
                                    <input
                                      type="number"
                                      value={marginCalc.shippingCost || ''}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        setMarginCalc(prev => ({ ...prev, shippingCost: Number(e.target.value) }));
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      className="w-full px-2 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 mb-2"
                                      placeholder="원하는 마진 입력"
                                    />
                                    {marginCalc.shippingCost > 0 && (
                                      <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className="bg-orange-100 p-2 rounded">
                                          <p className="text-orange-700 font-medium">쿠팡 필요 판매가</p>
                                          <p className="font-bold text-orange-600">
                                            {Math.ceil((marginCalc.costPrice + marginCalc.shippingCost) / 0.892).toLocaleString()}원
                                          </p>
                                          <p className={`text-xs ${Math.ceil((marginCalc.costPrice + marginCalc.shippingCost) / 0.892) > (item.price + competitorShipping) ? 'text-red-500' : 'text-blue-500'}`}>
                                            경쟁사 대비 {Math.ceil((marginCalc.costPrice + marginCalc.shippingCost) / 0.892) > (item.price + competitorShipping) ? '+' : ''}
                                            {(Math.ceil((marginCalc.costPrice + marginCalc.shippingCost) / 0.892) - (item.price + competitorShipping)).toLocaleString()}원
                                          </p>
                                        </div>
                                        <div className="bg-green-100 p-2 rounded">
                                          <p className="text-green-700 font-medium">스토어 필요 판매가</p>
                                          <p className="font-bold text-green-600">
                                            {Math.ceil((marginCalc.costPrice + marginCalc.shippingCost) / 0.945).toLocaleString()}원
                                          </p>
                                          <p className={`text-xs ${Math.ceil((marginCalc.costPrice + marginCalc.shippingCost) / 0.945) > (item.price + competitorShipping) ? 'text-red-500' : 'text-blue-500'}`}>
                                            경쟁사 대비 {Math.ceil((marginCalc.costPrice + marginCalc.shippingCost) / 0.945) > (item.price + competitorShipping) ? '+' : ''}
                                            {(Math.ceil((marginCalc.costPrice + marginCalc.shippingCost) / 0.945) - (item.price + competitorShipping)).toLocaleString()}원
                                          </p>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          <p className="text-xs text-slate-400 mt-2">※ 쿠팡 10.8%, 스마트스토어 5.5% 수수료 적용</p>

                          {/* 선택 완료 버튼 */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowPriceSearchModal(false);
                              if (data.name.trim()) {
                                handleAutoSearch();
                              }
                            }}
                            className="w-full mt-2 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg font-bold text-sm hover:opacity-90 transition-all"
                          >
                            ✅ 선택 완료
                          </button>
                        </div>
                      )}
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