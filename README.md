# 巴西乘用车市场交互气泡图

基于巴西乘用车数据制作的交互看板，可按年份、尺寸、价格、车身形式和动力形式筛选，并支持车型搜索聚焦及自定义参考五角星。

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

