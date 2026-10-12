import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const wasmSrcDir = path.resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const wasmDestDir = path.resolve(root, 'public/mediapipe/wasm');
const modelsDestDir = path.resolve(root, 'public/models');
const modelDestFile = path.resolve(modelsDestDir, 'pose_landmarker_lite.task');

const MODEL_DOWNLOAD_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 1. Copy wasm files
if (fs.existsSync(wasmSrcDir)) {
  ensureDir(wasmDestDir);
  const files = fs.readdirSync(wasmSrcDir);
  for (const file of files) {
    const src = path.join(wasmSrcDir, file);
    const dest = path.join(wasmDestDir, file);
    fs.copyFileSync(src, dest);
  }
  console.log(`[prepare-mediapipe] Copied ${files.length} wasm files to public/mediapipe/wasm/`);
} else {
  console.warn(`[prepare-mediapipe] Warning: ${wasmSrcDir} not found.`);
}

// 2. Download pose_landmarker_lite.task if missing
ensureDir(modelsDestDir);
if (!fs.existsSync(modelDestFile)) {
  console.log('[prepare-mediapipe] Downloading pose_landmarker_lite.task...');
  const file = fs.createWriteStream(modelDestFile);
  https.get(MODEL_DOWNLOAD_URL, (response) => {
    // Handle redirect
    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
      https.get(response.headers.location, (redirectRes) => {
        redirectRes.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log('[prepare-mediapipe] Download complete: public/models/pose_landmarker_lite.task');
        });
      });
    } else {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log('[prepare-mediapipe] Download complete: public/models/pose_landmarker_lite.task');
      });
    }
  }).on('error', (err) => {
    fs.unlink(modelDestFile, () => {});
    console.warn('[prepare-mediapipe] Failed to download model asset:', err.message);
  });
} else {
  console.log('[prepare-mediapipe] pose_landmarker_lite.task already exists.');
}
