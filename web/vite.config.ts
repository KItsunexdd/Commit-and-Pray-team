import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'
import { readApiConfig } from './src/api/config.ts'
import { themeCss } from './src/theme/palette.ts'
import { themeBootstrap } from './src/theme/preference.ts'

export default defineConfig(({ mode }) => {
  const config = readApiConfig(loadEnv(mode, process.cwd(), 'VITE_'))

  return {
    plugins: [react(), tailwindcss(), {
      name: 'initial-theme',
      transformIndexHtml: { order: 'pre', handler: html => html.replace('<!--theme-bootstrap-->', `<style>${themeCss()}</style><script>${themeBootstrap()}</script>`) },
    }, {
      name: 'preload-map-chunks',
      transformIndexHtml: {
        order: 'post',
        handler(_html, context) {
          return Object.values(context.bundle ?? {})
            .filter(item => item.type === 'chunk' && /^maplibre-(gl|geometry|style|shaders)$/.test(item.name))
            .map(item => ({ tag: 'link', attrs: { rel: 'modulepreload', href: `/${item.fileName}`, crossorigin: '' }, injectTo: 'head' as const }))
        },
      },
    }],
    // Типовые объявления MapLibre не должны обнулять поля, заданные прототипом.
    oxc: {
      typescript: { removeClassFieldsWithoutInitializer: true },
      assumptions: { setPublicClassFields: true },
    },
    optimizeDeps: {
      rolldownOptions: {
        transform: {
          typescript: { removeClassFieldsWithoutInitializer: true },
          assumptions: { setPublicClassFields: true },
        },
      },
    },
    resolve: {
      // Исходные модули той же закреплённой npm-версии можно разделить на чанки.
      alias: [{ find: /^maplibre-gl$/, replacement: fileURLToPath(new URL('./node_modules/maplibre-gl/src/index.ts', import.meta.url)) }],
    },
    build: {
      rolldownOptions: {
        output: {
          // В Vite 8 codeSplitting заменяет manualChunks; зависимости выделяем первыми.
          codeSplitting: {
            groups: [
              { name: 'maplibre-style', test: /[\\/]@maplibre[\\/]maplibre-gl-style-spec[\\/]/, priority: 30 },
              { name: 'maplibre-shaders', test: /[\\/]maplibre-gl[\\/]src[\\/]shaders[\\/]/, priority: 20 },
              { name: 'maplibre-geometry', test: /[\\/]maplibre-gl[\\/]src[\\/]geo[\\/]/, priority: 10 },
              { name: 'maplibre-gl', test: /[\\/]maplibre-gl[\\/]src[\\/]/ },
            ],
          },
        },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        [`^${config.basePath}/`]: {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },
  }
})
