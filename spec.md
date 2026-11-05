# 目标像素计算器规格

## 输入与约束

- 视场角：水平、垂直或对角，单位为度，有限数且严格介于 0 与 180 之间。
- 分辨率：水平 `Nx` 与垂直 `Ny`，均为正的安全整数；图像采用方形像素。
- 目标：正方形用一个边长，矩形输入宽 `Lx`、高 `Ly`；尺寸必须是正的有限数值。
- 距离 `D`：相机到目标平面的轴向垂直距离，必须是正的有限数值。
- 目标尺寸可选 m、cm、mm；距离可选 m、km；进入计算函数前统一为 m。单位切换保持物理尺寸。
- 默认水平视场角 60°、分辨率 1920×1080、正方形边长 1 m、距离 100 m。

## 几何模型

普通透视镜头（rectilinear），目标位于画面中心，目标平面平行于像面；不计畸变、光学模糊、遮挡或倾斜。

输入视场角为 `theta` 时，匹配方向的像素跨度 `Na` 分别为 `Nx`、`Ny` 或 `hypot(Nx, Ny)`。

```text
g = 2 * D * tan(theta / 2) / Na
sceneWidth = g * Nx
sceneHeight = g * Ny
HFOV = 2 * atan(tan(theta / 2) * Nx / Na)
VFOV = 2 * atan(tan(theta / 2) * Ny / Na)
DFOV = 2 * atan(tan(theta / 2) * hypot(Nx, Ny) / Na)
pixelsX = Lx / g
pixelsY = Ly / g
pixelArea = pixelsX * pixelsY
visiblePixelsX = min(pixelsX, Nx)
visiblePixelsY = min(pixelsY, Ny)
visiblePixelArea = visiblePixelsX * visiblePixelsY
visibleAreaPercent = (visiblePixelsX / Nx) * (visiblePixelsY / Ny) * 100
```

三角函数内部使用弧度。`g` 的单位为 m/px，横、纵相同。换算视场角显示为度。

## 页面行为与结果

- 修改参数即重新计算；支持常用分辨率预设和自定义分辨率。
- 显示完整目标的像素宽高、几何投影面积（px²）、横纵占比和画面内可见面积占比，以及 GSD、物理覆盖范围和三个方向的视场角。
- 完整投影尺寸可以超过图像分辨率；画面内可见面积占比不超过 100%。目标超出画面时提示裁切，并展示可见范围。
- 像素结果为连续几何量，保留小数，不进行整数采样计数；小于 1 px 时说明其含义。
- 示意图维持图像宽高比，居中绘制目标并在画面边界裁切；它是缩放示意，不逐个绘制传感器像素。
- 非法或超出数值可计算范围的输入显示中文错误，移除旧计算结果，不在页面显示 NaN 或 Infinity。
- 页面提供默认示例恢复、计算说明，适配桌面和手机；无需登录和网络 API。

## 发布与验收

- 静态文件从 `public` 发布；Cloudflare Pages 生产分支为 `main`，无构建命令、无环境变量。
- 自动化测试覆盖三类视场角一致性、对角视场换算、距离/分辨率缩放、矩形与正方形目标、视野裁切、小于一像素及非法输入。
- 浏览器验证默认值、单位转换、目标形状、分辨率预设、错误恢复、重置、窄屏和示意图布局。
