/**
 * Remove pasta .next antes de subir o dev (útil quando CSS/JS ficam presos em cache).
 */
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", ".next");
if (fs.existsSync(dir)) {
  fs.rmSync(dir, { recursive: true, force: true });
  console.log("Removido .next");
}
