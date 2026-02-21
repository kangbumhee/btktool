// Gemini API는 더 이상 사용하지 않음 (Nano Banana와 Groq으로 교체)
// import { GoogleGenAI, Type } from "@google/genai";
import { ProductData, GeneratedCopy, GeneratedImage } from "../types";

// ========== Nano Banana API 설정 ==========
const NANO_BANANA_API_URL = "https://api.kie.ai/api/v1/jobs/createTask";
const NANO_BANANA_STATUS_URL = "https://api.kie.ai/api/v1/jobs/recordInfo";

const getNanoBananaApiKey = (): string => {
  // 1. localStorage에서 사용자가 입력한 키 확인
  const storedKey = localStorage.getItem('nanoBananaApiKey');
  if (storedKey) {
    return storedKey;
  }
  
  // 2. 환경변수에서 확인 (개발용)
  const envKey = (import.meta as any).env?.VITE_NANO_BANANA_API_KEY;
  if (envKey) {
    return envKey;
  }
  
  throw new Error("API 키가 설정되지 않았습니다. 설정 메뉴에서 Nano Banana API 키를 입력해주세요.");
};

// Nano Banana 작업 생성
const createNanoBananaTask = async (
  model: "google/nano-banana" | "google/nano-banana-edit" | "nano-banana-pro",
  input: Record<string, any>
): Promise<string> => {
  const apiKey = getNanoBananaApiKey();
  
  const response = await fetch(NANO_BANANA_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model,
      input: input,
    }),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.msg || errorData.message || "알 수 없는 오류";
    
    // 크레딧 부족 에러 감지
    if (errorMessage.toLowerCase().includes("insufficient") || 
        errorMessage.toLowerCase().includes("credits") || 
        errorMessage.toLowerCase().includes("top up") ||
        errorMessage.toLowerCase().includes("credit")) {
      throw new Error("CREDITS_INSUFFICIENT");
    }
    
    throw new Error(`Nano Banana API 오류: ${response.status} - ${errorMessage}`);
  }
  
  const data = await response.json();
  
  if (data.code !== 200) {
    const errorMessage = data.msg || data.message || "알 수 없는 오류";
    
    // 크레딧 부족 에러 감지
    if (errorMessage.toLowerCase().includes("insufficient") || 
        errorMessage.toLowerCase().includes("credits") || 
        errorMessage.toLowerCase().includes("top up") ||
        errorMessage.toLowerCase().includes("credit")) {
      throw new Error("CREDITS_INSUFFICIENT");
    }
    
    throw new Error(`Nano Banana API 오류: ${errorMessage}`);
  }
  
  return data.data.taskId;
};

// Nano Banana 작업 상태 조회
const checkNanoBananaTaskStatus = async (
  taskId: string
): Promise<{ state: string; resultUrls?: string[]; failMsg?: string }> => {
  const apiKey = getNanoBananaApiKey();
  
  const response = await fetch(`${NANO_BANANA_STATUS_URL}?taskId=${taskId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
    },
  });
  
  if (!response.ok) {
    throw new Error(`상태 조회 실패: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (data.code !== 200) {
    throw new Error(`상태 조회 오류: ${data.msg}`);
  }
  
  const taskData = data.data;
  
  if (taskData.state === "success" && taskData.resultJson) {
    const result = JSON.parse(taskData.resultJson);
    return {
      state: "success",
      resultUrls: result.resultUrls || (result.url ? [result.url] : []),
    };
  } else if (taskData.state === "fail") {
    return {
      state: "fail",
      failMsg: taskData.failMsg || "이미지 생성 실패",
    };
  }
  
  return { state: taskData.state };
};

// 작업 완료까지 폴링 (최대 120초 대기)
const waitForNanoBananaTask = async (taskId: string): Promise<string[]> => {
  const maxAttempts = 60; // 2초 간격으로 60번 = 120초
  const pollInterval = 2000; // 2초
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await checkNanoBananaTaskStatus(taskId);
    
    if (status.state === "success" && status.resultUrls) {
      return status.resultUrls;
    }
    
    if (status.state === "fail") {
      throw new Error(status.failMsg || "이미지 생성 실패");
    }
    
    // waiting 상태면 대기 후 재시도
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
  
  throw new Error("이미지 생성 시간 초과 (120초)");
};

// ========== imgbb 이미지 업로드 ==========
const uploadImageToImgbb = async (base64Image: string): Promise<string> => {
  // 이미 URL이면 그대로 반환
  if (base64Image.startsWith("http")) {
    return base64Image;
  }
  
  // SVG 플레이스홀더면 건너뛰기
  if (base64Image.includes("image/svg+xml")) {
    throw new Error("SVG 이미지는 업로드할 수 없습니다.");
  }
  
  // imgbb API 키 (환경변수만 사용)
  const getImgbbApiKey = (): string => {
    const envKey = (import.meta as any).env?.VITE_IMGBB_API_KEY;
    if (envKey) {
      return envKey;
    }
    // 환경변수가 없으면 에러
    throw new Error("imgbb API 키가 설정되지 않았습니다. VITE_IMGBB_API_KEY 환경변수를 설정해주세요.");
  };
  
  const apiKey = getImgbbApiKey();
  
  // Base64 데이터 추출 (data:image/xxx;base64, 제거)
  const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");
  
  // imgbb API 호출 (base64 문자열을 직접 전송)
  const formData = new FormData();
  formData.append("image", base64Data);
  
  const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
    method: "POST",
    body: formData,
  });
  
  if (!response.ok) {
    throw new Error(`imgbb 업로드 실패: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (!data.success) {
    throw new Error("imgbb 업로드 실패: " + (data.error?.message || "알 수 없는 오류"));
  }
  
  // 이미지 URL 반환
  return data.data.url;
};

// 외부 URL에서 이미지를 가져와서 imgbb에 업로드 (CORS 문제 해결용)
async function uploadExternalImageToImgbb(imageUrl: string): Promise<string> {
  // 이미 imgbb 도메인이면 그대로 반환
  if (imageUrl.includes('i.ibb.co') || imageUrl.includes('ibb.co')) {
    return imageUrl;
  }

  // imgbb API 키 가져오기
  const getImgbbApiKey = (): string => {
    const envKey = (import.meta as any).env?.VITE_IMGBB_API_KEY;
    if (envKey) {
      return envKey;
    }
    throw new Error("imgbb API 키가 설정되지 않았습니다. VITE_IMGBB_API_KEY 환경변수를 설정해주세요.");
  };

  const imgbbApiKey = getImgbbApiKey();
  
  if (!imgbbApiKey) {
    console.warn('imgbb API 키가 없어서 원본 URL 반환');
    return imageUrl;
  }

  try {
    // imgbb API는 URL 파라미터로 직접 이미지를 가져올 수 있음
    const formData = new FormData();
    formData.append('key', imgbbApiKey);
    formData.append('image', imageUrl); // URL을 직접 전달

    const response = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`imgbb 업로드 실패: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.success && data.data?.url) {
      console.log('imgbb 업로드 성공:', data.data.url);
      return data.data.url;
    } else {
      throw new Error('imgbb 응답 오류');
    }
  } catch (error) {
    console.error('imgbb 업로드 실패, 원본 URL 반환:', error);
    return imageUrl;
  }
}

