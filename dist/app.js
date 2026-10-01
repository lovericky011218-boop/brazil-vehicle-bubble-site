(() => {
  const sourceRows = Array.isArray(window.VEHICLE_DATA) ? window.VEHICLE_DATA : [];
  const referenceStorageKey = "brazil-market-reference-stars-v1";
  const defaultReferences = Array.isArray(window.REFERENCE_DATA) ? window.REFERENCE_DATA : [];
  const references = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem(referenceStorageKey));
      if (Array.isArray(saved)) return saved.filter((row) => row?.id && row?.model && Number.isFinite(row.length) && Number.isFinite(row.price)).map((row) => ({ ...row, body: row.body || "SUV", reference: true }));
    } catch (_) {}
    return defaultReferences.map((row) => ({ ...row }));
  })();
  const meta = window.DATA_META || {};
  const svg = document.querySelector("#bubbleChart");
  const chartWrap = document.querySelector("#chartWrap");
  const tooltip = document.querySelector("#tooltip");
  const emptyState = document.querySelector("#emptyState");
  const NS = "http://www.w3.org/2000/svg";

  const palette = {
    ICE: { fill: "#f1f3f4", stroke: "#4d565b", text: "#374047" },
    HEV: { fill: "#f5d7ee", stroke: "#b64b9e", text: "#963a82" },
    MEV: { fill: "#eadcf6", stroke: "#9460b2", text: "#74468e" },
    REEV: { fill: "#fff0d1", stroke: "#f29b16", text: "#b96e00" },
    BEV: { fill: "#d9f7dd", stroke: "#36c56a", text: "#248b49" },
    PHEV: { fill: "#d7f1f9", stroke: "#28a6cf", text: "#087da8" },
  };
  const bodyOrder = ["SUV", "Car", "MPV"];
  const fuelOrder = ["ICE", "HEV", "MEV", "REEV", "BEV", "PHEV"];
  const bodies = bodyOrder.filter((value) => sourceRows.some((row) => row.body === value));
  const fuels = fuelOrder.filter((value) => sourceRows.some((row) => row.fuel === value));
  const fmtInt = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });
  const fmtShare = new Intl.NumberFormat("zh-CN", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const shareLabel = (share) => share == null ? "—" : fmtShare.format(share);
  const fmtBrl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  const allLengths = sourceRows.map((row) => row.length).filter(Number.isFinite);
  const allPrices = sourceRows.map((row) => row.price).filter(Number.isFinite);
  const allSales = sourceRows.map((row) => row.sales).filter(Number.isFinite);
  const limits = {
    length: [Math.floor(Math.min(...allLengths) / 100) * 100, Math.ceil(Math.max(...allLengths) / 100) * 100],
    price: [Math.floor(Math.min(...allPrices) / 1000) * 1000, Math.ceil(Math.max(...allPrices) / 1000) * 1000],
    sales: [0, Math.ceil(Math.max(...allSales) / 1000) * 1000],
  };
  const defaults = { length: [4400, 4800], price: [50000, 700000], sales: [...limits.sales] };
  const state = {
    year: 2026,
    bodies: new Set(bodies),
    fuels: new Set(fuels),
    query: "",
    rankingFuel: "ALL",
    labelMode: "top",
    selectedId: null,
    hoveredId: null,
    ranges: { length: [...defaults.length], price: [...defaults.price], sales: [...defaults.sales] },
    viewX: [...defaults.length],
    viewY: [...defaults.price],
  };

  const controls = Object.fromEntries([
    "yearSelect", "sizeBand", "priceBand", "searchInput", "labelMode", "rankingFuel",
    "lengthMin", "lengthMax", "priceMin", "priceMax", "salesMin", "salesMax",
    "starSelect", "starModel", "starBody", "starLength", "starPrice", "deleteStar",
  ].map((id) => [id, document.querySelector(`#${id}`)]));

  function setReferenceFeedback(text) { document.querySelector("#starFeedback").textContent = text; }

  function syncReferenceEditor(row = references[0]) {
    const add = document.createElement("option"); add.value = ""; add.textContent = "新增五角星";
    controls.starSelect.replaceChildren(add, ...references.map((item) => { const option = document.createElement("option"); option.value = item.id; option.textContent = item.model; return option; }));
    controls.starSelect.value = row?.id || "";
    controls.starModel.value = row?.model || "";
    controls.starBody.value = row?.body || "SUV";
    controls.starLength.value = row?.length || "";
    controls.starPrice.value = row?.price || "";
    controls.deleteStar.disabled = !row;
  }

  function beginNewReference() {
    syncReferenceEditor(null);
    setReferenceFeedback("填写后保存，即可新增五角星");
    controls.starModel.focus();
  }

  function saveReference(event) {
    event.preventDefault();
    const model = controls.starModel.value.trim();
    const length = Number(controls.starLength.value);
    const price = Number(controls.starPrice.value);
    if (!model || !Number.isFinite(length) || length <= 0 || !Number.isFinite(price) || price <= 0) { setReferenceFeedback("请填写有效的名称、车长和价格"); return; }
    const selectedId = controls.starSelect.value;
    const row = { id: selectedId || `reference-custom-${Date.now()}`, model, body: controls.starBody.value, length, price, reference: true };
    const index = references.findIndex((item) => item.id === selectedId);
    if (index >= 0) references[index] = row; else references.push(row);
    try { localStorage.setItem(referenceStorageKey, JSON.stringify(references)); } catch (_) {}
    state.selectedId = row.id;
    syncReferenceEditor(row);
    setReferenceFeedback("已保存到当前浏览器");
    render();
  }

  function deleteReference() {
    const selectedId = controls.starSelect.value;
    const index = references.findIndex((item) => item.id === selectedId);
    if (index < 0) return;
    const deleted = references[index];
    if (!window.confirm(`确定删除五角星“${deleted.model}”吗？`)) return;
    references.splice(index, 1);
    try { localStorage.setItem(referenceStorageKey, JSON.stringify(references)); } catch (_) {}
    const next = references[Math.min(index, references.length - 1)] || null;
    state.selectedId = next?.id || null;
    syncReferenceEditor(next);
    updateDetail(next);
    setReferenceFeedback(`已删除“${deleted.model}”`);
    render();
  }

  function svgEl(name, attrs = {}, text = "") {
    const node = document.createElementNS(NS, name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    if (text) node.textContent = text;
    return node;
  }

  function median(values) {
    const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function matchesQuery(row) {
    if (!state.query) return true;
    return `${row.brand || ""} ${row.model} ${row.localModels?.join(" ") || ""} ${row.body || ""} ${row.fuel || ""}`.toLocaleLowerCase().includes(state.query);
  }

  function filteredBase({ ignoreChartFuel = false, ignoreQuery = false } = {}) {
    return sourceRows.filter((row) => {
      if (row.year !== state.year || !state.bodies.has(row.body) || (!ignoreQuery && !matchesQuery(row))) return false;
      if (!ignoreChartFuel && !state.fuels.has(row.fuel)) return false;
      return Number.isFinite(row.length) && Number.isFinite(row.price)
        && row.length >= state.ranges.length[0] && row.length <= state.ranges.length[1]
        && row.price >= state.ranges.price[0] && row.price <= state.ranges.price[1]
        && row.sales >= state.ranges.sales[0] && row.sales <= state.ranges.sales[1];
    });
  }

  function mergeRows(rows) {
    const groups = new Map();
    rows.forEach((row) => {
      const key = `${row.year}\u0000${row.model}\u0000${row.fuel}`;
      if (!groups.has(key)) groups.set(key, {
        id: `bubble-${row.year}-${row.model}-${row.fuel}`,
        year: row.year,
        model: row.model,
        fuel: row.fuel,
        sales: 0,
        lengths: [],
        prices: [],
        bodies: new Set(),
        bodySales: new Map(),
        brands: new Set(),
        sourceRows: 0,
      });
      const group = groups.get(key);
      group.sales += row.sales;
      group.lengths.push(row.length);
      group.prices.push(row.price, row.priceMin, row.priceMax);
      group.bodies.add(row.body);
      group.bodySales.set(row.body, (group.bodySales.get(row.body) || 0) + row.sales);
      if (row.brand) group.brands.add(row.brand);
      group.sourceRows += row.sourceRows || 1;
    });
    return [...groups.values()].map((group) => ({
      ...group,
      length: Math.round(median(group.lengths)),
      price: Math.round(median(group.prices)),
      priceMin: Math.min(...group.prices.filter(Number.isFinite)),
      priceMax: Math.max(...group.prices.filter(Number.isFinite)),
      body: [...group.bodies].join(" / "),
      brand: [...group.brands].join(" / "),
    }));
  }

  function currentRows() { return mergeRows(filteredBase({ ignoreQuery: true })); }
  function currentMatchedRows() { return mergeRows(filteredBase()); }

  function segmentComposition(rows, fuelValues, bodyValues) {
    const fuelSales = new Map(), bodySales = new Map();
    let total = 0, newEnergySales = 0;
    for (const row of rows) {
      total += row.sales;
      fuelSales.set(row.fuel, (fuelSales.get(row.fuel) || 0) + row.sales);
      if (["BEV", "PHEV", "REEV", "REV"].includes(row.fuel)) newEnergySales += row.sales;
      for (const [body, sales] of row.bodySales) bodySales.set(body, (bodySales.get(body) || 0) + sales);
    }
    const entries = (values, salesMap) => values.map((name) => ({ name, sales: salesMap.get(name) || 0, share: total ? (salesMap.get(name) || 0) / total : null }));
    return { total, newEnergySales, newEnergyShare: total ? newEnergySales / total : null, fuels: entries(fuelValues, fuelSales), bodies: entries(bodyValues, bodySales) };
  }

  function updateComposition(rows) {
    const composition = segmentComposition(rows, fuels.filter((fuel) => state.fuels.has(fuel)), bodies.filter((body) => state.bodies.has(body)));
    for (const [id, entries] of [["fuelShares", composition.fuels], ["bodyShares", composition.bodies]]) {
      const list = document.querySelector(`#${id}`); list.replaceChildren();
      const bar = document.querySelector(id === "fuelShares" ? "#fuelShareBar" : "#bodyShareBar"); bar.replaceChildren();
      for (const entry of entries) {
        const item = document.createElement("li"), name = document.createElement("span"), value = document.createElement("strong");
        name.textContent = entry.name; value.textContent = shareLabel(entry.share);
        item.title = `${entry.name}：${fmtInt.format(entry.sales)} 辆 / 区隔 ${fmtInt.format(composition.total)} 辆`;
        const color = id === "fuelShares" ? palette[entry.name].stroke : { SUV: "#078d86", Car: "#788ca0", MPV: "#c6a364" }[entry.name];
        item.style.setProperty("--share-color", color);
        if (!entry.sales) item.className = "zero-share";
        const segment = document.createElement("span"); segment.style.width = `${(entry.share || 0) * 100}%`; segment.style.setProperty("--share-color", color); bar.append(segment);
        item.append(name, value); list.append(item);
      }
      if (!entries.length) list.append(Object.assign(document.createElement("li"), { textContent: "未选择" }));
    }
    document.querySelector("#newEnergyRate").textContent = shareLabel(composition.newEnergyShare);
    document.querySelector("#newEnergySales").textContent = `${fmtInt.format(composition.newEnergySales)} / ${fmtInt.format(composition.total)} 辆`;
    document.querySelector("#newEnergyBar").style.width = `${(composition.newEnergyShare || 0) * 100}%`;
  }

  function syncRangeInputs() {
    controls.lengthMin.value = Math.round(state.ranges.length[0]);
    controls.lengthMax.value = Math.round(state.ranges.length[1]);
    controls.priceMin.value = Math.round(state.ranges.price[0]);
    controls.priceMax.value = Math.round(state.ranges.price[1]);
    controls.salesMin.value = Math.round(state.ranges.sales[0]);
    controls.salesMax.value = Math.round(state.ranges.sales[1]);
  }

  function setViewToRanges() {
    state.viewX = [...state.ranges.length];
    state.viewY = [...state.ranges.price];
  }

  function renderChips() {
    const makeChip = (container, value, activeSet, colors, extraClass = "") => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `chip ${extraClass} ${activeSet.has(value) ? "active" : ""}`.trim();
      button.textContent = value;
      button.setAttribute("aria-pressed", activeSet.has(value));
      if (colors) {
        button.style.setProperty("--chip-fill", colors.fill);
        button.style.setProperty("--chip-stroke", colors.stroke);
      }
      button.addEventListener("click", () => {
        if (activeSet.has(value)) activeSet.delete(value); else activeSet.add(value);
        state.selectedId = null;
        renderChips();
        render();
      });
      container.append(button);
    };
    const bodyContainer = document.querySelector("#bodyFilter");
    bodyContainer.replaceChildren();
    bodies.forEach((body) => makeChip(bodyContainer, body, state.bodies));
    const fuelContainer = document.querySelector("#fuelFilter");
    fuelContainer.replaceChildren();
    fuels.forEach((fuel) => makeChip(fuelContainer, fuel, state.fuels, palette[fuel], "fuel-chip"));
  }

  function populateRankingFuel() {
    fuels.forEach((fuel) => {
      const option = document.createElement("option");
      option.value = fuel;
      option.textContent = fuel;
      controls.rankingFuel.append(option);
    });
  }

  function niceTicks([min, max], count) {
    const raw = Math.max((max - min) / count, Number.EPSILON);
    const power = 10 ** Math.floor(Math.log10(raw));
    const error = raw / power;
    const factor = error >= 7.5 ? 10 : error >= 3.5 ? 5 : error >= 1.5 ? 2 : 1;
    const step = factor * power;
    const start = Math.ceil(min / step) * step;
    const ticks = [];
    for (let value = start; value <= max + step * .25; value += step) ticks.push(value);
    return ticks;
  }

  function clampDomain(domain, absolute, minSpan) {
    let [a, b] = domain;
    if (b - a < minSpan) { const middle = (a + b) / 2; a = middle - minSpan / 2; b = middle + minSpan / 2; }
    if (a < absolute[0]) { b += absolute[0] - a; a = absolute[0]; }
    if (b > absolute[1]) { a -= b - absolute[1]; b = absolute[1]; }
    return [Math.max(a, absolute[0]), Math.min(b, absolute[1])];
  }

  function priceText(row) {
    const value = row.price;
    const min = row.priceMin;
    const max = row.priceMax;
    if (!Number.isFinite(value)) return "—";
    return Number.isFinite(min) && Number.isFinite(max) && min !== max
      ? `${fmtBrl.format(value)} (${fmtBrl.format(min)}–${fmtBrl.format(max)})`
      : fmtBrl.format(value);
  }

  function setTooltip(row, event) {
    if (!row) { tooltip.classList.remove("visible"); return; }
    tooltip.replaceChildren();
    const title = document.createElement("strong");
    title.textContent = row.model;
    const text = document.createElement("span");
    text.textContent = row.reference
      ? `参考车型 · ${row.body || "—"}\n${fmtInt.format(row.length)} mm · ${fmtBrl.format(row.price)}\n红色五角星`
      : `${row.fuel} · ${row.body}\n${fmtInt.format(row.length)} mm · ${fmtBrl.format(row.price)}\n销量 ${fmtInt.format(row.sales)}`;
    tooltip.append(title, text);
    const rect = chartWrap.getBoundingClientRect();
    tooltip.style.left = `${Math.max(5, Math.min(event.clientX - rect.left, rect.width - 255))}px`;
    tooltip.style.top = `${Math.max(65, Math.min(event.clientY - rect.top, rect.height - 70))}px`;
    tooltip.classList.add("visible");
  }

  function updateDetail(row, rows = currentRows()) {
    const set = (id, value) => { document.querySelector(id).textContent = value; };
    if (!row) {
      set("#detailModel", "选择一个标记"); set("#detailFuel", "点击气泡或五角星后可固定查看");
      ["#detailBody", "#detailLength", "#detailPrice", "#detailSales", "#detailRank"].forEach((id) => set(id, "—"));
      return;
    }
    const ranked = rows.slice().sort((a, b) => b.sales - a.sales);
    const rank = ranked.findIndex((item) => item.id === row.id) + 1;
    set("#detailModel", row.model); set("#detailFuel", row.reference ? "自定义参考车型" : `${row.brand || ""} · ${row.fuel}`);
    set("#detailBody", row.reference ? row.body || "—" : row.body); set("#detailLength", `${fmtInt.format(row.length)} mm`);
    set("#detailPrice", row.reference ? fmtBrl.format(row.price) : priceText(row));
    set("#detailSales", row.reference ? "—" : fmtInt.format(row.sales)); set("#detailRank", row.reference ? "参考车型" : rank > 0 ? `#${rank}` : "筛选范围外");
  }

  function updateSummary(rows) {
    const sales = rows.reduce((sum, row) => sum + row.sales, 0);
    const med = median(rows.map((row) => row.price));
    const leader = rows.slice().sort((a, b) => b.sales - a.sales)[0];
    document.querySelector("#statCount").textContent = fmtInt.format(rows.length);
    document.querySelector("#statSales").textContent = fmtInt.format(sales);
    document.querySelector("#statMedian").textContent = med == null ? "—" : fmtBrl.format(med);
    document.querySelector("#statLeader").textContent = leader ? leader.model : "—";
  }

  function updateRanking() {
    const list = document.querySelector("#rankingList");
    list.replaceChildren();
    const rows = mergeRows(filteredBase({ ignoreChartFuel: true }))
      .filter((row) => state.rankingFuel === "ALL" || row.fuel === state.rankingFuel)
      .sort((a, b) => b.sales - a.sales).slice(0, 5);
    rows.forEach((row) => {
      const item = document.createElement("li");
      const button = document.createElement("button"); button.type = "button";
      const name = document.createElement("span"); name.className = "ranking-name"; name.textContent = `${row.model} · ${row.fuel}`;
      const value = document.createElement("span"); value.className = "ranking-value"; value.textContent = fmtInt.format(row.sales);
      button.append(name, value); button.addEventListener("click", () => { state.selectedId = row.id; updateDetail(row, currentRows()); render(); });
      item.append(button); list.append(item);
    });
    if (!rows.length) { const item = document.createElement("li"); item.className = "ranking-empty"; item.textContent = "当前条件下没有车型"; list.append(item); }
  }

  function starPath(cx, cy, outer = 15, inner = 6.4) {
    const points = [];
    for (let index = 0; index < 10; index += 1) { const angle = -Math.PI / 2 + index * Math.PI / 5; const radius = index % 2 ? inner : outer; points.push(`${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`); }
    return `M${points.join(" L")} Z`;
  }

  function render() {
    const rows = currentRows();
    const matchedRows = state.query ? currentMatchedRows() : rows;
    const matchedIds = new Set(matchedRows.map((row) => row.id));
    updateSummary(matchedRows); updateRanking(); updateComposition(rows);
    const selected = [...rows, ...references].find((row) => row.id === state.selectedId);
    updateDetail(selected || null, rows);
    const rect = svg.getBoundingClientRect();
    const width = Math.max(320, rect.width); const height = Math.max(380, rect.height);
    const margin = { top: 28, right: 30, bottom: 54, left: width < 620 ? 64 : 90 };
    const plotW = Math.max(120, width - margin.left - margin.right); const plotH = Math.max(120, height - margin.top - margin.bottom);
    const x = (value) => margin.left + (value - state.viewX[0]) / (state.viewX[1] - state.viewX[0]) * plotW;
    const y = (value) => margin.top + (state.viewY[1] - value) / (state.viewY[1] - state.viewY[0]) * plotH;
    const maxSales = Math.max(...rows.map((row) => row.sales), 1);
    const radius = (value) => 4 + Math.sqrt(value / maxSales) * Math.min(35, plotW / 20);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`); svg.replaceChildren();
    const defs = svgEl("defs"); const clip = svgEl("clipPath", { id: "plotClip" }); clip.append(svgEl("rect", { x: margin.left, y: margin.top, width: plotW, height: plotH })); defs.append(clip); svg.append(defs);
    svg.append(svgEl("rect", { x: margin.left, y: margin.top, width: plotW, height: plotH, fill: "#fff", stroke: "#cfd6da" }));
    const grid = svgEl("g", { "aria-hidden": "true" });
    niceTicks(state.viewY, 7).forEach((tick) => { const py = y(tick); grid.append(svgEl("line", { x1: margin.left, y1: py, x2: margin.left + plotW, y2: py, stroke: "#e6eaec" })); grid.append(svgEl("text", { x: margin.left - 11, y: py + 4, "text-anchor": "end", fill: "#6f7a81", "font-size": width < 620 ? 10 : 12 }, fmtBrl.format(tick))); });
    niceTicks(state.viewX, 9).forEach((tick) => { const px = x(tick); grid.append(svgEl("line", { x1: px, y1: margin.top, x2: px, y2: margin.top + plotH, stroke: "#edf0f1" })); grid.append(svgEl("text", { x: px, y: margin.top + plotH + 24, "text-anchor": "middle", fill: "#6f7a81", "font-size": width < 620 ? 10 : 12 }, fmtInt.format(tick))); });
    svg.append(grid);
    if (4600 >= state.viewX[0] && 4600 <= state.viewX[1]) { const px = x(4600); svg.append(svgEl("line", { x1: px, y1: margin.top, x2: px, y2: margin.top + plotH, stroke: "#7f878c", "stroke-width": 1.5, "stroke-dasharray": "7 6" })); svg.append(svgEl("text", { x: px + 6, y: margin.top + 16, fill: "#7f878c", "font-size": 11, "font-weight": 700 }, "4600 mm")); }
    svg.append(svgEl("text", { x: margin.left, y: 17, fill: "#6f7a81", "font-size": 11, "font-weight": 700 }, "巴西 MSRP（BRL）"));
    svg.append(svgEl("text", { x: margin.left + plotW, y: height - 12, "text-anchor": "end", fill: "#6f7a81", "font-size": 11, "font-weight": 700 }, "车长（mm）"));
    const plot = svgEl("g", { "clip-path": "url(#plotClip)" });
    const ordered = rows.slice().sort((a, b) => {
      if (state.query) {
        const focusOrder = Number(matchedIds.has(a.id)) - Number(matchedIds.has(b.id));
        if (focusOrder) return focusOrder;
      }
      return b.sales - a.sales;
    });
    const topIds = new Set(ordered.slice(0, 25).map((row) => row.id)); const placed = [];
    ordered.forEach((row) => {
      const px = x(row.length); const py = y(row.price); const r = radius(row.sales);
      if (px + r < margin.left || px - r > margin.left + plotW || py + r < margin.top || py - r > margin.top + plotH) return;
      const colors = palette[row.fuel] || palette.ICE; const active = row.id === state.selectedId || row.id === state.hoveredId;
      const dimmed = Boolean(state.query) && !matchedIds.has(row.id);
      const circle = svgEl("circle", { cx: px, cy: py, r, fill: colors.fill, "fill-opacity": active ? .9 : dimmed ? .12 : .72, stroke: colors.stroke, "stroke-opacity": dimmed ? .22 : 1, "stroke-width": active ? 3 : dimmed ? 1.1 : 1.6, tabindex: 0, role: "button", "aria-label": `${row.model}，${row.fuel}，${row.body}，车长${row.length}毫米，巴西建议价${row.price}雷亚尔，销量${row.sales}` });
      circle.style.cursor = "pointer";
      circle.addEventListener("pointerenter", (event) => { state.hoveredId = row.id; circle.setAttribute("stroke-width", "3"); circle.setAttribute("fill-opacity", ".88"); setTooltip(row, event); });
      circle.addEventListener("pointermove", (event) => setTooltip(row, event));
      circle.addEventListener("pointerleave", () => { state.hoveredId = null; circle.setAttribute("stroke-width", row.id === state.selectedId ? "3" : dimmed ? "1.1" : "1.6"); circle.setAttribute("fill-opacity", row.id === state.selectedId ? ".9" : dimmed ? ".12" : ".72"); setTooltip(null); });
      circle.addEventListener("click", (event) => { event.stopPropagation(); state.selectedId = row.id; updateDetail(row, rows); render(); });
      circle.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); state.selectedId = row.id; render(); } });
      plot.append(circle);
      const show = active || (state.query ? matchedIds.has(row.id) : state.labelMode === "all" || (state.labelMode === "top" && topIds.has(row.id)));
      if (show) {
        const labelY = py - Math.min(r + 5, 31); const labelW = Math.min(170, Math.max(44, row.model.length * 6.4));
        const box = { left: px - labelW / 2 - 2, right: px + labelW / 2 + 2, top: labelY - 12, bottom: labelY + 4 };
        const collide = placed.some((other) => !(box.right < other.left || box.left > other.right || box.bottom < other.top || box.top > other.bottom));
        if (!collide || active || state.labelMode === "all") { placed.push(box); plot.append(svgEl("text", { x: px, y: labelY, "text-anchor": "middle", fill: colors.text, "font-size": active ? 13 : 11, "font-weight": active ? 850 : 740, style: "paint-order:stroke;stroke:#fff;stroke-width:3px;stroke-linejoin:round" }, row.model)); }
      }
    });
    references.forEach((row) => {
      if (row.length < state.ranges.length[0] || row.length > state.ranges.length[1] || row.price < state.ranges.price[0] || row.price > state.ranges.price[1]) return;
      const px = x(row.length); const py = y(row.price); if (px < margin.left || px > margin.left + plotW || py < margin.top || py > margin.top + plotH) return;
      const star = svgEl("path", { d: starPath(px, py), fill: "#ef3c2f", stroke: "#a32018", "stroke-width": row.id === state.selectedId ? 3 : 1.8, tabindex: 0, role: "button", "aria-label": `${row.model}参考位置，${row.body || "未设置车身形式"}，车长${row.length}毫米，价格${row.price}雷亚尔` });
      star.style.cursor = "pointer"; star.addEventListener("pointerenter", (event) => setTooltip(row, event)); star.addEventListener("pointermove", (event) => setTooltip(row, event)); star.addEventListener("pointerleave", () => setTooltip(null)); star.addEventListener("click", (event) => { event.stopPropagation(); state.selectedId = row.id; syncReferenceEditor(row); updateDetail(row, rows); render(); });
      plot.append(star); plot.append(svgEl("text", { x: px + 16, y: py - 10, fill: "#a32018", "font-size": 12, "font-weight": 850, style: "paint-order:stroke;stroke:#fff;stroke-width:3px" }, row.model));
    });
    svg.append(plot); emptyState.hidden = rows.length > 0;
  }

  function wrapExportText(ctx, text, maxWidth) {
    const lines = []; let line = "";
    for (const char of text) {
      if (line && ctx.measureText(line + char).width > maxWidth) { lines.push(line); line = ""; }
      line += char;
    }
    if (line) lines.push(line);
    return lines;
  }

  async function exportChartPng() {
    const button = document.querySelector("#exportPng"), feedback = document.querySelector("#exportFeedback");
    button.disabled = true; button.textContent = "导出中…";
    let imageUrl, downloadUrl;
    try {
      // Native SVG + canvas keeps the current view without a screenshot dependency.
      const chart = svg.cloneNode(true), viewBox = svg.viewBox.baseVal;
      const width = Math.max(1200, Math.ceil(viewBox.width) + 48), chartWidth = width - 48;
      const chartHeight = Math.round(chartWidth * viewBox.height / viewBox.width);
      const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("当前浏览器不支持图片导出");
      const fontFamily = getComputedStyle(document.body).fontFamily;
      ctx.font = `16px ${fontFamily}`;
      const composition = segmentComposition(currentRows(), fuels.filter((fuel) => state.fuels.has(fuel)), bodies.filter((body) => state.bodies.has(body)));
      const sharesText = (entries) => entries.map((entry) => `${entry.name} ${shareLabel(entry.share)}`).join(" / ") || "未选择";
      const notes = [
        `国家：巴西　年份：${state.year === 2026 ? "2026年1–7月" : `${state.year}全年`}`,
        `车身：${[...state.bodies].join(" / ") || "未选择"}　动力：${[...state.fuels].join(" / ") || "未选择"}`,
        `筛选：车长 ${state.ranges.length.map(fmtInt.format).join("–")} mm　价格 ${state.ranges.price.map(fmtBrl.format).join("–")}　销量 ${state.ranges.sales.map(fmtInt.format).join("–")}`,
        `当前视图：车长 ${state.viewX.map(fmtInt.format).join("–")} mm　价格 ${state.viewY.map(fmtBrl.format).join("–")}${state.query ? `　搜索高亮：${state.query}（其他车型保留低亮）` : ""}`,
        `区隔能源销量占比：${sharesText(composition.fuels)}　新能源率 ${shareLabel(composition.newEnergyShare)}（BEV + PHEV + REV / REEV）`,
        `区隔车身销量占比：${sharesText(composition.bodies)}　统计销量 ${fmtInt.format(composition.total)} 辆（按筛选范围，搜索/缩放不改变占比；不含参考星及无法绘图记录）`,
      ].flatMap((text) => wrapExportText(ctx, text, chartWidth));
      const rows = state.query ? currentMatchedRows() : currentRows();
      const summary = `${state.query ? "匹配" : "筛选"}车型 ${fmtInt.format(rows.length)} 款　合计销量 ${fmtInt.format(rows.reduce((sum, row) => sum + row.sales, 0))} 辆　气泡面积代表销量`;
      const footer = wrapExportText(ctx, document.querySelector("#sourceNote").textContent, chartWidth);
      const chartTop = 112 + notes.length * 24, footerTop = chartTop + chartHeight + 28;
      const height = footerTop + footer.length * 24 + 26;
      canvas.width = width * 2; canvas.height = height * 2;
      ctx.scale(2, 2); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, width, height);
      ctx.textBaseline = "top"; ctx.fillStyle = "#18262f"; ctx.font = `bold 28px ${fontFamily}`;
      ctx.fillText("巴西乘用车市场图谱", 24, 24);
      ctx.fillStyle = "#6f7b83"; ctx.font = `16px ${fontFamily}`;
      notes.forEach((line, index) => ctx.fillText(line, 24, 65 + index * 24));
      ctx.fillStyle = "#18262f"; ctx.font = `bold 17px ${fontFamily}`;
      ctx.fillText(summary, 24, 74 + notes.length * 24);
      chart.setAttribute("xmlns", NS); chart.setAttribute("width", chartWidth); chart.setAttribute("height", chartHeight);
      chart.style.fontFamily = fontFamily;
      imageUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(chart)], { type: "image/svg+xml;charset=utf-8" }));
      const image = new Image(); image.src = imageUrl; await image.decode();
      ctx.drawImage(image, 24, chartTop, chartWidth, chartHeight);
      ctx.font = `16px ${fontFamily}`; let legendX = 24;
      for (const fuel of fuels.filter((fuel) => state.fuels.has(fuel))) {
        const colors = palette[fuel]; ctx.beginPath(); ctx.arc(legendX + 7, footerTop - 9, 7, 0, Math.PI * 2);
        ctx.fillStyle = colors.fill; ctx.fill(); ctx.strokeStyle = colors.stroke; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = "#18262f"; ctx.fillText(fuel, legendX + 21, footerTop - 17); legendX += ctx.measureText(fuel).width + 52;
      }
      ctx.fillStyle = "#a32018"; ctx.fillText("★ 自定义参考车型", legendX + 12, footerTop - 17);
      ctx.fillStyle = "#6f7b83";
      footer.forEach((line, index) => ctx.fillText(line, 24, footerTop + 16 + index * 24));
      if (!rows.length) { ctx.fillStyle = "#6f7b83"; ctx.fillText(state.query ? "没有匹配搜索的车型（背景车型仍保留）" : "当前筛选条件下没有可绘制的车型", width / 2 - 145, chartTop + chartHeight / 2); }
      const png = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!png) throw new Error("图片生成失败，请重试");
      downloadUrl = URL.createObjectURL(png);
      const link = document.createElement("a"); link.href = downloadUrl;
      link.download = `巴西气泡图_${state.year}.png`;
      document.body.append(link); link.click(); link.remove();
      const previous = feedback.querySelector("a");
      if (previous) URL.revokeObjectURL(previous.href);
      feedback.textContent = "高清 PNG 已生成 · ";
      const preview = document.createElement("a"); preview.href = downloadUrl; preview.target = "_blank"; preview.rel = "noopener"; preview.textContent = "查看导出图片";
      feedback.append(preview);
      downloadUrl = null; // Keep the preview available until the next export or page close.
    } catch (error) { feedback.textContent = `导出失败：${error.message || "请重试"}`; }
    finally {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      button.disabled = false; button.textContent = "导出图片";
    }
  }

  document.querySelector("#exportPng").addEventListener("click", exportChartPng);

  function applySizeBand(value) {
    const bands = { ALL: limits.length, LT4000: [limits.length[0], 3999], "4000_4400": [4000, 4399], "4400_4600": [4400, 4599], "4600_4800": [4600, 4799], "4400_4800": [4400, 4800], "4800_5000": [4800, 4999], GE5000: [5000, limits.length[1]] };
    if (bands[value]) { state.ranges.length = [...bands[value]]; setViewToRanges(); syncRangeInputs(); render(); }
  }

  function applyPriceBand(value) {
    const bands = { ALL: limits.price, "50000_700000": [50000, 700000], "0_100000": [limits.price[0], 99999], "100000_150000": [100000, 149999], "150000_250000": [150000, 249999], "250000_400000": [250000, 399999], "400000_700000": [400000, 699999], "700000_INF": [700000, limits.price[1]] };
    if (bands[value]) { state.ranges.price = [...bands[value]]; setViewToRanges(); syncRangeInputs(); render(); }
  }

  function readRanges() {
    const pair = (a, b, fallback) => { const low = Number(controls[a].value); const high = Number(controls[b].value); return Number.isFinite(low) && Number.isFinite(high) && low <= high ? [low, high] : fallback; };
    state.ranges.length = pair("lengthMin", "lengthMax", state.ranges.length);
    state.ranges.price = pair("priceMin", "priceMax", state.ranges.price);
    state.ranges.sales = pair("salesMin", "salesMax", state.ranges.sales);
    controls.sizeBand.value = "CUSTOM"; controls.priceBand.value = "CUSTOM"; setViewToRanges(); render();
  }

  function resetAll() {
    state.year = 2026; state.bodies = new Set(bodies); state.fuels = new Set(fuels); state.query = ""; state.rankingFuel = "ALL"; state.labelMode = "top"; state.selectedId = null;
    state.ranges = { length: [...defaults.length], price: [...defaults.price], sales: [...defaults.sales] }; setViewToRanges();
    controls.yearSelect.value = "2026"; controls.sizeBand.value = "4400_4800"; controls.priceBand.value = "50000_700000"; controls.searchInput.value = ""; controls.rankingFuel.value = "ALL"; controls.labelMode.value = "top";
    syncRangeInputs(); renderChips(); render();
  }

  function zoom(factor, centerX = .5, centerY = .5) {
    const zoomDomain = (domain, center, absolute, minSpan) => { const anchor = domain[0] + (domain[1] - domain[0]) * center; return clampDomain([anchor - (anchor - domain[0]) * factor, anchor + (domain[1] - anchor) * factor], absolute, minSpan); };
    state.viewX = zoomDomain(state.viewX, centerX, limits.length, 80); state.viewY = zoomDomain(state.viewY, centerY, limits.price, 50000); render();
  }

  controls.yearSelect.addEventListener("change", () => { state.year = Number(controls.yearSelect.value); state.selectedId = null; render(); });
  controls.sizeBand.addEventListener("change", () => applySizeBand(controls.sizeBand.value));
  controls.priceBand.addEventListener("change", () => applyPriceBand(controls.priceBand.value));
  controls.searchInput.addEventListener("input", () => { state.query = controls.searchInput.value.trim().toLocaleLowerCase(); state.selectedId = null; render(); });
  controls.labelMode.addEventListener("change", () => { state.labelMode = controls.labelMode.value; render(); });
  controls.rankingFuel.addEventListener("change", () => { state.rankingFuel = controls.rankingFuel.value; updateRanking(); });
  ["lengthMin", "lengthMax", "priceMin", "priceMax", "salesMin", "salesMax"].forEach((id) => controls[id].addEventListener("change", readRanges));
  document.querySelector("#toggleBodies").addEventListener("click", () => { state.bodies = state.bodies.size === bodies.length ? new Set() : new Set(bodies); renderChips(); render(); });
  document.querySelector("#toggleFuels").addEventListener("click", () => { state.fuels = state.fuels.size === fuels.length ? new Set() : new Set(fuels); renderChips(); render(); });
  document.querySelector("#showAllRanges").addEventListener("click", () => { state.ranges = { length: [...limits.length], price: [...limits.price], sales: [...limits.sales] }; controls.sizeBand.value = "ALL"; controls.priceBand.value = "ALL"; syncRangeInputs(); setViewToRanges(); render(); });
  document.querySelector("#addStar").addEventListener("click", beginNewReference);
  controls.deleteStar.addEventListener("click", deleteReference);
  document.querySelector("#starForm").addEventListener("submit", saveReference);
  controls.starSelect.addEventListener("change", () => { const row = references.find((item) => item.id === controls.starSelect.value); if (row) { syncReferenceEditor(row); state.selectedId = row.id; updateDetail(row); render(); } else beginNewReference(); });
  document.querySelector("#resetAll").addEventListener("click", resetAll);
  document.querySelector("#zoomIn").addEventListener("click", () => zoom(.78)); document.querySelector("#zoomOut").addEventListener("click", () => zoom(1.28)); document.querySelector("#zoomReset").addEventListener("click", () => { setViewToRanges(); render(); });
  svg.addEventListener("wheel", (event) => { event.preventDefault(); const rect = svg.getBoundingClientRect(); zoom(event.deltaY > 0 ? 1.075 : .93, (event.clientX - rect.left) / rect.width, 1 - (event.clientY - rect.top) / rect.height); }, { passive: false });
  let drag = null;
  svg.addEventListener("pointerdown", (event) => { if (event.target !== svg && event.target.tagName !== "rect") return; drag = { x: event.clientX, y: event.clientY, viewX: [...state.viewX], viewY: [...state.viewY] }; svg.setPointerCapture(event.pointerId); svg.classList.add("dragging"); });
  svg.addEventListener("pointermove", (event) => { if (!drag) return; const rect = svg.getBoundingClientRect(); const dx = (event.clientX - drag.x) / rect.width * (drag.viewX[1] - drag.viewX[0]); const dy = (event.clientY - drag.y) / rect.height * (drag.viewY[1] - drag.viewY[0]); state.viewX = clampDomain([drag.viewX[0] - dx, drag.viewX[1] - dx], limits.length, 80); state.viewY = clampDomain([drag.viewY[0] + dy, drag.viewY[1] + dy], limits.price, 50000); render(); });
  const stopDrag = () => { drag = null; svg.classList.remove("dragging"); };
  svg.addEventListener("pointerup", stopDrag); svg.addEventListener("pointercancel", stopDrag); svg.addEventListener("click", (event) => { if (event.target === svg || event.target.tagName === "rect") { state.selectedId = null; updateDetail(null); render(); } });
  new ResizeObserver(() => render()).observe(chartWrap);

  const modelContext = document.modelContext;
  if (modelContext?.registerTool) {
    try {
      void Promise.resolve(modelContext.registerTool({
        name: "set_brazil_market_filters",
        title: "设置巴西市场筛选",
        description: "设置年份、车身形式、动力形式、车长和巴西雷亚尔价格范围，并更新当前气泡图。",
        inputSchema: {
          type: "object",
          properties: {
            year: { type: "integer", enum: [2024, 2025, 2026] },
            bodies: { type: "array", items: { type: "string", enum: bodies }, uniqueItems: true },
            fuels: { type: "array", items: { type: "string", enum: fuels }, uniqueItems: true },
            lengthMin: { type: "number" }, lengthMax: { type: "number" },
            priceMin: { type: "number" }, priceMax: { type: "number" },
            query: { type: "string" },
          },
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input) {
          if (input.year != null && ![2024, 2025, 2026].includes(input.year)) throw new Error("不支持的年份");
          if (input.bodies && input.bodies.some((value) => !bodies.includes(value))) throw new Error("车身形式无效");
          if (input.fuels && input.fuels.some((value) => !fuels.includes(value))) throw new Error("动力形式无效");
          const nextLength = [input.lengthMin ?? state.ranges.length[0], input.lengthMax ?? state.ranges.length[1]];
          const nextPrice = [input.priceMin ?? state.ranges.price[0], input.priceMax ?? state.ranges.price[1]];
          if (nextLength[0] > nextLength[1] || nextPrice[0] > nextPrice[1]) throw new Error("范围下限不能高于上限");
          if (input.year != null) state.year = input.year;
          if (input.bodies) state.bodies = new Set(input.bodies);
          if (input.fuels) state.fuels = new Set(input.fuels);
          state.ranges.length = nextLength; state.ranges.price = nextPrice;
          if (input.query != null) state.query = input.query.trim().toLocaleLowerCase();
          controls.yearSelect.value = String(state.year); controls.searchInput.value = input.query ?? controls.searchInput.value;
          controls.sizeBand.value = "CUSTOM"; controls.priceBand.value = "CUSTOM";
          syncRangeInputs(); setViewToRanges(); renderChips(); render();
          const rows = state.query ? currentMatchedRows() : currentRows();
          return { country: "Brazil", year: state.year, vehicleCount: rows.length, sales: rows.reduce((sum, row) => sum + row.sales, 0) };
        },
      })).catch(() => {});
    } catch (_) {}
  }

  populateRankingFuel(); renderChips(); syncRangeInputs(); syncReferenceEditor();
  document.querySelector("#sourceNote").textContent = `数据：${meta.sourceWorkbook || "源表"} · ${meta.latestPeriod || "2026 YTD"} · 价格为巴西 MSRP（BRL）· 已删除 Unspecified`;
  render();
})();
