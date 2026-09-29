import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(new URL("../dist/data.js", import.meta.url), "utf8"), sandbox);
const html = fs.readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../dist/app.js", import.meta.url), "utf8");
const { VEHICLE_DATA, REFERENCE_DATA, DATA_META } = sandbox.window;

assert.equal(DATA_META.country, "Brazil");
assert.equal(DATA_META.rows, VEHICLE_DATA.length);
assert.ok(VEHICLE_DATA.length > 800);
assert.equal(DATA_META.currency, "BRL");
assert.equal(DATA_META.latestPeriod, "2026 YTD (Jan–Jul)");
assert.deepEqual([...new Set(Array.from(VEHICLE_DATA, (row) => row.year))].sort(), [2024, 2025, 2026]);
assert.ok(VEHICLE_DATA.some((row) => row.body === "SUV"));
assert.ok(VEHICLE_DATA.some((row) => row.body === "Car"));
assert.ok(VEHICLE_DATA.some((row) => row.body === "MPV"));
assert.ok(VEHICLE_DATA.every((row) => row.country === "Brazil" && row.body !== "Unspecified" && row.fuel !== "Unspecified"));
assert.ok(VEHICLE_DATA.every((row) => ["Car", "SUV", "MPV"].includes(row.body)));
assert.ok(VEHICLE_DATA.every((row) => row.length > 0 && row.price > 0 && row.sales > 0));
assert.deepEqual(Array.from(REFERENCE_DATA, (row) => [row.model, row.length, row.body, row.price]), [["G01", 4500, "SUV", 191665], ["G02", 4650, "SUV", 223609]]);
assert.ok(VEHICLE_DATA.some((row) => row.model === "Toyota bZ4X" && row.price === 419990));
assert.ok(VEHICLE_DATA.some((row) => row.model === "Chevrolet Sonic" && row.length === 4230));
for (const id of ["countrySelect", "yearSelect", "sizeBand", "priceBand", "bodyFilter", "fuelFilter", "rankingFuel"]) assert.match(html, new RegExp(`id="${id}"`));
for (const id of ["starForm", "starSelect", "starModel", "starBody", "starLength", "starPrice", "addStar"]) assert.match(html, new RegExp(`id="${id}"`));
for (const phrase of ["ignoreChartFuel", "ignoreQuery", "currentMatchedRows", "matchedIds", "mergeRows", "Unspecified", "BRL", "set_brazil_market_filters"]) assert.match(app, new RegExp(phrase));
assert.match(html, /匹配项高亮/);
assert.match(app, /brazil-market-reference-stars-v1/);
assert.doesNotMatch(`${html}\n${app}`, /PUP|价格（EUR）|欧元价格/);

console.log(`Checked ${VEHICLE_DATA.length} Brazil aggregate rows and ${REFERENCE_DATA.length} reference vehicles.`);
