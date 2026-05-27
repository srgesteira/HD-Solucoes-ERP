import fs from "fs";

for (const p of process.argv.slice(2)) {
  let s = fs.readFileSync(p, "utf8");
  const before = s;
  s = s.replaceAll("</motion.div>", "</div>");
  s = s.replaceAll("</motion>", "</div>");
  s = s.replace(/<motion\.div(\s|>)/g, "<div$1");
  s = s.replace(/<motion(\s|>)/g, "<div$1");
  if (s !== before) {
    fs.writeFileSync(p, s);
    console.log("fixed", p);
  }
}
