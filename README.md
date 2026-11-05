# MyTools · 目标像素计算器

根据视场角、图像分辨率、目标尺寸和距离，计算目标在图像中的几何投影尺寸。网页为中文纯静态应用，不依赖服务器计算、数据库或外部 CDN。

## 使用

- 选择水平、垂直或对角视场角，输入角度与图像宽高分辨率。
- 选择正方形或矩形目标，输入目标尺寸及到目标平面的距离。
- 查看目标像素宽高、几何投影面积、画面内可见面积占比、场景覆盖范围和示意图。
- 目标尺寸支持 m、cm、mm；距离支持 m、km。切换单位保持物理尺寸。

目标默认居中且平面平行于相机像面，距离沿光轴测量；采用普通透视镜头和方形像素。模型不适用于鱼眼镜头。结果仅表示几何采样，不能代替镜头成像质量、检测率或识别能力评估。小于 1 px 的数值保留小数；面积单位 px² 表示理想几何面积，不是实际整数感光像素计数。

## 本地运行与测试

需要 Python 3；运行自动化公式测试另需 Node.js 18 或更高版本。无需安装依赖。

```bash
python3 -m http.server 4173 --bind 127.0.0.1 --directory public
```

打开 `http://127.0.0.1:4173`。运行公式测试：

```bash
npm test
```

## Cloudflare Pages 部署

关联 GitHub 仓库 `desneo/mytools` 后使用以下设置：

| 设置 | 值 |
| --- | --- |
| Production branch | `main` |
| Framework preset | `None` |
| Build command | 留空 |
| Build output directory | `public` |
| Root directory | 留空，使用仓库根目录 |
| Environment variables | 无需设置 |

网页入口为 `public/index.html`。`public` 内的所有文件需要一起发布，以保留样式和 JavaScript 模块。使用 Cloudflare 分配的 `pages.dev` 域名即可访问；提交到 `main` 后由 Git 集成自动更新。

## 文件与计算模型

`public/geometry.js` 包含独立的计算函数；`public/app.js` 处理表单和结果；`tests` 包含公式验证。功能与数学定义见 [spec.md](spec.md)。
