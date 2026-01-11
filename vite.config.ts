import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';

// 简单的插件来处理 manifest.json 和静态资源复制
const copyStaticAssets = () => {
  return {
    name: 'copy-static-assets',
    closeBundle() {
      // 确保 dist 目录存在
      if (!fs.existsSync('dist')) return;

      // 复制 manifest.json
      if (fs.existsSync('manifest.json')) {
        fs.copyFileSync('manifest.json', 'dist/manifest.json');
      }

      // 复制 icons
      if (fs.existsSync('icons')) {
        if (!fs.existsSync('dist/icons')) fs.mkdirSync('dist/icons', { recursive: true });
        fs.cpSync('icons', 'dist/icons', { recursive: true });
      }

      // 复制 lib (katex/marked) - 暂时保留这种方式，或者改为 import
      // 鉴于 katex 包含字体文件，直接复制比较稳妥
      if (fs.existsSync('lib')) {
        if (!fs.existsSync('dist/lib')) fs.mkdirSync('dist/lib', { recursive: true });
        fs.cpSync('lib', 'dist/lib', { recursive: true });
      }
      
      // 复制 sidepanel html 和 css
      if (fs.existsSync('src/sidepanel/index.html')) {
        if (!fs.existsSync('dist/sidepanel')) fs.mkdirSync('dist/sidepanel', { recursive: true });
        fs.copyFileSync('src/sidepanel/index.html', 'dist/sidepanel/index.html');
        fs.copyFileSync('src/sidepanel/styles.css', 'dist/sidepanel/styles.css');
      }
      
      // 复制 content css
      if (fs.existsSync('src/content/content.css')) {
        if (!fs.existsSync('dist/content')) fs.mkdirSync('dist/content', { recursive: true });
        fs.copyFileSync('src/content/content.css', 'dist/content/content.css');
      }
    }
  };
};

export default defineConfig({
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'src/sidepanel/main.ts'),
        background: resolve(__dirname, 'src/background/service-worker.ts'),
        content: resolve(__dirname, 'src/content/content.ts')
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') return 'background/service-worker.js';
          if (chunkInfo.name === 'content') return 'content/content.js';
          if (chunkInfo.name === 'sidepanel') return 'sidepanel/js/main.js';
          return '[name].js';
        },
        // 禁用代码分割，或者配置 chunkFileNames
        // 为了简单起见，我们尽量让文件结构保持一致
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
    target: 'esnext',
    minify: false // 调试阶段不混淆
  },
  plugins: [copyStaticAssets()]
});
