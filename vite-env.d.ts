/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NANO_BANANA_API_KEY?: string;
  readonly VITE_GROQ_API_KEY?: string;
  readonly VITE_IMGBB_API_KEY?: string;
  readonly VITE_TAVILY_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
