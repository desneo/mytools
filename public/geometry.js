/**
 * 普通透视镜头的几何采样模型。
 * 目标居中、与像面平行；距离沿光轴测量；像素为方形。
 */
export function calculateProjection(input) {
  const { fovDeg, fovAxis, widthPx, heightPx, targetWidthM, targetHeightM, distanceM } = input;
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
  if (typeof fovDeg !== 'number' || !Number.isFinite(fovDeg) || fovDeg <= 0 || fovDeg >= 180) {
    throw new Error('视场角必须大于 0° 且小于 180°。');
  }
  const axes = { horizontal: widthPx, vertical: heightPx, diagonal: Math.hypot(widthPx, heightPx) };
  if (!Object.hasOwn(axes, fovAxis)) {
    throw new Error('请选择水平、垂直或对角视场角。');
  }

  const tangent = Math.tan(fovDeg * Math.PI / 360);
  const sceneSpanM = 2 * distanceM * tangent;
  const gsd = sceneSpanM / axes[fovAxis];
  const sceneWidthM = gsd * widthPx;
  const sceneHeightM = gsd * heightPx;
  const pixelsX = targetWidthM / gsd;
  const pixelsY = targetHeightM / gsd;
  const visiblePixelsX = Math.min(pixelsX, widthPx);
  const visiblePixelsY = Math.min(pixelsY, heightPx);
  const angleForPixels = (pixels) => 2 * Math.atan(tangent * (pixels / axes[fovAxis])) * 180 / Math.PI;
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
