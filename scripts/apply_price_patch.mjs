import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const [inputPath, patchPath, outputPath, previewPath] = process.argv.slice(2);
if (!inputPath || !patchPath || !outputPath || !previewPath) {
  throw new Error("Usage: apply_price_patch.mjs input.xlsx patch.json output.xlsx preview.png");
}

const patch = JSON.parse(await fs.readFile(patchPath, "utf8"));
const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const sheet = workbook.worksheets.getItem(patch.sheetName);
const lastRow = patch.rows.length + 1;

sheet.getRange(`I2:I${lastRow}`).values = patch.rows.map((row) => [row[0]]);
sheet.getRange("Q1:S1").values = [["价格来源", "来源链接", "价格备注"]];
sheet.getRange(`Q2:S${lastRow}`).values = patch.rows.map((row) => row.slice(1));
sheet.getRange(`I2:I${lastRow}`).format.numberFormat = 'R$ #,##0';
sheet.getRange("Q1:S1").format = {
  fill: "#D9EAF7",
  font: { bold: true, color: "#16324F" },
};
sheet.getRange("Q:Q").format.columnWidth = 29;
sheet.getRange("R:R").format.columnWidth = 44;
sheet.getRange("S:S").format.columnWidth = 54;
sheet.freezePanes.freezeRows(1);

workbook.recalculate();
const preview = await workbook.render({ sheetName: patch.sheetName, range: "A1:S18", scale: 1.25, format: "png" });
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(JSON.stringify({ sheet: patch.sheetName, rows: patch.rows.length, outputPath }));
