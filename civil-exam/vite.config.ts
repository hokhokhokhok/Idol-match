import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages 등 하위 경로 배포 시 BASE=/Idol-match/civil-exam/ 처럼 지정
const base = process.env.BASE ?? './';

export default defineConfig({
  base,
  build: {
    rolldownOptions: {
      output: {
        // 문항 데이터(src/data/sets)는 앱 코드와 별도 청크로: 코드만 바뀐 업데이트에서 문항을 다시 받지 않게 한다
        codeSplitting: { groups: [{ name: 'question-sets', test: /src[\\/]data[\\/]sets[\\/]/ }] },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/*.svg', 'fonts/LICENSE'],
      manifest: {
        name: '감정평가사 1차 모의고사 — 민법·경제학원론·부동산학원론·감정평가관계법규',
        short_name: '1차 모의고사',
        description: '감정평가사 1차 민법·경제학원론·부동산학원론·감정평가관계법규 모의고사 (오프라인)',
        lang: 'ko',
        display: 'standalone',
        orientation: 'any',
        background_color: '#FFFEFA',
        theme_color: '#1f2a44',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 폰트(woff2)까지 모두 프리캐시해 완전 오프라인에서도 같은 조판으로 보이게 한다.
        // .woff는 woff2 미지원 브라우저용 폴백이라 제외.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,json}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
});
