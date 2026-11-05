import { calculateProjection } from './geometry.js';

const $ = (id) => document.getElementById(id);
const controls = {
  fov: $('fov'), verticalFov: $('vertical-fov'), axis: $('fov-axis'), width: $('resolution-width'), height: $('resolution-height'),
  preset: $('resolution-preset'), targetWidth: $('target-width'), targetHeight: $('target-height'),
  targetUnit: $('target-unit'), distance: $('distance'), distanceUnit: $('distance-unit'),
};
let shape = 'square';
let previousTargetUnit = 1;
let previousDistanceUnit = 1;
const MAX_IMAGE_SIDE = 16384;
const MAX_IMAGE_PIXELS = 33554432;
const downloadUrls = new Map();
let imageGeneration = 0;
let imageReady = false;
let previousFovAxis = 'horizontal';
let bothFovInitialized = false;
let fovCorrection = null;

// 保留有效小数；极大或极小结果使用科学计数，避免显示成 0。
function format(value, digits = 2) {
  if (value !== 0 && (Math.abs(value) < 0.001 || Math.abs(value) >= 1e9)) {
    return value.toExponential(2);
  }
  const decimals = value !== 0 && Math.abs(value) < 1
    ? Math.max(digits, Math.ceil(-Math.log10(Math.abs(value))) + 2)
    : digits;
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: decimals }).format(value);
}

function length(value) {
  if (value < 0.001) return `${format(value * 1e6)} μm`;
  if (value < 0.1) return `${format(value * 1000)} mm`;
  if (value >= 1000) return `${format(value / 1000, 3)} km`;
  return `${format(value, 3)} m`;
}

function setText(id, value) { $(id).textContent = value; }
function releaseDownloadUrls() {
  for (const [url, timer] of downloadUrls) {
    clearTimeout(timer);
    URL.revokeObjectURL(url);
  }
  downloadUrls.clear();
}

function clearImage() {
  imageGeneration += 1;
  imageReady = false;
  releaseDownloadUrls();
  $('download-png').disabled = true;
  $('download-png').removeAttribute('aria-busy');
  $('field-preview').hidden = true;
  $('field-preview').width = 1;
  $('field-preview').height = 1;
  $('image-unavailable').hidden = true;
  $('image-status').hidden = true;
}

function imageUnavailable(message) {
  clearImage();
  $('image-unavailable').hidden = false;
  setText('image-unavailable', message);
}

function drawPreview(result, width, height) {
  imageGeneration += 1;
  imageReady = false;
  releaseDownloadUrls();
  $('download-png').disabled = true;
  $('download-png').removeAttribute('aria-busy');
  $('image-status').hidden = true;
  setText('frame-resolution', `${format(width, 0)} × ${format(height, 0)} px`);
  setText('linear-percent', `宽 ${format(result.widthPercent)}% · 高 ${format(result.heightPercent)}%`);
  // 先检查尺寸和总像素量，避免分配超大 Canvas；不影响几何计算结果。
  if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE || width * height > MAX_IMAGE_PIXELS) {
    imageUnavailable(`该分辨率超出图片生成限制：单边最多 ${format(MAX_IMAGE_SIDE, 0)} px，总像素最多 ${format(MAX_IMAGE_PIXELS, 0)}。数值结果仍可使用。`);
    return;
  }
  try {
    const canvas = $('field-preview');
    if (canvas.width !== width || canvas.height !== height) {
      // 先释放旧尺寸，避免横竖分辨率交换时产生不必要的中间大图。
      canvas.width = 1;
      canvas.height = 1;
      canvas.width = width;
      canvas.height = height;
    }
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('浏览器无法创建图片画布。');
    context.fillStyle = '#edf3f0';
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#0c8c78';
    // 保留真实几何坐标和小数宽高，无描边，超出画面的部分由 Canvas 自动裁切。
    context.fillRect((width - result.pixelsX) / 2, (height - result.pixelsY) / 2, result.pixelsX, result.pixelsY);
    if (context.isContextLost?.()) throw new Error('浏览器图片画布不可用。');
    canvas.setAttribute('aria-label', `原始图像为 ${width} × ${height} 像素，居中目标的几何投影为 ${format(result.pixelsX)} × ${format(result.pixelsY)} 像素。${result.fitsInFrame ? '目标完全位于画面内。' : '超出画面的部分已裁切。'}`);
    canvas.hidden = false;
    $('image-unavailable').hidden = true;
    imageReady = true;
    $('download-png').disabled = false;
  } catch (error) {
    imageUnavailable(`${error instanceof Error ? error.message : '图片生成失败。'}请降低分辨率后重试；数值结果不受影响。`);
  }
}

