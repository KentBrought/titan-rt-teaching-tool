let cached = null;

export async function loadMaterialAlbedoMap() {
  if (cached) return cached;
  const res = await fetch('/data/material_albedo_map.txt');
  if (!res.ok) throw new Error('Failed to load material map');
  const text = await res.text();
  const lines = text.trim().split(/\n/);
  const height = lines.length;
  const width = lines[0].trim().split(/\s+/).length;
  const data = new Uint8Array(width * height);
  let o = 0;
  for (let r = 0; r < height; r++) {
    const vals = lines[r].trim().split(/\s+/);
    for (let c = 0; c < width; c++) {
      data[o++] = Math.round(Number(vals[c]));
    }
  }
  cached = { width, height, data };
  return cached;
}
