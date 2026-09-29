import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) throw new Error("Usage: inspect_workbook.mjs input.xlsx preview.png");

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const preview = await workbook.render({
  sheetName: "Sheet1",
  range: "A1:P20",
  scale: 1.4,
  format: "png",
});
await fs.writeFile(outputPath, new Uint8Array(await preview.arrayBuffer()));
console.log(workbook.inspect({ kind: "table", range: "Sheet1!A1:P8", include: "values,formulas", tableMaxRows: 8, tableMaxCols: 16 }).ndjson);
