import { ProductData, DetailSection, SalesLogicType, PageLength, GeneratedDetailPage } from '../types';
import { uploadToCloudinary } from './cloudinaryService';

// ========================================
// Gemini API 설정
// ========================================

const getGeminiApiKey = (): string => {
  // 1. localStorage에서 사용자 설정 키 확인
  const userKey = localStorage.getItem('gemini_api_key');
  if (userKey && userKey.trim()) {
    return userKey.trim();
  }
  
  // 2. 환경변수에서 확인
  const envKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (envKey) {
    return envKey;
  }
  
  throw new Error('Gemini API 키가 설정되지 않았습니다. 설정에서 API 키를 입력해주세요.');
};

const getKieApiKey = (): string => {
  const apiKey = localStorage.getItem('nanoBananaApiKey');
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Kie.ai API 키가 설정되지 않았습니다. 설정에서 API 키를 입력해주세요.');
  }
  return apiKey.trim();
};

// ========================================
// Kie.ai API 설정
// ========================================

// Kie.ai 태스크 생성
async function createKieTask(prompt: string, imageSize: string = '9:16', imageUrls?: string[]): Promise<string> {
  const apiKey = getKieApiKey();
  
  const body: any = {
    model: imageUrls && imageUrls.length > 0 ? 'google/nano-banana-edit' : 'google/nano-banana',
    input: {
      prompt,
      output_format: 'png',
      image_size: imageSize
    }
  };
  
  // 이미지 편집 모드인 경우 image_urls 추가
  if (imageUrls && imageUrls.length > 0) {
    body.input.image_urls = imageUrls;
  }
  
  const response = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error('Kie.ai 태스크 생성 오류:', error);
    if (response.status === 401) {
      throw new Error('Kie.ai API 키가 유효하지 않습니다.');
    } else if (response.status === 402) {
      throw new Error('Kie.ai 계정 잔액이 부족합니다.');
    }
    throw new Error('이미지 생성 태스크 생성 실패');
  }
  
  const data = await response.json();
  if (data.code !== 200) {
    throw new Error(data.msg || '태스크 생성 실패');
  }
  
  return data.data.taskId;
}

// Kie.ai 태스크 상태 조회 (폴링)
async function pollKieTask(taskId: string, maxAttempts: number = 60, intervalMs: number = 2000): Promise<string> {
  const apiKey = getKieApiKey();
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    if (!response.ok) {
      throw new Error('태스크 상태 조회 실패');
    }
    
    const data = await response.json();
    
    if (data.data.state === 'success') {
      const resultJson = JSON.parse(data.data.resultJson);
      if (resultJson.resultUrls && resultJson.resultUrls.length > 0) {
        const tempImageUrl = resultJson.resultUrls[0];
        
        // Kie.ai 임시 URL을 Cloudinary로 복사해서 영구 URL 획득 (CORS 해결)
        try {
          const { uploadExternalImageToCloudinary } = await import('./cloudinaryService');
          const permanentUrl = await uploadExternalImageToCloudinary(tempImageUrl, 'detail-sections');
          return permanentUrl;
        } catch (uploadError) {
          console.error('Cloudinary 업로드 실패, 원본 URL 반환:', uploadError);
          return tempImageUrl;
        }
      }
      throw new Error('생성된 이미지 URL이 없습니다');
    } else if (data.data.state === 'fail') {
      throw new Error(data.data.failMsg || '이미지 생성 실패');
    }
    
    // waiting 상태면 대기 후 재시도
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  
  throw new Error('이미지 생성 시간 초과');
}

// Kie.ai로 이미지 생성 (통합 함수)
async function generateImageWithKie(prompt: string, imageSize: string = '9:16', referenceImageUrl?: string): Promise<string> {
  const imageUrls = referenceImageUrl ? [referenceImageUrl] : undefined;
  const taskId = await createKieTask(prompt, imageSize, imageUrls);
  const imageUrl = await pollKieTask(taskId);
  return imageUrl;
}

