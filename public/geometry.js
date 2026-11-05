/**
 * 普通透视镜头的几何采样模型。
 * 目标居中、与像面平行；距离沿光轴测量；像素为方形。
 */
export function calculateProjection(input) {
  const { fovDeg, fovAxis, hfovDeg, vfovDeg, widthPx, heightPx, targetWidthM, targetHeightM, distanceM } = input;
  const positiveValues = [
    [widthPx, '水平分辨率'], [heightPx, '垂直分辨率'],
    [targetWidthM, '目标宽度'], [targetHeightM, '目标高度'], [distanceM, '目标距离'],
  ];
  for (const [value, label] of positiveValues) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new Error(`${label}必须是大于 0 的有限数值。`);
    }
  }
  if (!Number.isSafeInteger(widthPx) || !Number.isSafeInteger(heightPx)) {
    throw new Error('分辨率必须是大于 0 的安全整数。');
  }
  const validateAngle = (angle, label) => {
    if (typeof angle !== 'number' || !Number.isFinite(angle) || angle <= 0 || angle >= 180) {
      throw new Error(`${label}必须大于 0° 且小于 180°。`);
    }
  };
  const axes = { horizontal: widthPx, vertical: heightPx, diagonal: Math.hypot(widthPx, heightPx) };
  if (!Object.hasOwn(axes, fovAxis) && fovAxis !== 'both') {
    throw new Error('请选择水平、垂直、对角或双 FOV 输入。');
  }
  let calculationAngle = fovDeg;
  let calculationAxis = fovAxis;
  if (fovAxis === 'both') {
    validateAngle(hfovDeg, '水平视场角');
    validateAngle(vfovDeg, '垂直视场角');
    const tanH = Math.tan(hfovDeg * Math.PI / 360);
    const tanV = Math.tan(vfovDeg * Math.PI / 360);
    const horizontalScale = tanH / widthPx;
    const verticalScale = tanV / heightPx;
    // 允许规格表中角度四舍五入带来的 0.1% 采样尺度差异。
    const mismatch = Math.abs(horizontalScale - verticalScale) / Math.max(horizontalScale, verticalScale);
    if (mismatch > 0.001) {
      throw Object.assign(new Error('水平、垂直 FOV 与分辨率比例不匹配。请使用方形像素模型修正后再计算。'), {
        code: 'FOV_MISMATCH',
        correctedHFOVDeg: 2 * Math.atan(tanV * (widthPx / heightPx)) * 180 / Math.PI,
        correctedVFOVDeg: 2 * Math.atan(tanH * (heightPx / widthPx)) * 180 / Math.PI,
      });
    }
    // 校验通过后以水平 FOV 保持严格方形像素，消除输入舍入误差。
    calculationAngle = hfovDeg;
    calculationAxis = 'horizontal';
  } else {
    validateAngle(fovDeg, '视场角');
  }
  const tangent = Math.tan(calculationAngle * Math.PI / 360);
  const sceneSpanM = 2 * distanceM * tangent;
  const gsd = sceneSpanM / axes[calculationAxis];
  const sceneWidthM = gsd * widthPx;
  const sceneHeightM = gsd * heightPx;
  const pixelsX = targetWidthM / gsd;
  const pixelsY = targetHeightM / gsd;
  const visiblePixelsX = Math.min(pixelsX, widthPx);
  const visiblePixelsY = Math.min(pixelsY, heightPx);
  const angleForPixels = (pixels) => 2 * Math.atan(tangent * (pixels / axes[calculationAxis])) * 180 / Math.PI;
  const widthPercent = pixelsX / widthPx * 100;
  const heightPercent = pixelsY / heightPx * 100;
  const result = {
    hfovDeg: angleForPixels(widthPx),
    vfovDeg: angleForPixels(heightPx),
    dfovDeg: angleForPixels(Math.hypot(widthPx, heightPx)),
    sceneWidthM,
    sceneHeightM,
    gsdXM: gsd,
    gsdYM: gsd,
    pixelsX,
    pixelsY,
    pixelArea: pixelsX * pixelsY,
    widthPercent,
    heightPercent,
    areaPercent: (pixelsX / widthPx) * (pixelsY / heightPx) * 100,
    visiblePixelsX,
    visiblePixelsY,
    visiblePixelArea: visiblePixelsX * visiblePixelsY,
    visibleAreaPercent: (visiblePixelsX / widthPx) * (visiblePixelsY / heightPx) * 100,
    fitsInFrame: pixelsX <= widthPx * (1 + 1e-12) && pixelsY <= heightPx * (1 + 1e-12),
  };
  if (gsd <= 0 || Object.entries(result).some(([key, value]) => key !== 'fitsInFrame' && (!Number.isFinite(value) || value <= 0))) {
    throw new Error('参数超出可计算范围，请缩小数值范围后重试。');
  }
  return result;
}
