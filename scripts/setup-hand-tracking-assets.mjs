/**
 * Setup script for hand tracking WASM assets.
 * Copies MediaPipe WASM files from node_modules to public/mediapipe/wasm/
 * and checks for the hand_landmarker.task model file.
 *
 * Run: node scripts/setup-hand-tracking-assets.mjs
 */

import { existsSync, mkdirSync, copyFileSync, readdirSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const WASM_SRC = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const WASM_DEST = resolve(root, 'public/mediapipe/wasm');
const MODEL_DEST = resolve(root, 'public/models/hand_landmarker.task');

let errors = 0;
let copies = 0;

// --- 1. Copy WASM files ---
if (!existsSync(WASM_SRC)) {
  console.error(`\n[ERROR] WASM source not found: ${WASM_SRC}`);
  console.error('        Run: npm install @mediapipe/tasks-vision@0.10.17 --save-exact\n');
  errors++;
} else {
  mkdirSync(WASM_DEST, { recursive: true });
  const files = readdirSync(WASM_SRC).filter(f => f.endsWith('.wasm') || f.endsWith('.js'));
  for (const file of files) {
    const src = join(WASM_SRC, file);
    const dest = join(WASM_DEST, file);
    copyFileSync(src, dest);
    copies++;
    console.log(`  [OK] ${file}`);
  }
  console.log(`\nCopied ${copies} WASM asset(s) to public/mediapipe/wasm/`);
}

// --- 2. Check model file ---
mkdirSync(resolve(root, 'public/models'), { recursive: true });
if (!existsSync(MODEL_DEST)) {
  console.warn('\n[WARNING] Hand landmarker model file not found:');
  console.warn(`          ${MODEL_DEST}`);
  console.warn('\n  Download it from:');
  console.warn('  https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task');
  console.warn('  Then place it at: public/models/hand_landmarker.task\n');
} else {
  console.log('\n  [OK] hand_landmarker.task found.');
}

// --- 3. Final summary ---
if (errors > 0) {
  console.error(`\nSetup completed with ${errors} error(s). Fix them before starting the dev server.\n`);
  process.exit(1);
} else {
  console.log('\nSetup complete. Start the dev server with: npm run dev\n');
}