const TEXT_MODEL = 'gemini-2.0-flash';
const IMAGE_MODEL = 'gemini-2.0-flash-exp-image-generation'; // 편집 함수에서만 사용

// ========================================
// 1. 판매 논리 프레임워크 정의
// ========================================

const SALES_LOGIC_FRAMEWORK = {
  5: ['hook', 'solution', 'clarity', 'service', 'riskReversal'] as SalesLogicType[],
  7: ['hook', 'solution', 'clarity', 'socialProof', 'service', 'riskReversal', 'comparison'] as SalesLogicType[],
  9: ['hook', 'solution', 'clarity', 'socialProof', 'service', 'brandStory', 'comparison', 'riskReversal', 'service'] as SalesLogicType[],
};

const LOGIC_TYPE_INFO: Record<SalesLogicType, { title: string; description: string }> = {
  hook: { title: '문제 제기', description: '고객의 불편함과 고민을 자극하는 후킹' },
  solution: { title: '해결책 제시', description: '이 상품이 어떻게 문제를 해결하는지' },
  clarity: { title: '스펙/비교', description: '크기, 용량, 성분 등 구체적 정보' },
  socialProof: { title: '사회적 증거', description: '리뷰, 판매량, 수상 경력 등' },
  service: { title: '활용법', description: '사용 방법, 활용 팁, 스타일링' },
  riskReversal: { title: '신뢰/보장', description: 'AS, 환불 정책, 인증, 보증' },
  brandStory: { title: '브랜드 스토리', description: '브랜드 철학, 제조 과정, 장인 정신' },
  comparison: { title: '경쟁사 비교', description: '타사 대비 우위점, 차별화 포인트' },
};

// ========================================
// 2. 상세페이지 기획 함수
// ========================================

export async function planDetailPage(productData: ProductData): Promise<DetailSection[]> {
  const apiKey = getGeminiApiKey();
  
  // 페이지 길이 결정
  let targetLength: 5 | 7 | 9 = 7; // 기본값 설정
  
  if (productData.pageLength === 'auto') {
    // AI가 결정: 가격과 카테고리 기반
    if (productData.price > 100000 || ['뷰티/화장품', '디지털/IT'].includes(productData.category || '')) {
      targetLength = 9;
    } else if (productData.price > 30000) {
      targetLength = 7;
    } else {
      targetLength = 5;
    }
  } else if (productData.pageLength === 5 || productData.pageLength === 7 || productData.pageLength === 9) {
    targetLength = productData.pageLength;
  }

  const logicSequence = SALES_LOGIC_FRAMEWORK[targetLength];

  const prompt = `
당신은 한국 이커머스 상세페이지 전문 기획자입니다.
스마트스토어와 쿠팡에서 '팔리는' 상세페이지를 만드는 전략가입니다.

## 상품 정보
- 상품명: ${productData.name}
- 카테고리: ${productData.category || '미지정'}
- 가격: ${productData.price.toLocaleString()}원
- 설명: ${productData.description}
- 타겟: ${productData.targetGender === 'all' ? '전체' : productData.targetGender === 'female' ? '여성' : '남성'} / ${(productData.targetAge || []).join(', ') || '전연령'}
${productData.promotionText ? `- 프로모션: ${productData.promotionText}` : ''}

## 요청 사항
${targetLength}장의 상세페이지 섹션을 기획해주세요.

각 섹션은 아래 판매 논리 순서를 따릅니다:
${logicSequence.map((logic, idx) => `${idx + 1}. ${LOGIC_TYPE_INFO[logic].title} (${logic}): ${LOGIC_TYPE_INFO[logic].description}`).join('\n')}

## 필수 규칙
1. keyMessage는 반드시 100% 한국어로 작성 (영어 헤드라인 절대 금지)
2. 감성적이면서도 구체적인 카피 작성
3. 타겟 연령대와 성별에 맞는 톤앤매너 사용
4. visualPrompt는 영어로, 9:16 세로 이미지에 적합하게 작성

## 출력 형식 (JSON)
{
  "sections": [
    {
      "order": 1,
      "logicType": "hook",
      "title": "섹션 제목",
      "keyMessage": "메인 카피 (한글만, 2줄 이내)",
      "subMessage": "보조 카피 (선택)",
      "visualPrompt": "English prompt for 9:16 vertical product image...",
      "textPosition": "center",
      "textStyle": "light"
    }
  ]
}

JSON만 출력하세요.
`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }
      })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('Gemini API 오류:', error);
    throw new Error('상세페이지 기획 생성 실패');
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('기획 생성 실패: JSON 형식이 아닙니다');
  
  const parsed = JSON.parse(jsonMatch[0]);
  
  return parsed.sections.map((section: any, idx: number) => ({
    id: `section-${idx + 1}`,
    order: section.order || idx + 1,
    logicType: section.logicType,
    title: section.title,
    keyMessage: section.keyMessage,
    subMessage: section.subMessage,
    visualPrompt: section.visualPrompt,
    textPosition: section.textPosition || 'center',
    textStyle: section.textStyle || 'light',
    isGenerating: false
  }));
}

