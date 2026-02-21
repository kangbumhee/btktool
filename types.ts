export type Platform = 'coupang' | 'smartstore';

export interface ProductData {
  name: string;
  description: string;
  targetAudience: string;
  images: string[]; 
  selectedModel: 'flash' | 'pro'; 
  platform: Platform;
  price: number;
  discountRate: number;
  promotionText: string;
}

export interface GeneratedCopy {
  catchphrase: string;
  headline: string;
  emotionalBenefit: string;
  // Long-form content structure matches reference
  painPoints: { title: string; description: string }[]; 
  solution: string; 
  features: { title: string; subtitle: string; description: string }[]; 
  usageScenarios: { situation: string; benefit: string }[]; 
  specs: { label: string; value: string }[];
  faq: { question: string; answer: string }[];
}

export interface GeneratedImage {
  url: string;
  prompt: string;
}

export interface AppState {
  step: 'input' | 'processing' | 'preview';
  productData: ProductData;
  originalImages: string[];
  generatedImages: GeneratedImage[]; 
  mainImageIndex: number; 
  generatedCopy: GeneratedCopy | null;
  isEditingImage: boolean;
}

// 히스토리 아이템 타입
export interface HistoryItem {
  id: string;
  timestamp: number;
  productName: string;
  productData: ProductData;
  generatedImages: GeneratedImage[];
  generatedCopy: GeneratedCopy;
  thumbnail: string;
  originalImages?: string[];  // 참고 이미지 URL 추가
}