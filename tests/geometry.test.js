import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProjection } from '../public/geometry.js';

const base = {
  fovDeg: 60, fovAxis: 'horizontal', widthPx: 1920, heightPx: 1080,
  targetWidthM: 1, targetHeightM: 1, distanceM: 100,
};
function close(actual, expected, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= Math.max(1, Math.abs(expected)) * tolerance,
    `实际 ${actual}，期望 ${expected}`);
}

test('60° 水平视场默认示例：线性像素和面积', () => {
  const r = calculateProjection(base);
  close(r.sceneWidthM, 115.47005383792515);
  close(r.sceneHeightM, 64.9519052838329);
  close(r.pixelsX, 16.627687752661224);
  close(r.pixelsY, r.pixelsX);
  close(r.pixelArea, 276.48);
  close(r.areaPercent, 0.013333333333333336);
  close(r.gsdXM, r.gsdYM);
  assert.equal(r.fitsInFrame, true);
});

test('90°、1000×500、10m 距离：正方形目标保持相同像素边长', () => {
  const r = calculateProjection({ ...base, fovDeg: 90, widthPx: 1000, heightPx: 500, distanceM: 10, targetWidthM: 2, targetHeightM: 2 });
  close(r.pixelsX, 100);
  close(r.pixelsY, 100);
  close(r.sceneWidthM, 20);
  close(r.sceneHeightM, 10);
  close(r.pixelArea, 10000);
  close(r.areaPercent, 2);
});

test('同一相机的横、纵、对角视场输入结果一致', () => {
  const original = calculateProjection(base);
  for (const [fovAxis, fovDeg] of [['vertical', original.vfovDeg], ['diagonal', original.dfovDeg]]) {
    const r = calculateProjection({ ...base, fovAxis, fovDeg });
    close(r.pixelsX, original.pixelsX);
    close(r.pixelsY, original.pixelsY);
    close(r.hfovDeg, original.hfovDeg);
    close(r.dfovDeg, original.dfovDeg);
  }
});

test('距离翻倍：边长像素减半，面积像素为四分之一', () => {
  const a = calculateProjection(base);
  const b = calculateProjection({ ...base, distanceM: 200 });
  close(b.pixelsX, a.pixelsX / 2);
  close(b.pixelArea, a.pixelArea / 4);
});

test('分辨率双倍：线性像素双倍、面积四倍、画面占比相同', () => {
  const a = calculateProjection(base);
  const b = calculateProjection({ ...base, widthPx: 3840, heightPx: 2160 });
  close(b.pixelsX, a.pixelsX * 2);
  close(b.pixelArea, a.pixelArea * 4);
  close(b.areaPercent, a.areaPercent);
});

test('对角 FOV90° 与 4:3 分辨率使用对角像素长度', () => {
  const r = calculateProjection({ ...base, fovDeg: 90, fovAxis: 'diagonal', widthPx: 400, heightPx: 300, distanceM: 10, targetWidthM: 2, targetHeightM: 1 });
  close(r.sceneWidthM, 16);
  close(r.sceneHeightM, 12);
  close(r.pixelsX, 50);
  close(r.pixelsY, 25);
});

test('目标超过视场：保留几何投影尺寸并返回裁切可见面积', () => {
  const r = calculateProjection({ ...base, fovDeg: 90, widthPx: 1000, heightPx: 500, distanceM: 10, targetWidthM: 40, targetHeightM: 2 });
  close(r.pixelsX, 2000);
  close(r.pixelsY, 100);
  close(r.visiblePixelsX, 1000);
  close(r.visiblePixelsY, 100);
  close(r.areaPercent, 40);
  close(r.visibleAreaPercent, 20);
  assert.equal(r.fitsInFrame, false);
});

test('目标正好填满视场：可见面积 100%，不报告溢出', () => {
  const frame = calculateProjection(base);
  const r = calculateProjection({ ...base, targetWidthM: frame.sceneWidthM, targetHeightM: frame.sceneHeightM });
  close(r.visibleAreaPercent, 100);
  assert.equal(r.fitsInFrame, true);
});

test('小于一像素的目标保留小数', () => {
  const r = calculateProjection({ ...base, targetWidthM: 0.001, targetHeightM: 0.001 });
  assert.ok(r.pixelsX > 0 && r.pixelsX < 1);
  close(r.pixelsX, 0.016627687752661225);
});

test('非法输入给出错误，防止 NaN、Infinity 和退化视场', () => {
  const cases = [
    { fovDeg: 0 }, { fovDeg: 180 }, { fovDeg: -1 }, { fovDeg: NaN },
    { widthPx: 0 }, { heightPx: 1.5 }, { widthPx: Infinity },
    { distanceM: 0 }, { targetWidthM: -1 }, { targetHeightM: NaN },
    { fovAxis: 'wrong' }, { fovAxis: '__proto__' }, { fovDeg: '60' },
    { distanceM: Number.MAX_VALUE }, { targetWidthM: Number.MAX_VALUE, targetHeightM: Number.MAX_VALUE },
  ];
  for (const patch of cases) assert.throws(() => calculateProjection({ ...base, ...patch }), Error);
});

test('双 FOV 匹配时与单水平 FOV 相同，保留方形像素', () => {
  const expected = calculateProjection(base);
  const r = calculateProjection({ ...base, fovAxis: 'both', hfovDeg: 60, vfovDeg: expected.vfovDeg });
  close(r.pixelsX, expected.pixelsX);
  close(r.pixelsY, expected.pixelsY);
  close(r.gsdXM, r.gsdYM);
});

test('双 FOV 不匹配会阻止计算并提供两个方向的修正值', () => {
  let mismatch;
  try { calculateProjection({ ...base, fovAxis: 'both', hfovDeg: 90, vfovDeg: 90 }); }
  catch (error) { mismatch = error; }
  assert.equal(mismatch?.code, 'FOV_MISMATCH');
  close(mismatch.correctedVFOVDeg, 58.71550708558255);
  close(mismatch.correctedHFOVDeg, 121.28449291441746);
  const horizontal = calculateProjection({ ...base, fovAxis: 'both', hfovDeg: 90, vfovDeg: mismatch.correctedVFOVDeg });
  const vertical = calculateProjection({ ...base, fovAxis: 'both', hfovDeg: mismatch.correctedHFOVDeg, vfovDeg: 90 });
  close(horizontal.gsdXM, horizontal.gsdYM);
  close(vertical.gsdXM, vertical.gsdYM);
});

test('双 FOV 容忍角度舍入但拒绝明显误差', () => {
  const r = calculateProjection({ ...base, fovAxis: 'both', hfovDeg: 60, vfovDeg: 35.98 });
  close(r.hfovDeg, 60);
  close(r.gsdXM, r.gsdYM);
  assert.throws(() => calculateProjection({ ...base, fovAxis: 'both', hfovDeg: 60, vfovDeg: 40 }), { code: 'FOV_MISMATCH' });
  assert.throws(() => calculateProjection({ ...base, fovAxis: 'both', hfovDeg: 60, vfovDeg: 180 }), Error);
});