// ========================================
// 3. 이미지 생성 함수 (텍스트 포함 + Img2Img)
// ========================================

export async function generateSectionImage(
  section: DetailSection,
  productData: ProductData,
  referenceImage?: string
): Promise<string> {
  
  const textInstruction = `
IMPORTANT RULES - MUST FOLLOW:
- NO text, titles, watermarks, or Korean characters on the image
- NO boxes, frames, borders, or rectangular shapes for text
- NO placeholder areas or empty boxes
- Create a seamless, natural product image
- Clean visual background suitable for ${productData.category || '일반'} category
- Focus on high-quality product photography only
`;

  const fullPrompt = `
Create a high-quality e-commerce product detail image for Korean online shopping.

${section.visualPrompt}

${textInstruction}

Style requirements:
- Professional product photography quality
- Clean, modern Korean e-commerce aesthetic
- Target audience: ${productData.targetGender === 'female' ? 'women' : productData.targetGender === 'male' ? 'men' : 'general'}

Product: ${productData.name}
`;

  try {
    // 참조 이미지가 있으면 Cloudinary에 먼저 업로드해서 URL 획득
    let referenceImageUrl: string | undefined;
    if (referenceImage && productData.images.length > 0) {
      const mainImage = productData.images[0];
      if (mainImage.startsWith('http')) {
        referenceImageUrl = mainImage;
      } else if (mainImage.startsWith('data:image')) {
        // base64 이미지를 Cloudinary에 업로드
        const { uploadToCloudinary } = await import('./cloudinaryService');
        referenceImageUrl = await uploadToCloudinary(mainImage, 'reference-images');
      }
    }
    
    const imageUrl = await generateImageWithKie(fullPrompt, '9:16', referenceImageUrl);
    return imageUrl;
  } catch (error) {
    console.error('Kie.ai 이미지 생성 실패:', error);
    throw new Error('이미지 생성 실패');
  }
}

// ========================================
// 4. 썸네일 생성 함수 (1:1)
// ========================================

export async function generateThumbnail(productData: ProductData): Promise<string> {
  const config = productData.thumbnailConfig;
  
  const prompt = `
Create a professional e-commerce product thumbnail image.
IMPORTANT: NO TEXT on the image. Clean product photo only.

Product: ${productData.name}
Category: ${productData.category || '일반'}

Style: ${config?.style === 'lifestyle' ? 'Lifestyle shot with context' : config?.style === 'creative' ? 'Creative artistic composition' : 'Clean white background product shot'}

${config?.includeHand ? 'Include a hand model holding or presenting the product naturally.' : ''}
${config?.includeModel ? 'Include a Korean model appropriate for the target demographic.' : ''}

Requirements:
- High-quality product photography
- NO text, NO watermarks, NO titles
- NO boxes, frames, borders, or rectangular shapes
- NO placeholder areas or empty spaces for text
- Seamless, natural product image
- Eye-catching and click-worthy
- Korean market aesthetic
`;

  try {
    // 참조 이미지가 있으면 URL 획득
    let referenceImageUrl: string | undefined;
    if (productData.images.length > 0) {
      const mainImage = productData.images[0];
      if (mainImage.startsWith('http')) {
        referenceImageUrl = mainImage;
      } else if (mainImage.startsWith('data:image')) {
        const { uploadToCloudinary } = await import('./cloudinaryService');
        referenceImageUrl = await uploadToCloudinary(mainImage, 'reference-images');
      }
    }
    
    const imageUrl = await generateImageWithKie(prompt, '1:1', referenceImageUrl);
    return imageUrl;
  } catch (error) {
    console.error('Kie.ai 썸네일 생성 실패:', error);
    throw new Error('썸네일 생성 실패');
  }
}