function showError(error) {
  clearImage();
  $('results').hidden = true;
  $('empty-results').hidden = false;
  $('error-message').hidden = false;
  setText('error-text', error instanceof Error ? error.message : '参数无法计算，请检查输入。');
  fovCorrection = error?.code === 'FOV_MISMATCH' ? error : null;
  $('fov-corrections').hidden = !fovCorrection;
  if (fovCorrection) {
    controls.fov.setAttribute('aria-invalid', 'true');
    controls.verticalFov.setAttribute('aria-invalid', 'true');
  }
}

function calculate() {
  for (const element of Object.values(controls)) element.removeAttribute('aria-invalid');
  try {
    const inputs = [controls.fov, controls.width, controls.height, controls.targetWidth, controls.distance];
    if (controls.axis.value === 'both') inputs.push(controls.verticalFov);
    if (shape === 'rectangle') inputs.push(controls.targetHeight);
    for (const input of inputs) {
      if (input.value.trim() === '' || !Number.isFinite(input.valueAsNumber)) {
        input.setAttribute('aria-invalid', 'true');
        throw new Error(`请填写有效的${document.querySelector(`label[for="${input.id}"]`).textContent}。`);
      }
    }
    const width = controls.width.valueAsNumber;
    const height = controls.height.valueAsNumber;
    const targetWidthM = controls.targetWidth.valueAsNumber * Number(controls.targetUnit.value);
    const result = calculateProjection({
      fovDeg: controls.fov.valueAsNumber, fovAxis: controls.axis.value,
      hfovDeg: controls.fov.valueAsNumber, vfovDeg: controls.verticalFov.valueAsNumber,
      widthPx: width, heightPx: height, targetWidthM,
      targetHeightM: shape === 'square' ? targetWidthM : controls.targetHeight.valueAsNumber * Number(controls.targetUnit.value),
      distanceM: controls.distance.valueAsNumber * Number(controls.distanceUnit.value),
    });
    $('results').hidden = false;
    $('empty-results').hidden = true;
    $('error-message').hidden = true;
    setText('error-text', '');
    $('fov-corrections').hidden = true;
    fovCorrection = null;
    setText('pixels-x', format(result.pixelsX));
    setText('pixels-y', format(result.pixelsY));
    setText('pixel-area', format(result.pixelArea));
    setText('area-percent', format(result.visibleAreaPercent));
    setText('scene-size', `${length(result.sceneWidthM)} × ${length(result.sceneHeightM)}`);
    setText('gsd', `${length(result.gsdXM)} / ${length(result.gsdYM)}`);
    setText('axis-fovs', `${format(result.hfovDeg)}° / ${format(result.vfovDeg)}°`);
    setText('diagonal-fov', `${format(result.dfovDeg)}°`);
    const subpixel = result.pixelsX < 1 || result.pixelsY < 1;
    $('projection-notice').hidden = !subpixel;
    setText('projection-notice', subpixel ? '目标至少一条边的几何投影小于 1 px；这是连续尺寸估计，不代表目标可以被检测或识别。' : '');
    $('clipping-result').hidden = result.fitsInFrame;
    setText('visible-pixels', `${format(result.visiblePixelsX)} × ${format(result.visiblePixelsY)} px`);
    setText('visible-area', `${format(result.visiblePixelArea)} px²`);
    setText('full-projection-percent', `${format(result.areaPercent)}%`);
    drawPreview(result, width, height);
  } catch (error) {
    showError(error);
  }
}

function setShape(nextShape) {
  shape = nextShape;
  const square = shape === 'square';
  $('target-height-field').hidden = square;
  controls.targetHeight.required = !square;
  setText('target-width-label', square ? '目标边长' : '目标宽度');
  for (const button of document.querySelectorAll('[data-shape]')) {
    const active = button.dataset.shape === shape;
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
  }
}

function syncPreset() {
  const matching = [...controls.preset.options].find((option) => option.value === `${controls.width.value}x${controls.height.value}`);
  controls.preset.value = matching ? matching.value : 'custom';
}

