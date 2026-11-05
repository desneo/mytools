import { calculateProjection } from './geometry.js';

const $ = (id) => document.getElementById(id);
const controls = {
  fov: $('fov'), axis: $('fov-axis'), width: $('resolution-width'), height: $('resolution-height'),
  preset: $('resolution-preset'), targetWidth: $('target-width'), targetHeight: $('target-height'),
  targetUnit: $('target-unit'), distance: $('distance'), distanceUnit: $('distance-unit'),
};
let shape = 'square';
let previousTargetUnit = 1;
let previousDistanceUnit = 1;

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
function setAttributes(element, attributes) {
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
}

function drawPreview(result, width, height) {
  const svg = $('field-preview');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  for (const id of ['clip-rect', 'frame-background', 'grid-rect']) {
    setAttributes($(id), { width, height });
  }
  const gridSize = Math.max(width, height) / 12;
  setAttributes($('frame-grid'), { width: gridSize, height: gridSize });
  $('frame-grid').firstElementChild.setAttribute('d', `M ${gridSize} 0 L 0 0 0 ${gridSize}`);
  // 超出画面的部分由 SVG clipPath 裁切；数值结果仍保留完整几何投影。
  setAttributes($('target-projection'), {
    x: (width - result.pixelsX) / 2, y: (height - result.pixelsY) / 2,
    width: result.pixelsX, height: result.pixelsY,
  });
  const arm = Math.max(width, height) * 0.012;
  $('crosshair').setAttribute('d', `M ${width / 2 - arm} ${height / 2} H ${width / 2 + arm} M ${width / 2} ${height / 2 - arm} V ${height / 2 + arm}`);
  setText('preview-svg-desc', `相机画面为 ${width} × ${height} 像素，居中目标的几何投影为 ${format(result.pixelsX)} × ${format(result.pixelsY)} 像素。${result.fitsInFrame ? '目标完全位于画面内。' : '超出画面的部分已裁切。'}`);
  setText('frame-resolution', `${format(width, 0)} × ${format(height, 0)} px`);
  setText('linear-percent', `宽 ${format(result.widthPercent)}% · 高 ${format(result.heightPercent)}%`);
}

function showError(error) {
  $('results').hidden = true;
  $('empty-results').hidden = false;
  $('error-message').hidden = false;
  $('error-message').textContent = error instanceof Error ? error.message : '参数无法计算，请检查输入。';
}

function calculate() {
  for (const element of Object.values(controls)) element.removeAttribute('aria-invalid');
  try {
    const inputs = [controls.fov, controls.width, controls.height, controls.targetWidth, controls.distance];
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
      widthPx: width, heightPx: height, targetWidthM,
      targetHeightM: shape === 'square' ? targetWidthM : controls.targetHeight.valueAsNumber * Number(controls.targetUnit.value),
      distanceM: controls.distance.valueAsNumber * Number(controls.distanceUnit.value),
    });
    $('results').hidden = false;
    $('empty-results').hidden = true;
    $('error-message').hidden = true;
    $('error-message').textContent = '';
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
  setShape('square');
  calculate();
});

calculate();