// ========== Groq API 설정 (텍스트 생성용) ==========
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const getGroqApiKey = (): string => {
  // 환경변수 확인 (배포 환경)
  const envKey = (import.meta as any).env?.VITE_GROQ_API_KEY;
  if (envKey) {
    return envKey;
  }
  
  // 환경변수가 없으면 에러
  throw new Error("Groq API 키가 설정되지 않았습니다. VITE_GROQ_API_KEY 환경변수를 설정해주세요.");
};

// ========== Tavily API 설정 (검색용) ==========
const TAVILY_API_URL = "https://api.tavily.com/search";

const getTavilyApiKey = (): string => {
  const envKey = (import.meta as any).env?.VITE_TAVILY_API_KEY;
  if (envKey) {
    return envKey;
  }
  // 환경변수가 없으면 에러
  throw new Error("Tavily API 키가 설정되지 않았습니다. VITE_TAVILY_API_KEY 환경변수를 설정해주세요.");
};

// Tavily로 웹 검색
const searchWithTavily = async (query: string): Promise<string> => {
  const apiKey = getTavilyApiKey();
  
  const response = await fetch(TAVILY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: apiKey,
      query: query,
      search_depth: "advanced",
      include_answer: true,
      include_raw_content: false,
      max_results: 5,
    }),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Tavily API 오류: ${response.status} - ${errorData.message || "검색 실패"}`);
  }
  
  const data = await response.json();
  
  // 검색 결과 조합
  let searchResult = "";
  
  // AI 요약 답변
  if (data.answer) {
    searchResult += `[AI 요약]\n${data.answer}\n\n`;
  }
  
  // 검색 결과들
  if (data.results && data.results.length > 0) {
    searchResult += "[검색 결과]\n";
    data.results.forEach((result: any, index: number) => {
      searchResult += `${index + 1}. ${result.title}\n`;
      searchResult += `   ${result.content}\n\n`;
    });
  }
  
  if (!searchResult.trim()) {
    throw new Error("검색 결과가 없습니다.");
  }
  
  return searchResult;
};

// Groq API로 텍스트 생성
const generateTextWithGroq = async (
  systemPrompt: string,
  userPrompt: string
): Promise<string> => {
  const apiKey = getGroqApiKey();
  
  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Groq API 오류: ${response.status} - ${errorData.error?.message || "알 수 없는 오류"}`);
  }
  
  const data = await response.json();
  
  if (!data.choices || !data.choices[0]?.message?.content) {
    throw new Error("Groq API 응답이 비어있습니다.");
  }
  
  return data.choices[0].message.content;
};

const stripBase64Prefix = (base64: string) => {
  return base64.replace(/^data:image\/[a-z]+;base64,/, "");
};

const getMimeType = (base64: string) => {
  const match = base64.match(/^data:(image\/[a-z]+);base64,/);
  return match ? match[1] : "image/jpeg";
};

// Helper for delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to ensure image format is supported by Gemini (JPEG/PNG/WEBP/HEIC/HEIF)
// Converts unsupported formats (like AVIF) to JPEG
const ensureSupportedImage = (base64: string): Promise<{ mimeType: string; data: string }> => {
  return new Promise((resolve) => {
    const mime = getMimeType(base64);
    // Explicitly supported formats by Gemini API
    if (['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(mime)) {
      resolve({
        mimeType: mime,
        data: stripBase64Prefix(base64)
      });
      return;
    }

    // Convert unsupported formats to JPEG using Canvas
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Fill white background for transparency safety
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const newBase64 = canvas.toDataURL('image/jpeg', 0.9);
        resolve({
          mimeType: 'image/jpeg',
          data: stripBase64Prefix(newBase64)
        });
      } else {
        // Fallback if canvas context fails
        console.warn("Canvas context failed, sending original image.");
        resolve({
          mimeType: mime,
          data: stripBase64Prefix(base64)
        });
      }
    };
    img.onerror = (e) => {
      // Fallback if image loading fails (e.g. browser doesn't support format either)
      console.warn("Image conversion failed, sending original image.", e);
      resolve({
        mimeType: mime,
        data: stripBase64Prefix(base64)
      });
    };
    // If it's a data URL, setting src triggers load
    img.src = base64;
  });
};