function syncFovMode() {
  const both = controls.axis.value === 'both';
  if (both && !bothFovInitialized) {
    bothFovInitialized = true;
    try {
      // 仅首次进入双角模式时换算初值，之后保留用户编辑的角度。
      const result = calculateProjection({
        fovDeg: controls.fov.valueAsNumber, fovAxis: previousFovAxis,
        widthPx: controls.width.valueAsNumber, heightPx: controls.height.valueAsNumber,
        targetWidthM: 1, targetHeightM: 1, distanceM: 1,
      });
      controls.fov.value = String(Number(result.hfovDeg.toPrecision(12)));
      controls.verticalFov.value = String(Number(result.vfovDeg.toPrecision(12)));
    } catch {
      // 无效参数交由正常校验显示，不用默认值覆盖用户输入。
    }
  }
  $('vertical-fov-field').hidden = !both;
  controls.verticalFov.required = both;
  $('fov-row').classList.toggle('both-fov', both);
  setText('fov-label', both ? '水平 HFOV' : '视场角');
  setText('fov-hint', both
    ? '检查方形像素一致性；通过后以水平 FOV 为准计算。角度须在 0°–180° 之间（不含端点）。'
    : '使用所选方向的完整视场角，范围 0°–180°（不含端点）。');
  previousFovAxis = controls.axis.value;
}

// 切换单位只改变显示数值，保持物理尺寸不变。
function convertUnit(input, oldFactor, newFactor) {
  if (input.value.trim() !== '' && Number.isFinite(input.valueAsNumber)) {
    input.value = String(Number((input.valueAsNumber * oldFactor / newFactor).toPrecision(12)));
  }
}

$('calculator-form').addEventListener('submit', (event) => event.preventDefault());
$('calculator-form').addEventListener('input', (event) => {
  if (event.target === controls.width || event.target === controls.height) syncPreset();
  // select 的单位和预设需要先完成转换，再进行计算。
  if (event.target.tagName === 'INPUT') calculate();
});
$('calculator-form').addEventListener('change', (event) => {
  if (event.target === controls.axis) syncFovMode();
  if (event.target === controls.preset && controls.preset.value !== 'custom') {
    const [width, height] = controls.preset.value.split('x');
    controls.width.value = width;
    controls.height.value = height;
  }
  if (event.target === controls.targetUnit) {
    const factor = Number(controls.targetUnit.value);
    convertUnit(controls.targetWidth, previousTargetUnit, factor);
    convertUnit(controls.targetHeight, previousTargetUnit, factor);
    previousTargetUnit = factor;
  }
  if (event.target === controls.distanceUnit) {
    const factor = Number(controls.distanceUnit.value);
    convertUnit(controls.distance, previousDistanceUnit, factor);
    previousDistanceUnit = factor;
  }
  calculate();
});
for (const button of document.querySelectorAll('[data-shape]')) {
  button.addEventListener('click', () => { setShape(button.dataset.shape); calculate(); });
}
$('reset-button').addEventListener('click', () => {
  $('calculator-form').reset();
  previousTargetUnit = 1;
  previousDistanceUnit = 1;
  previousFovAxis = 'horizontal';
  bothFovInitialized = false;
  syncFovMode();
  setShape('square');
  calculate();
});

$('use-horizontal-fov').addEventListener('click', () => {
  if (!fovCorrection) return;
  controls.verticalFov.value = String(fovCorrection.correctedVFOVDeg);
  calculate();
});
$('use-vertical-fov').addEventListener('click', () => {
  if (!fovCorrection) return;
  controls.fov.value = String(fovCorrection.correctedHFOVDeg);
  calculate();
});

$('download-png').addEventListener('click', () => {
  if (!imageReady) return;
  const generation = imageGeneration;
  const canvas = $('field-preview');
  const filename = `target-${canvas.width}x${canvas.height}.png`;
  const button = $('download-png');
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  $('image-status').hidden = true;
  const finish = (message) => {
    if (generation !== imageGeneration) return;
    button.disabled = !imageReady;
    button.removeAttribute('aria-busy');
    setText('image-status', message);
    $('image-status').hidden = false;
  };
  try {
    // PNG 仅在点击时编码，生成于浏览器内存，不发送给服务器。
    canvas.toBlob((blob) => {
      if (generation !== imageGeneration) return;
      if (!blob) {
        finish('PNG 生成失败，请降低分辨率后重试。数值结果不受影响。');
        return;
      }
      try {
        const url = URL.createObjectURL(blob);
        const timer = setTimeout(() => {
          URL.revokeObjectURL(url);
          downloadUrls.delete(url);
        }, 60000);
        downloadUrls.set(url, timer);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.append(link);
        link.click();
        link.remove();
        finish('PNG 已生成并请求下载；图片仅在你的浏览器中处理。');
      } catch {
        releaseDownloadUrls();
        finish('无法下载 PNG，请检查浏览器的下载设置后重试。数值结果不受影响。');
      }
    }, 'image/png');
  } catch {
    finish('PNG 编码失败，请降低分辨率后重试。数值结果不受影响。');
  }
});
window.addEventListener('pagehide', () => {
  imageGeneration += 1;
  releaseDownloadUrls();
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) calculate();
});

calculate();
