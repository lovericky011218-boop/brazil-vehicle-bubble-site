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
for (const id of ["starForm", "starSelect", "starModel", "starBody", "starLength", "starPrice", "addStar", "deleteStar"]) assert.match(html, new RegExp(`id="${id}"`));
for (const phrase of ["ignoreChartFuel", "ignoreQuery", "currentMatchedRows", "matchedIds", "mergeRows", "Unspecified", "BRL", "set_brazil_market_filters"]) assert.match(app, new RegExp(phrase));
assert.match(html, /匹配项高亮/);
assert.match(app, /brazil-market-reference-stars-v1/);
assert.match(app, /function deleteReference/);
assert.match(app, /if \(Array\.isArray\(saved\)\) return saved/);
assert.doesNotMatch(`${html}\n${app}`, /PUP|价格（EUR）|欧元价格/);

for (const id of ["exportPng","exportFeedback","fuelShares","bodyShares","fuelShareBar","bodyShareBar","newEnergyRate","newEnergySales","newEnergyBar"]) assert.match(html, new RegExp(`id="${id}"`));
assert.match(app, /canvas\.toBlob\(resolve, "image\/png"\)/);
assert.match(app, /巴西气泡图_\$\{state.year\}/);
const wheelFactors = app.match(/zoom\(event\.deltaY > 0 \? ([\d.]+) : ([\d.]+)/);
assert.ok(wheelFactors);
assert.ok(Math.abs((Number(wheelFactors[1])-1) - (1.15-1)/2) < 1e-10);
assert.ok(Math.abs((1-Number(wheelFactors[2])) - (1-.86)/2) < 1e-10);
const exportContext = {ctx:{measureText:(text) => ({width:Array.from(text).length*10})}};
vm.createContext(exportContext);
vm.runInContext(app.slice(app.indexOf("  function wrapExportText("),app.indexOf("  async function exportChartPng("))+'\nthis.lines = wrapExportText(ctx,"巴西BYD😀",20);',exportContext);
assert.deepEqual(Array.from(exportContext.lines),["巴西","BY","D😀"]);

// Test the actual filtering, merging, shares and bar renderer without a browser.
const row = (model,fuel,body,sales,extra={}) => ({country:"Brazil",year:2026,model,fuel,body,sales,length:4500,price:200000,...extra});
const context = {
  sourceRows:[row("Mixed","BEV","SUV",200),row("Mixed","BEV","Car",100),row("Hybrid","PHEV","SUV",100),row("Range","REEV","MPV",50),row("Petrol","ICE","Car",450),row("HEV","HEV","SUV",50),row("MEV","MEV","Car",50),row("Unknown","BEV","SUV",3000,{length:null,price:null}),row("Outside","BEV","SUV",3000,{length:5500}),row("Past","BEV","SUV",25,{year:2025})],
  state:{year:2026,bodies:new Set(["SUV","Car","MPV"]),fuels:new Set(["ICE","HEV","MEV","REEV","BEV","PHEV"]),query:"",ranges:{length:[4400,4800],price:[50000,700000],sales:[0,5000]}},
};
vm.createContext(context);
vm.runInContext(app.slice(app.indexOf("  function median("),app.indexOf("  function syncRangeInputs(")),context);
const calculate = () => vm.runInContext('this.shares = segmentComposition(currentRows(),["ICE","HEV","MEV","REEV","BEV","PHEV"],["SUV","Car","MPV"]);',context);
calculate();
assert.equal(context.shares.total,1000);
assert.equal(context.shares.newEnergySales,450);
assert.equal(context.shares.newEnergyShare,.45);
assert.deepEqual(Array.from(context.shares.bodies,(entry)=>entry.share),[.35,.6,.05]);
assert.deepEqual(Array.from(context.shares.fuels,(entry)=>entry.share),[.45,.05,.05,.05,.3,.1]);
context.state.query="does not exist"; context.state.viewX=[4500,4600];
calculate(); assert.equal(context.shares.total,1000);
context.state.bodies=new Set(["SUV"]);
calculate(); assert.equal(context.shares.total,350); assert.equal(context.shares.newEnergySales,300);
context.state.year=2025;
calculate(); assert.equal(context.shares.total,25); assert.equal(context.shares.newEnergyShare,1);
context.state.fuels.clear();
calculate(); assert.equal(context.shares.total,0); assert.equal(context.shares.newEnergyShare,null);
assert.ok(context.shares.fuels.every((entry)=>entry.share===null));
const makeNode=()=>({children:[],style:{setProperty(){}},replaceChildren(){this.children=[];},append(...nodes){this.children.push(...nodes);}});
const nodes=Object.fromEntries(["fuelShares","bodyShares","fuelShareBar","bodyShareBar","newEnergyRate","newEnergySales","newEnergyBar"].map((id)=>[`#${id}`,makeNode()]));
context.document={querySelector:(id)=>nodes[id],createElement:makeNode};
context.fuels=["ICE","HEV","MEV","REEV","BEV","PHEV"]; context.bodies=["SUV","Car","MPV"];
context.palette=Object.fromEntries(context.fuels.map((fuel)=>[fuel,{stroke:"#078d86"}]));
context.fmtInt=new Intl.NumberFormat("zh-CN"); context.shareLabel=(value)=>value==null?"—":`${(value*100).toFixed(1)}%`;
vm.runInContext("updateComposition(currentRows());",context);
assert.equal(nodes["#newEnergyBar"].style.width,"0%");
assert.equal(nodes["#newEnergyRate"].textContent,"—");
context.state.year=2026; context.state.bodies=new Set(context.bodies); context.state.fuels=new Set(context.fuels);
vm.runInContext("updateComposition(currentRows());",context);
assert.deepEqual(nodes["#bodyShareBar"].children.map((node)=>node.style.width),["35%","60%","5%"]);
assert.equal(nodes["#newEnergyBar"].style.width,"45%");

// Reconcile default segment sales to the retained Brazil source data.
context.sourceRows=VEHICLE_DATA;
context.state.query=""; context.state.ranges.sales=[0,158000];
calculate();
const expected=VEHICLE_DATA.filter((row)=>row.year===2026&&row.length>=4400&&row.length<=4800&&row.price>=50000&&row.price<=700000&&row.sales<=158000);
assert.equal(context.shares.total,expected.reduce((sum,row)=>sum+row.sales,0));
assert.equal(context.shares.newEnergySales,expected.filter((row)=>["BEV","PHEV","REEV"].includes(row.fuel)).reduce((sum,row)=>sum+row.sales,0));

console.log(`Checked ${VEHICLE_DATA.length} Brazil aggregate rows and ${REFERENCE_DATA.length} reference vehicles.`);