// Map user selection to actual model names
const getModelName = (selection: 'flash' | 'pro', type: 'text' | 'image') => {
  if (type === 'text') {
    return selection === 'pro' ? 'gemini-3-pro-preview' : 'gemini-2.5-flash';
  }
  return selection === 'pro' ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
};

const PLATFORM_GUIDELINES: Record<string, string> = {
  coupang: `
    - TARGET PLATFORM: Coupang
    - Product Name: Max 100 characters. STRICTLY NO repetition of words.
    - Style: Vertical scrolling, high-contrast images, big typography.
    - Structure: Hook -> Pain Point -> Solution -> Key Features (3-4) -> Specs.
  `,
  smartstore: `
    - TARGET PLATFORM: Naver SmartStore
    - Product Name: SEO optimized, max 50 chars.
    - Style: Blog-like friendly tone, trustworthy, detail-oriented.
    - Structure: Intro (Empathy) -> Product Intro -> Detailed Review/Features -> FAQ.
  `
};

export const analyzeFileContent = async (text: string): Promise<{ description: string; targetAudience: string }> => {
  const systemPrompt = "너는 제품 정보를 분석하는 전문가야. 파일 내용에서 제품의 특징, 설명, 가격, 스펙 등을 추출해서 정리해줘. 반드시 JSON 형식으로 응답해야 해.";
  
  const userPrompt = `다음 파일 내용을 분석해서 JSON 형식으로 응답해줘:\n\n${text.substring(0, 15000)}\n\n응답 형식:\n{\n  "description": "제품의 종합적인 특징, 재료, 장점을 한국어로 요약",\n  "targetAudience": "타겟 고객층을 한국어로 추론"\n}`;

  try {
    const result = await generateTextWithGroq(systemPrompt, userPrompt);
    
    let cleanText = result.trim();
    // Markdown 코드 블록 제거
    if (cleanText.includes('```json')) {
      const start = cleanText.indexOf('```json') + 7;
      const end = cleanText.lastIndexOf('```');
      if (end > start) {
        cleanText = cleanText.substring(start, end).trim();
      }
    } else if (cleanText.includes('```')) {
      const start = cleanText.indexOf('```') + 3;
      const end = cleanText.lastIndexOf('```');
      if (end > start) {
        cleanText = cleanText.substring(start, end).trim();
      }
    }
    
    const parsed = JSON.parse(cleanText);
    return {
      description: parsed.description || '',
      targetAudience: parsed.targetAudience || ''
    };
  } catch (e) {
    console.error("파일 분석 실패:", e);
    return { description: '', targetAudience: '' };
  }
};

export const searchProductInfo = async (productName: string): Promise<{ description: string; targetAudience: string }> => {
  if (!productName) return { description: '', targetAudience: '' };

  try {
    // 1단계: Tavily로 제품 정보 검색
    console.log("Tavily 검색 시작:", productName);
    const searchQuery = `${productName} 제품 정보 특징 성분 사용법 가격`;
    const searchResult = await searchWithTavily(searchQuery);
    console.log("Tavily 검색 결과:", searchResult);
    
    // 2단계: Groq으로 검색 결과 정리
    const systemPrompt = `너는 한국 이커머스 제품 정보 전문가야.
검색 결과를 바탕으로 제품 정보를 보기 좋게 정리해줘.

[필수 규칙]
1. 반드시 100% 한국어로만 작성. 한자, 중국어, 일본어, 영어 단어 사용 금지.
2. 검색 결과에 있는 정보를 기반으로 정확하게 작성.
3. 마크다운 형식으로 보기 좋게 정리.`;

    const userPrompt = `제품명: ${productName}

검색 결과:
${searchResult}

위 검색 결과를 바탕으로 아래 형식으로 정리해줘:

**주요 특징:**
- (핵심 기능과 효과 3-5가지)

**제품 사양:**
- 용량: (검색된 용량)
- 주요 성분: (검색된 성분)
- 피부 타입: (적합한 피부 타입)

**사용 방법:**
(구체적인 사용 방법)

**장점:**
- (구매해야 하는 이유 2-3가지)

중요: 검색 결과에 없는 정보는 "정보 없음"으로 표시하고, 모든 텍스트를 한글로만 작성해.`;

    const formattedResult = await generateTextWithGroq(systemPrompt, userPrompt);
    
    // 중국어, 일본어, 러시아어, 기타 외국 문자 제거 (한글, 영문, 숫자, 기본 기호만 유지)
    const cleanResult = formattedResult
      .replace(/[\u4e00-\u9fff]/g, '')  // 중국어
      .replace(/[\u3040-\u309f\u30a0-\u30ff]/g, '')  // 일본어
      .replace(/[\u0400-\u04ff]/g, '')  // 러시아어 (키릴 문자)
      .replace(/[\u0600-\u06ff]/g, '')  // 아랍어
      .replace(/[\u0e00-\u0e7f]/g, '');  // 태국어
    
    // 타겟 고객 추출 요청
    const targetPrompt = `"${productName}" 제품의 타겟 고객층을 한 문장으로 설명해줘. 한글로만 작성.`;
    const targetResult = await generateTextWithGroq(
      "너는 마케팅 전문가야. 간결하게 한글로만 답변해.",
      targetPrompt
    );
    
    // 중국어, 일본어, 러시아어, 기타 외국 문자 제거
    const cleanTarget = targetResult
      .replace(/[\u4e00-\u9fff]/g, '')  // 중국어
      .replace(/[\u3040-\u309f\u30a0-\u30ff]/g, '')  // 일본어
      .replace(/[\u0400-\u04ff]/g, '')  // 러시아어 (키릴 문자)
      .replace(/[\u0600-\u06ff]/g, '')  // 아랍어
      .replace(/[\u0e00-\u0e7f]/g, '');  // 태국어
    
    return {
      description: cleanResult.trim(),
      targetAudience: cleanTarget.trim()
    };
    
  } catch (e: any) {
    console.error("제품 검색 실패:", e);
    
    // Fallback: Tavily 실패 시 Groq만으로 시도
    try {
      console.log("Fallback: Groq만으로 시도");
      const fallbackPrompt = `"${productName}" 제품에 대해 알려줘.

아래 형식으로 한글로만 작성해:

**주요 특징:**
- 특징 1
- 특징 2
- 특징 3

**제품 사양:**
- 예상 용량, 성분, 타입 등

**사용 방법:**
일반적인 사용법

**장점:**
- 장점 1
- 장점 2`;

      const fallbackResult = await generateTextWithGroq(
        "너는 제품 정보 전문가야. 100% 한글로만 답변해. 한자, 중국어, 일본어 사용 금지.",
        fallbackPrompt
      );
      
      // 중국어, 일본어, 러시아어, 기타 외국 문자 제거
      const cleanFallback = fallbackResult
        .replace(/[\u4e00-\u9fff]/g, '')  // 중국어
        .replace(/[\u3040-\u309f\u30a0-\u30ff]/g, '')  // 일본어
        .replace(/[\u0400-\u04ff]/g, '')  // 러시아어 (키릴 문자)
        .replace(/[\u0600-\u06ff]/g, '')  // 아랍어
        .replace(/[\u0e00-\u0e7f]/g, '');  // 태국어
      
      return {
        description: cleanFallback.trim(),
        targetAudience: ''
      };
    } catch (fallbackError) {
      console.error("Fallback도 실패:", fallbackError);
      throw new Error("검색 결과가 없습니다.");
    }
  }
};

