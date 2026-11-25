// Local-only Chinese + English OCR: all dependencies are hosted on this Pages origin.
let libraryPromise;
function loadLibrary() {
  if (window.Tesseract?.createWorker) return Promise.resolve(window.Tesseract);
  if (libraryPromise) return libraryPromise;
  libraryPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('./ocr/tesseract.min.js', import.meta.url).href;
    script.onload = () => window.Tesseract?.createWorker ? resolve(window.Tesseract) : reject(new Error('本地 OCR 程序未正确加载'));
    script.onerror = () => reject(new Error('本地 OCR 程序尚未下载，请联网后重新打开应用'));
    document.head.appendChild(script);
  }).catch(error => { libraryPromise = null; throw error; });
  return libraryPromise;
}
export async function recognizeImageLocal(imageData, report = () => {}) {
  if (!imageData) throw new Error('尚未选择图片');
  report('正在加载本地中文识别模型…');
  const Tesseract = await loadLibrary();
  const base = new URL('./ocr/', import.meta.url).href;
  let worker;
  try {
    worker = await Tesseract.createWorker(['chi_sim', 'eng'], 1, {
      workerPath: base + 'worker.min.js', corePath: base + 'core', langPath: base + 'lang', workerBlobURL: false,
      logger: info => {
        if (!info?.status) return;
        const progress = Number.isFinite(info.progress) ? ' ' + Math.round(info.progress * 100) + '%' : '';
        const labels = {
          'loading tesseract core': '加载识别引擎', 'initializing tesseract': '初始化识别引擎',
          'loading language traineddata': '加载中文模型', 'initializing api': '初始化中文模型',
          'recognizing text': '正在识别图片文字'
        };
        report((labels[info.status] || '本地文字识别中') + progress);
      }
    });
    const result = await worker.recognize(imageData);
    return String(result?.data?.text || '');
  } finally {
    if (worker) try { await worker.terminate(); } catch (_) {}
  }
}