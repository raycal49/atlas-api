import { mkdir, writeFile } from "node:fs/promises";
import DottedMap from "dotted-map";

const map = new DottedMap({
  height: 50,
  grid: "diagonal",
  projection: {
    name: "robinson",
  },
});

const locations = [
  { lat: 32.7767, lng: -96.7970 },  // Dallas
  { lat: 40.7128, lng: -74.0060 },  // New York
  { lat: 51.5072, lng: -0.1276 },   // London
  { lat: 35.6762, lng: 139.6503 },  // Tokyo
  { lat: -33.8688, lng: 151.2093 }, // Sydney
];

for (const location of locations) {
  map.addPin({
    ...location,
    svgOptions: {
      color: "#0d6efd",
      radius: 0.45,
    },
  });
}

const svg = map.getSVG({
  radius: 0.18,
  color: "#495057",
  shape: "circle",
  backgroundColor: "#212529",
});

const imageDirectory = new URL("../public/images/", import.meta.url);
const outputFile = new URL("dotted-world-map.svg", imageDirectory);

await mkdir(imageDirectory, { recursive: true });
await writeFile(outputFile, svg, "utf8");

console.log("Generated src/public/images/dotted-world-map.svg");