// ========================================
// 5. 전체 상세페이지 생성 (메인 함수)
// ========================================

export async function generateFullDetailPage(
  productData: ProductData,
  onProgress?: (current: number, total: number, message: string) => void
): Promise<GeneratedDetailPage> {
  
  // 1단계: 기획 (순차 - 이건 먼저 완료되어야 함)
  onProgress?.(0, 100, '상세페이지 구조를 기획하고 있습니다...');
  const sections = await planDetailPage(productData);
  
  onProgress?.(10, 100, `${sections.length}개 이미지를 동시에 생성 시작...`);
  
  // 2단계: 모든 섹션 이미지를 병렬로 생성 (Promise.all 사용)
  const imagePromises = sections.map(async (section) => {
    try {
      const imageUrl = await generateSectionImage(
        section,
        productData,
        productData.images[0]
      );
      return {
        ...section,
        imageUrl,
        isGenerating: false
      };
    } catch (error) {
      console.error(`Section ${section.order} generation failed:`, error);
      return {
        ...section,
        isGenerating: false
      };
    }
  });
  
  // 썸네일도 동시에 생성
  const thumbnailPromise = productData.thumbnailConfig 
    ? generateThumbnail(productData)
        .then(thumbnailUrl => ({
          imageUrl: thumbnailUrl,
          prompt: `${productData.name} thumbnail`
        }))
        .catch(error => {
          console.error('Thumbnail generation failed:', error);
          return undefined;
        })
    : Promise.resolve(undefined);
  
  // 진행률 업데이트
  onProgress?.(30, 100, `${sections.length}개 이미지 병렬 생성 중...`);
  
  // 모든 이미지 + 썸네일 동시 완료 대기
  const [generatedSections, thumbnail] = await Promise.all([
    Promise.all(imagePromises),
    thumbnailPromise
  ]);
  
  onProgress?.(100, 100, '완료!');
  
  return {
    sections: generatedSections,
    thumbnail
  };
}

// ========================================
// 6. 개별 섹션 재생성
// ========================================

export async function regenerateSection(
  section: DetailSection,
  productData: ProductData
): Promise<string> {
  return generateSectionImage(section, productData, productData.images[0]);
}

// ========================================
// 7. 섹션 카피 수정 후 재생성
// ========================================

export async function updateSectionCopy(
  section: DetailSection,
  newKeyMessage: string,
  newSubMessage?: string
): Promise<DetailSection> {
  return {
    ...section,
    keyMessage: newKeyMessage,
    subMessage: newSubMessage
  };
}

// ========================================
// 8. 기존 함수들 (유지)
// ========================================