export const refineCopySection = async (
  sectionKey: string,
  currentContent: any,
  feedback: string
): Promise<any> => {
  const systemPrompt = "너는 한국어 쇼핑몰 마케팅 카피라이터 전문가야. 사용자의 피드백에 따라 콘텐츠를 수정해줘. 중요: 반환할 때는 섹션의 값만 반환해야 해. 객체로 감싸지 말고 섹션의 실제 값만 반환해.";

  // 현재 콘텐츠가 객체인지 문자열인지 확인
  const isObject = typeof currentContent === 'object' && currentContent !== null && !Array.isArray(currentContent);
  const isArray = Array.isArray(currentContent);
  
  let userPrompt = `섹션명: ${sectionKey}\n\n현재 콘텐츠:\n${JSON.stringify(currentContent, null, 2)}\n\n사용자 피드백:\n"${feedback}"\n\n`;
  
  if (typeof currentContent === 'string') {
    userPrompt += `위 피드백에 따라 텍스트를 수정해서 문자열로만 응답해줘. JSON 객체로 감싸지 말고 수정된 텍스트만 반환해.`;
  } else if (isArray) {
    userPrompt += `위 피드백에 따라 배열을 수정해서 JSON 배열 형식으로만 응답해줘. 객체로 감싸지 말고 배열만 반환해.`;
  } else if (isObject) {
    userPrompt += `위 피드백에 따라 객체를 수정해서 JSON 객체 형식으로만 응답해줘.`;
  } else {
    userPrompt += `위 피드백에 따라 콘텐츠를 수정해서 JSON 형식으로만 응답해줘.`;
  }

  try {
    const result = await generateTextWithGroq(systemPrompt, userPrompt);
    
    let cleanText = result.trim();
    // Markdown 코드 블록 제거
    if (cleanText.includes('```json')) {
      const start = cleanText.indexOf('```json') + 7;
      const end = cleanText.lastIndexOf('```');
      if (end > start) {
        cleanText = cleanText.substring(start, end).trim();
      }
    } else if (cleanText.includes('```')) {
      const start = cleanText.indexOf('```') + 3;
      const end = cleanText.lastIndexOf('```');
      if (end > start) {
        cleanText = cleanText.substring(start, end).trim();
      }
    }
    
    const parsed = JSON.parse(cleanText);
    
    // 반환된 값이 객체이고 섹션 키를 포함하는 경우, 해당 값만 추출
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) && parsed[sectionKey] !== undefined) {
      return parsed[sectionKey];
    }
    
    return parsed;
  } catch (e) {
    console.error("콘텐츠 수정 실패:", e);
    throw new Error("콘텐츠 수정에 실패했습니다.");
  }
};

export const generateMarketingCopy = async (
  data: ProductData
): Promise<GeneratedCopy> => {
  const platformRules = PLATFORM_GUIDELINES[data.platform] || PLATFORM_GUIDELINES.coupang;

  const systemPrompt = `너는 한국 쇼핑몰 마케팅 카피라이터 전문가야. 
제품의 특징을 매력적으로 표현하는 마케팅 문구를 작성해줘.
한국어로 작성하고, 구매 욕구를 자극하는 문구를 만들어줘.

플랫폼 가이드라인 (${data.platform.toUpperCase()}):
${platformRules}

구조 요구사항:
- catchphrase: 최대 20자
- headline: 최대 40자
- painPoints: 2개의 문제점
- solution: 명확한 가치 제안
- features: 3개의 특징 (각각 subtitle 포함)
- usageScenarios: 3개의 사용 시나리오
- faq: 3개의 질문
- specs: 5-7개의 기술 사양

반드시 JSON 형식으로 응답해야 해.`;

  const userPrompt = `제품명: ${data.name}
제품 설명: ${data.description}
타겟 고객: ${data.targetAudience}
${data.promotionText ? `프로모션: ${data.promotionText}` : ""}

위 제품에 대한 마케팅 카피를 다음 JSON 형식으로 작성해줘:
{
  "catchphrase": "...",
  "headline": "...",
  "emotionalBenefit": "...",
  "painPoints": [{"title": "...", "description": "..."}, {"title": "...", "description": "..."}],
  "solution": "...",
  "features": [{"title": "...", "subtitle": "...", "description": "..."}, ...],
  "usageScenarios": [{"situation": "...", "benefit": "..."}, ...],
  "faq": [{"question": "...", "answer": "..."}, ...],
  "specs": [{"label": "...", "value": "..."}, ...]
}`;

  try {
    const result = await generateTextWithGroq(systemPrompt, userPrompt);
    
    let cleanText = result.trim();
    // Markdown 코드 블록 제거
    if (cleanText.includes('```json')) {
      const start = cleanText.indexOf('```json') + 7;
      const end = cleanText.lastIndexOf('```');
      if (end > start) {
        cleanText = cleanText.substring(start, end).trim();
      }
    } else if (cleanText.includes('```')) {
      const start = cleanText.indexOf('```') + 3;
      const end = cleanText.lastIndexOf('```');
      if (end > start) {
        cleanText = cleanText.substring(start, end).trim();
      }
    }
    
    return JSON.parse(cleanText) as GeneratedCopy;
  } catch (e) {
    console.error("마케팅 카피 생성 실패:", e);
    throw new Error("마케팅 카피 생성에 실패했습니다.");
  }
};

