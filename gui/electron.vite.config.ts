import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { defineConfig } from 'electron-vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@workers': resolve('src/workers'),
        '@configs': resolve('src/configs'),
        '@utils': resolve('src/utils')
      }
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production')
    },
    build: {
      rollupOptions: {
        output: {
          format: 'es'
        }
      },
      externalizeDeps: true
    }
  },
  preload: {
    resolve: {
      alias: {
        '@utils': resolve('src/utils')
      }
    },
    build: {
      externalizeDeps: true
    }
  },
  renderer: {
    plugins: [
      react(),
      tailwindcss(),
      nodePolyfills({
        include: ['util', 'crypto', 'stream', 'fs', 'path']
      })
    ],
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@workers': resolve('src/workers')
      }
    }
  }
})
