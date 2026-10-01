# 巴西乘用车市场交互气泡图

基于巴西乘用车数据制作的交互看板，可按年份、尺寸、价格、车身形式和动力形式筛选，并支持车型搜索高亮（保留其他车型低亮）及自定义参考五角星的新增、修改与删除。

支持高清 PNG 导出，保留当前筛选、缩放、高亮、参考五角星和占比统计，价格统一雷亚尔（BRL）。按区隔销量显示能源占比、新能源率（BEV + PHEV + REV/REEV）和车身形式占比；搜索高亮、缩放和参考五角星不影响占比。滚轮缩放幅度减半，三张占比卡片等高且比例条对齐。

## 在线访问

- [GitHub Pages](https://lovericky011218-boop.github.io/brazil-vehicle-bubble-site/)
- [Sites 版本](https://brazil-vehicle-market-map-2026.lovericky011218.chatgpt.site/)

## 本地运行

```bash
python3 -m http.server 4175 --directory dist
```

打开 <http://127.0.0.1:4175/>。

## 验证

```bash
node scripts/check-site.mjs
```