// Generates a simple SVG placeholder data URI for failed generations
const getFallbackImage = () => {
  const svg = `
  <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#f1f5f9"/>
    <rect x="0" y="0" width="1024" height="1024" fill="none" stroke="#e2e8f0" stroke-width="40"/>
    <text x="512" y="480" font-family="sans-serif" font-weight="bold" font-size="64" fill="#94a3b8" text-anchor="middle">Image Gen Failed</text>
    <text x="512" y="580" font-family="sans-serif" font-size="32" fill="#cbd5e1" text-anchor="middle">Click 'Edit' to retry</text>
  </svg>
  `;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
};

export const generateSingleScene = async (
  modelName: string,
  referenceImages: string[],
  scenePrompt: string,
  aspectRatio: string = "16:9"
): Promise<string> => {
  // 모델 선택: pro면 nano-banana-pro, 아니면 nano-banana-edit (참조 이미지 지원)
  const isProModel = modelName.toLowerCase().includes("pro");
  
  // 첫 번째 이미지만 사용 (참조 이미지로)
  const imagesToUpload = referenceImages.slice(0, 1);

  console.log(`참조 이미지 ${imagesToUpload.length}장 업로드 시작... (첫 번째 이미지만 사용)`);

  const uploadPromises = imagesToUpload.map(async (img, index) => {
    try {
      const url = await uploadImageToImgbb(img);
      console.log(`참조 이미지 ${index + 1} 업로드 성공:`, url);
      return url;
    } catch (e) {
      console.warn(`참조 이미지 ${index + 1} 업로드 실패:`, e);
      return null;
    }
  });

  const uploadResults = await Promise.all(uploadPromises);
  const imageUrls = uploadResults.filter((url): url is string => url !== null);

  console.log(`참조 이미지 업로드 완료: ${imageUrls.length}/${imagesToUpload.length}장 성공`);
  
  if (isProModel) {
    // Nano Banana Pro 사용
    const taskId = await createNanoBananaTask("nano-banana-pro", {
      prompt: `[PRODUCT PHOTOGRAPHY TASK]
Generate a high-end commercial product photo based on the reference image.
IMPORTANT: The product in the output must look EXACTLY like the product in the reference image.
Preserve the product's shape, color, logo, label, and all visual details.

[SCENE DESCRIPTION]
${scenePrompt}

[REQUIREMENTS]
1. Product must match the reference image exactly
2. Professional studio lighting
3. High-quality 4K resolution
4. Clean, commercial aesthetic
5. No text overlays`,
      image_input: imageUrls.length > 0 ? imageUrls : undefined,
      aspect_ratio: aspectRatio,
      resolution: "1K",
      output_format: "png",
    });
    
    const resultUrls = await waitForNanoBananaTask(taskId);
    const generatedImageUrl = resultUrls[0] || getFallbackImage();
    
    // 생성된 이미지가 외부 URL이면 imgbb에 업로드하여 CORS 문제 해결
    if (generatedImageUrl.startsWith('http') && !generatedImageUrl.includes('i.ibb.co') && !generatedImageUrl.includes('ibb.co')) {
      console.log('생성된 이미지를 imgbb에 업로드 중...', generatedImageUrl);
      try {
        const imgbbUrl = await uploadExternalImageToImgbb(generatedImageUrl);
        return imgbbUrl;
      } catch (error) {
        console.warn('imgbb 업로드 실패, 원본 URL 사용:', error);
        return generatedImageUrl;
      }
    }
    
    return generatedImageUrl;
    
  } else {
    // Nano Banana Edit 사용 (참조 이미지 필수!)
    // 일반 nano-banana는 참조 이미지를 지원하지 않으므로 nano-banana-edit 사용
    
    if (imageUrls.length === 0) {
      // 이미지 업로드 실패 시 일반 nano-banana로 폴백
      console.warn("참조 이미지 없이 생성 - 결과가 다를 수 있음");
      const taskId = await createNanoBananaTask("google/nano-banana", {
        prompt: `[PRODUCT PHOTOGRAPHY TASK]
Generate a high-end commercial product photo.

[SCENE DESCRIPTION]
${scenePrompt}

[REQUIREMENTS]
1. Professional studio lighting
2. High-quality resolution
3. Clean, commercial aesthetic
4. Product should be the main focus
5. No text overlays`,
        output_format: "png",
        image_size: aspectRatio,
      });
      
      const resultUrls = await waitForNanoBananaTask(taskId);
      const generatedImageUrl = resultUrls[0] || getFallbackImage();
      
      // 생성된 이미지가 외부 URL이면 imgbb에 업로드하여 CORS 문제 해결
      if (generatedImageUrl.startsWith('http') && !generatedImageUrl.includes('i.ibb.co') && !generatedImageUrl.includes('ibb.co')) {
        console.log('생성된 이미지를 imgbb에 업로드 중...', generatedImageUrl);
        try {
          const imgbbUrl = await uploadExternalImageToImgbb(generatedImageUrl);
          return imgbbUrl;
        } catch (error) {
          console.warn('imgbb 업로드 실패, 원본 URL 사용:', error);
          return generatedImageUrl;
        }
      }
      
      return generatedImageUrl;
    }
    
    // nano-banana-edit 사용 (참조 이미지 지원)
    const taskId = await createNanoBananaTask("google/nano-banana-edit", {
      prompt: `[PRODUCT PHOTOGRAPHY TASK]
Transform this product image into a high-end commercial photo.
CRITICAL: Keep the EXACT same product - same shape, color, logo, label, and all details.
Only change the background and lighting according to the scene description.

[SCENE DESCRIPTION]
${scenePrompt}

[REQUIREMENTS]
1. Product must remain IDENTICAL to the input image
2. Professional studio lighting
3. High-quality resolution
4. Clean, commercial aesthetic
5. No text overlays`,
      image_urls: imageUrls,
      output_format: "png",
      image_size: aspectRatio,
    });
    
    const resultUrls = await waitForNanoBananaTask(taskId);
    const generatedImageUrl = resultUrls[0] || getFallbackImage();
    
    // 생성된 이미지가 외부 URL이면 imgbb에 업로드하여 CORS 문제 해결
    if (generatedImageUrl.startsWith('http') && !generatedImageUrl.includes('i.ibb.co') && !generatedImageUrl.includes('ibb.co')) {
      console.log('생성된 이미지를 imgbb에 업로드 중...', generatedImageUrl);
      try {
        const imgbbUrl = await uploadExternalImageToImgbb(generatedImageUrl);
        return imgbbUrl;
      } catch (error) {
        console.warn('imgbb 업로드 실패, 원본 URL 사용:', error);
        return generatedImageUrl;
      }
    }
    
    return generatedImageUrl;
  }
};

