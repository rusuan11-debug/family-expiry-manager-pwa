import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

export async function startBarcodeScanner(video, onDetected, onError = () => {}) {
  if (!video) throw new Error('扫码窗口未准备好');
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前浏览器不支持摄像头访问，请使用 iPhone Safari');
  video.setAttribute('playsinline', 'true');
  video.muted = true;
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.ITF
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  const reader = new BrowserMultiFormatReader(hints);
  let controls = null;
  let stopped = false;
  const returnedControls = await reader.decodeFromVideoDevice(undefined, video, (result, error, callbackControls) => {
    if (callbackControls) controls = callbackControls;
    if (result && !stopped) {
      stopped = true;
      try { controls?.stop(); } catch (_) {}
      onDetected(String(result.getText() || ''));
    } else if (error && error.name !== 'NotFoundException' && !stopped) {
      onError(error);
    }
  });
  if (returnedControls?.stop) controls = returnedControls;
  return {
    stop() {
      stopped = true;
      try { controls?.stop(); } catch (_) {}
      try { reader.reset(); } catch (_) {}
    }
  };
}
