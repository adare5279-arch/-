import { readFileSync } from "node:fs";
const data = readFileSync(new URL("./_raw14449.html", import.meta.url), "utf8");

// official speaker example
let i = data.indexOf("킨텍스대표이사 이재율");
console.log("=== official wrapping ===");
console.log(data.slice(i - 140, i + 160).replace(/\s{3,}/g, " "));

// enumerate turn divs
const turnDivs = [...data.matchAll(/<div class='(sMan[^']*)'>/g)].map((x) => x[1]);
const counts = {};
turnDivs.forEach((c) => (counts[c] = (counts[c] || 0) + 1));
console.log("\n=== turn divs ===");
console.log("total turns:", turnDivs.length, "distinct speakers:", Object.keys(counts).length);
console.log(Object.entries(counts));

// bold speaker headers
const heads = [...data.matchAll(/<span class='bold'>○\s*([^<]*?)\s*(?:<span class='([^']*)'>([^<]*)<\/span>)?\s*<\/span>/g)];
console.log("\n=== first 16 speaker headers (role | pvId | name) ===");
heads.slice(0, 16).forEach((h) => console.log(JSON.stringify([h[1].trim(), h[2] || "", (h[3] || "").trim()])));