// NEW: Dynamically generate scene prompts based on product analysis
const generateCustomScenePrompts = async (data: ProductData, count: number): Promise<string[]> => {
    const systemPrompt = `너는 상업용 제품 사진 프롬프트 전문가야.
제품에 맞는 고품질 상업 사진 씬을 영어로 생성해줘.
각 씬은 한 줄로 작성하고, 줄바꿈으로 구분해줘.
${count}개의 서로 다른 씬을 만들어줘.

씬 순서:
1. HERO INTRO SHOT: 고급 상업 광고 사진. 극적인 조명, 역동적인 앵글, 최고의 특징 강조. 배경은 대기적이고 보완적인 스튜디오 설정.
2. Lifestyle/Intro: 제품이 이상적인 자연스러운 환경에서.
3. Key Feature 1 (Macro/Close-up): 가장 중요한 기술적 세부사항 확대.
4. Key Feature 2 (Action/Function): 제품이 작동하는 모습.
5. Usage Scenario: Product in use: An elegant hand naturally holding and using the product. Show the product being applied or dispensed. The product design, label, and color must remain IDENTICAL to the reference image. Clean, bright bathroom or skincare setting background.
6. Creative/Dynamic Angle: 극적인 앵글 (낮은 각도, 위에서 내려다보기 등).
7. Texture/Material: 제작 품질이나 재료 강조.
8. Scale/Size Context: 일반적인 물체 옆에 놓아 크기 표시.
9. PRODUCT THUMBNAIL: 순수한 흰색 배경 (#FFFFFF), 제품 중앙 배치, 전문 스튜디오 조명.
10+. 추가 씬: 라이프스타일, 패키징, 다양한 각도의 변형.`;

    const userPrompt = `제품명: ${data.name}
제품 설명: ${data.description}
타겟 고객: ${data.targetAudience}
플랫폼: ${data.platform} (${data.platform === 'coupang' ? '세로 스크롤, 대담한 스타일' : '블로그 스타일, 감성적'})

위 제품을 위한 ${count}개의 상업용 제품 사진 씬 프롬프트를 영어로 만들어줘.
각 프롬프트는 조명, 배경, 분위기를 포함해야 해.
한 줄에 하나씩, 줄바꿈으로 구분해서 작성해줘.`;

    try {
        const result = await generateTextWithGroq(systemPrompt, userPrompt);
        
        // 줄바꿈으로 분리해서 배열로 반환
        const prompts = result.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && !line.match(/^\d+[\.\)]/)) // 번호 제거
            .filter(line => line.length > 10); // 너무 짧은 줄 제거
        
        return prompts.slice(0, count);
    } catch (e) {
        console.error("커스텀 프롬프트 생성 실패", e);
    }
    return []; 
};