// 상품 이미지 분석 (Gemini Vision)
export const analyzeProductImage = async (imageBase64: string): Promise<{
  productName: string;
  brand: string;
  category: string;
  features: string[];
}> => {
  const apiKey = getGeminiApiKey();

  // 이미 처리된 base64인지 확인 (무한 루프 방지)
  let mimeType = 'image/jpeg';
  let base64Data = imageBase64;
  
  if (imageBase64.startsWith('data:image/')) {
    const matches = imageBase64.match(/^data:image\/([a-z]+);base64,(.+)$/);
    if (matches) {
      mimeType = `image/${matches[1]}`;
      base64Data = matches[2];
    } else {
      // 매칭 실패시 data: 프리픽스만 제거
      base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
    }
  }
  
  // base64Data가 너무 짧으면 에러
  if (!base64Data || base64Data.length < 100) {
    throw new Error('유효하지 않은 이미지 데이터입니다.');
  }

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

상품명은 네이버 쇼핑에서 검색할 수 있도록 정확하게 작성해주세요.`
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
  const apiKey = getGeminiApiKey();
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

// ========================================
// 9. 상품 정보 검색 (Gemini 기반)
// ========================================

export const searchProductInfo = async (productName: string): Promise<{ description: string; targetAudience: string }> => {
  const apiKey = getGeminiApiKey();
  
  const prompt = `
"${productName}" 제품에 대한 정보를 검색하고 분석해서 아래 형식으로 정리해줘.

**주요 특징:**
- (핵심 기능과 효과 3-5가지)

**제품 사양:**
- 용량, 주요 성분, 피부 타입 등

**사용 방법:**
(구체적인 사용 방법)

**장점:**
- (구매해야 하는 이유 2-3가지)

중요: 모든 텍스트를 한글로만 작성해.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2000 }
        })
      }
    );

    if (!response.ok) {
      throw new Error('상품 정보 검색 실패');
    }

    const data = await response.json();
    const formattedResult = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // 타겟 고객 추출
    const targetPrompt = `"${productName}" 제품의 타겟 고객층을 한 문장으로 설명해줘. 한글로만 작성.`;
    const targetResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: targetPrompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
        })
      }
    );

    const targetData = await targetResponse.json();
    const targetResult = targetData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return {
      description: formattedResult.trim(),
      targetAudience: targetResult.trim()
    };
  } catch (e: any) {
    console.error("제품 검색 실패:", e);
    throw new Error("검색 결과가 없습니다.");
  }
};

// ========================================
// 10. 파일 내용 분석 (Gemini 기반)
// ========================================

export const analyzeFileContent = async (text: string): Promise<{ description: string; targetAudience: string }> => {
  const apiKey = getGeminiApiKey();
  
  const prompt = `
아래 제품 정보 파일 내용을 분석해서 정리해줘:

${text}

위 내용을 바탕으로 아래 형식으로 정리해줘:

**주요 특징:**
- (핵심 기능과 효과 3-5가지)

**제품 사양:**
- 용량, 주요 성분, 피부 타입 등

**사용 방법:**
(구체적인 사용 방법)

**장점:**
- (구매해야 하는 이유 2-3가지)

중요: 모든 텍스트를 한글로만 작성해.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2000 }
        })
      }
    );

    if (!response.ok) {
      throw new Error('파일 분석 실패');
    }

    const data = await response.json();
    const formattedResult = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // 타겟 고객 추출
    const targetPrompt = `위 제품 정보를 바탕으로 타겟 고객층을 한 문장으로 설명해줘. 한글로만 작성.`;
    const targetResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: targetPrompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
        })
      }
    );

    const targetData = await targetResponse.json();
    const targetResult = targetData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return {
      description: formattedResult.trim(),
      targetAudience: targetResult.trim()
    };
  } catch (e: any) {
    console.error("파일 분석 실패:", e);
    throw new Error("파일 분석에 실패했습니다.");
  }
};
// ============================================
// 11. 이미지 편집
// ============================================

export async function editProductImage(imageUrl: string, prompt: string): Promise<string> {
  const apiKey = getGeminiApiKey();
  
  let imageBase64 = imageUrl;
  if (imageUrl.startsWith('http')) {
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    imageBase64 = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  }
  
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  
  const editResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: `이 이미지를 다음 지시에 따라 수정해주세요: ${prompt}` },
            { inlineData: { mimeType: 'image/jpeg', data: base64Data } }
          ]
        }],
        generationConfig: { responseModalities: ['image', 'text'] }
      })
    }
  );
  
  const editData = await editResponse.json();
  const imagePart = editData.candidates?.[0]?.content?.parts?.find(
    (part: { inlineData?: { mimeType: string; data: string } }) => part.inlineData
  );
  
  if (!imagePart?.inlineData) {
    throw new Error('이미지 편집 실패');
  }
  
  return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
}