export const generateVariedScenes = async (
  data: ProductData
): Promise<GeneratedImage[]> => {
  const modelName = getModelName(data.selectedModel, 'image');
  
  // Determine number of scenes based on platform
  let count = data.platform === 'coupang' ? 12 : 9;

  let selectedPrompts: string[] = [];

  // 1. Try Custom Prompts
  try {
     const customPrompts = await generateCustomScenePrompts(data, count);
     if (customPrompts && customPrompts.length > 0) {
        selectedPrompts = customPrompts.slice(0, count);
     }
  } catch (e) {
      console.warn("Custom prompt generation failed, falling back to generic pool.");
  }

  // 2. Fallback Pool (if custom generation failed or returned empty)
  if (selectedPrompts.length === 0) {
      const fallbackPool = [
        "HERO SHOT: High-End Commercial Advertising Photo. Cinematic lighting, dynamic angle. The product looks premium and desirable. Background is an abstract, complementary studio setting (NOT plain white). Dramatic shadows and highlights.",
        "Lifestyle shot: Product placed in a warm, inviting living space or appropriate natural environment. Soft lighting.",
        "Close-up detail shot: Focusing on the texture, material, and build quality. Macro photography.",
        "Product in use: An elegant hand naturally holding and using the product. Show the product being applied or dispensed. The product design, label, and color must remain IDENTICAL to the reference image. Clean, bright bathroom or skincare setting background.",
        "Dynamic angle: A creative angle showing the product's shape and silhouette from below or side.",
        "Flat lay composition: The product nicely arranged on a solid colored surface, minimalist style.",
        "Scale reference: Product placed next to common items (like a phone or cup) to show size.",
        "Back or Side view: Showing the ports, connections, or rear design details clearly.",
        "With Packaging: The product standing next to its premium packaging box.",
        "Product Thumbnail: Pure WHITE background (#FFFFFF), Product centered and fills 80% of frame, Perfect shadow, High Contrast, 4K Resolution. Commercial Studio Photography.",
        "Outdoor context: Product in natural sunlight, park or street background (if applicable).",
        "Workspace setup: Product on a neat desk with laptop and coffee.",
        "Home setting: Product on a kitchen counter or shelf.",
        "Dark mode style: Product on a dark background with rim lighting.",
      ];
      selectedPrompts = fallbackPool.slice(0, count);
  }

  // If promotion text exists, PREPEND a promotion scene
  if (data.promotionText && data.promotionText.trim().length > 0) {
    const promoPrompt = `Promotional Event Banner: Visual representation of '${data.promotionText}'. exciting, energetic, sale atmosphere, bold composition, no text overlays, high quality commercial advertisement background.`;
    selectedPrompts = [promoPrompt, ...selectedPrompts];
  }

  // Helper for safe generation with retry
  const generateWithRetry = async (prompt: string, index: number): Promise<GeneratedImage> => {
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        // 각 이미지마다 고유한 variation 추가
        const uniquePrompt = `${prompt} [Unique variation: style-${index}, attempt-${attempts}, seed-${Date.now()}-${Math.random().toString(36).substring(7)}]`;
        // 첫 번째 이미지(index 0)는 1:1, 나머지는 16:9
        const aspectRatio = index === 0 ? "1:1" : "16:9";
        const image = await generateSingleScene(modelName, data.images, uniquePrompt, aspectRatio);
        return { url: image, prompt };
      } catch (e: any) {
        attempts++;
        
        // 크레딧 부족이면 즉시 에러 throw (재시도 안 함)
        if (e.message === "CREDITS_INSUFFICIENT") {
          throw new Error("CREDITS_INSUFFICIENT");
        }
        
        const isRateLimit = e.message?.includes('429') || e.message?.includes('Resource has been exhausted');
        
        if (isRateLimit && attempts < maxAttempts) {
          // Exponential backoff: 2s, 4s, etc + jitter
          const backoff = Math.pow(2, attempts) * 1000 + Math.random() * 1000;
          console.warn(`Rate limit hit for scene ${index}, retrying in ${Math.round(backoff)}ms... (attempt ${attempts}/${maxAttempts})`);
          await delay(backoff);
          continue;
        }
        
        // 일반 에러 또는 재시도 횟수 초과
        if (attempts >= maxAttempts) {
          console.error(`Image gen failed for scene ${index} after ${maxAttempts} attempts:`, prompt, e);
          return { url: getFallbackImage(), prompt };
        }
        
        // 일반 에러일 경우 잠시 대기 후 재시도
        console.warn(`Image gen error for scene ${index}, retrying... (attempt ${attempts}/${maxAttempts})`, e);
        await delay(1000);
      }
    }
    
    // 루프를 벗어난 경우 (이론적으로 도달하지 않아야 함)
    return { url: getFallbackImage(), prompt };
  };

  // Batched Execution
  // Batch size of 12 balances speed and rate limits for most users
  const BATCH_SIZE = 12; 
  const results: GeneratedImage[] = [];

  for (let i = 0; i < selectedPrompts.length; i += BATCH_SIZE) {
      const chunk = selectedPrompts.slice(i, i + BATCH_SIZE);
      const chunkPromises = chunk.map((prompt, idx) => generateWithRetry(prompt, i + idx));
      
      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);
      
      // Small breather between batches if there are more to come
      if (i + BATCH_SIZE < selectedPrompts.length) {
          await delay(1000);
      }
  }

  return results;
};

export const editProductImage = async (
  imageBase64: string,
  editPrompt: string,
  originalReferenceImage?: string
): Promise<string> => {
  // SVG 플레이스홀더 체크
  if (imageBase64.includes("image/svg+xml")) {
    throw new Error("플레이스홀더 이미지는 수정할 수 없습니다. 먼저 다시 생성해주세요.");
  }
  
  // 이미지 URL 수집 (Nano Banana는 URL만 지원)
  const imageUrls: string[] = [];
  
  // 원본 참조 이미지 업로드
  if (originalReferenceImage) {
    try {
      const originalUrl = await uploadImageToImgbb(originalReferenceImage);
      imageUrls.push(originalUrl);
      console.log("원본 참조 이미지 업로드 성공:", originalUrl);
    } catch (e) {
      console.warn("원본 참조 이미지 업로드 실패:", e);
    }
  }
  
  // 수정할 이미지 업로드
  try {
    const currentUrl = await uploadImageToImgbb(imageBase64);
    imageUrls.push(currentUrl);
    console.log("수정할 이미지 업로드 성공:", currentUrl);
  } catch (e) {
    console.warn("수정할 이미지 업로드 실패:", e);
  }
  
  // URL이 없으면 에러
  if (imageUrls.length === 0) {
    throw new Error("이미지 업로드에 실패했습니다. 다시 시도해주세요.");
  }
  
  // 프롬프트 구성
  const finalPrompt = originalReferenceImage
    ? `[CRITICAL INSTRUCTION]
The FIRST image is the ORIGINAL REFERENCE product photo.
The SECOND image is the current image that needs editing.

You MUST preserve the EXACT product appearance from the FIRST reference image:
- Same product shape, design, logo, label, color
- The product must look IDENTICAL to the first reference

[USER EDIT REQUEST]
${editPrompt}

[REQUIREMENTS]
1. Match product exactly to reference image
2. Apply user's edit request
3. High-quality output`
    : `[EDIT REQUEST]
${editPrompt}

[REQUIREMENTS]
1. Maintain product identity
2. High-quality output`;
  
  // Nano Banana Edit 사용
  const taskId = await createNanoBananaTask("google/nano-banana-edit", {
    prompt: finalPrompt,
    image_urls: imageUrls,
    output_format: "png",
    image_size: "16:9",
  });
  
  const resultUrls = await waitForNanoBananaTask(taskId);
  const generatedImageUrl = resultUrls[0] || getFallbackImage();
  
  // 생성된 이미지가 외부 URL이면 imgbb에 업로드하여 CORS 문제 해결
  if (generatedImageUrl.startsWith('http') && !generatedImageUrl.includes('i.ibb.co') && !generatedImageUrl.includes('ibb.co')) {
    console.log('수정된 이미지를 imgbb에 업로드 중...', generatedImageUrl);
    try {
      const imgbbUrl = await uploadExternalImageToImgbb(generatedImageUrl);
      return imgbbUrl;
    } catch (error) {
      console.warn('imgbb 업로드 실패, 원본 URL 사용:', error);
      return generatedImageUrl;
    }
  }
  
  return generatedImageUrl;
};

// Gemini Vision으로 상품 이미지 분석
export const analyzeProductImage = async (imageBase64: string): Promise<{
  productName: string;
  brand: string;
  category: string;
  features: string[];
}> => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API 키가 설정되지 않았습니다.');
  }

  // base64에서 data:image 프리픽스 분리
  const matches = imageBase64.match(/^data:image\/([a-z]+);base64,(.+)$/);
  if (!matches) {
    throw new Error('잘못된 이미지 형식입니다.');
  }
  const mimeType = `image/${matches[1]}`;
  const base64Data = matches[2];

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `이 상품 이미지를 분석해서 JSON 형식으로 답해주세요.

반드시 아래 JSON 형식만 출력하세요 (다른 텍스트 없이):
{
  "productName": "정확한 상품명 (브랜드 + 제품명 + 용량/수량)",
  "brand": "브랜드명",
  "category": "카테고리 (예: 건강식품, 화장품, 식품, 가전 등)",
  "features": ["특징1", "특징2", "특징3"]
}

상품명은 네이버 쇼핑에서 검색할 수 있도록 정확하게 작성해주세요.
예: "플라이밀 단백질 쉐이크 630g", "여에스더 리스펙타 질유산균 30캡슐"`
              },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Data
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 500,
        }
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('Gemini Vision 오류:', error);
    throw new Error('이미지 분석에 실패했습니다.');
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('JSON 파싱 실패');
  } catch (e) {
    console.error('파싱 오류:', content);
    return {
      productName: '',
      brand: '',
      category: '',
      features: []
    };
  }
};

// Google Vision API로 이미지 분석 (글자 없는 상품용)
export const analyzeImageWithVision = async (imageBase64: string): Promise<{
  productName: string;
  labels: string[];
  logos: string[];
  text: string;
}> => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('API 키가 설정되지 않았습니다.');
  }

  // base64에서 data:image 프리픽스 분리
  const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            image: {
              content: base64Data
            },
            features: [
              { type: 'LABEL_DETECTION', maxResults: 10 },
              { type: 'LOGO_DETECTION', maxResults: 5 },
              { type: 'TEXT_DETECTION', maxResults: 1 },
              { type: 'WEB_DETECTION', maxResults: 5 }
            ]
          }
        ]
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('Vision API 오류:', error);
    throw new Error('이미지 분석에 실패했습니다.');
  }

  const data = await response.json();
  const result = data.responses[0];

  // 라벨 추출 (예: Plush toy, Stuffed animal, Teddy bear)
  const labels = result.labelAnnotations?.map((l: any) => l.description) || [];
  
  // 로고 추출 (예: Pokemon, Disney, Kakao Friends)
  const logos = result.logoAnnotations?.map((l: any) => l.description) || [];
  
  // 텍스트 추출
  const text = result.textAnnotations?.[0]?.description || '';
  
  // 웹 감지 결과 (가장 정확한 상품명)
  const webEntities = result.webDetection?.webEntities || [];
  const bestGuess = result.webDetection?.bestGuessLabels?.[0]?.label || '';
  
  // 상품명 결정 (우선순위: 웹감지 > 로고+라벨 > 라벨만)
  let productName = '';
  
  if (bestGuess) {
    productName = bestGuess;
  } else if (logos.length > 0 && labels.length > 0) {
    // 로고 + 첫번째 라벨 조합 (예: "Pokemon Plush toy")
    productName = `${logos[0]} ${labels[0]}`;
  } else if (labels.length > 0) {
    // 상위 2개 라벨 조합
    productName = labels.slice(0, 2).join(' ');
  }

  console.log('Vision API 결과:', { productName, labels, logos, text, bestGuess, webEntities });

  return {
    productName,
    labels,
    logos,
    text
  };
};
