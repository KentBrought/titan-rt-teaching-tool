import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  loadMaterialAlbedoMap,
  SURFACE_CLASS_RGB,
  getMaterialClassAtLatLon,
  MATERIAL_MAP_LON_SHIFT_DEG,
} from '../utils/materialMapLoader';
import {
  getMaterialClassDiskMap,
  MATERIAL_GEO_CUBE_PHASE_OFFSET_DEG,
  materialDiskGeoPhaseFromRtFilenamePhase,
} from '../utils/materialDiskClassCache';
import { getGeoCubeData, getGeoValue } from '../utils/geoCubeLoader';

const PHASE_STEP = 15;
const SLIDER_MIN = 0;
const SLIDER_MAX = 12;
const MAX_UI_DISPLAY_PHASE = 180;
const ASSET_OFFSET = 0;
const DISK = 681;

/** Every `p***` backplane under `vims_geo` in this repo (5° sampling around the orbit). */
const VIMS_GEO_ASSET_PHASES_DEG = Array.from({ length: 72 }, (_, i) => i * 5);
const VIMS_GEO_PHASE_STEP_DEG = 5;

/** Snap a query value to the shipped 5° grid (0…355). */
function snapGeoQueryToCatalogDeg(raw) {
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return 0;
  const s = Math.round(n / VIMS_GEO_PHASE_STEP_DEG) * VIMS_GEO_PHASE_STEP_DEG;
  return ((s % 360) + 360) % 360;
}

function readInitialGeoFromSearch(search) {
  const q = new URLSearchParams(search).get('geo');
  if (q == null || q === '') {
    return { sliderHighlight: 0, activeAssetPhaseDeg: assetDegFromSlider(0) };
  }
  return { sliderHighlight: null, activeAssetPhaseDeg: snapGeoQueryToCatalogDeg(q) };
}

function displayDegFromSlider(s) {
  const i = Math.max(SLIDER_MIN, Math.min(SLIDER_MAX, Math.round(Number(s))));
  return i * PHASE_STEP;
}

/** Filename / geo cube phase used by the teaching app for a given phase slider index. */
function assetDegFromSlider(s) {
  return Math.min(MAX_UI_DISPLAY_PHASE, displayDegFromSlider(s) + ASSET_OFFSET);
}

/** Unique RT filename phases reached by the teaching slider (p000 … p180 in 15° steps). */
function teachingSliderAssetPhases() {
  const set = new Set();
  for (let s = SLIDER_MIN; s <= SLIDER_MAX; s++) set.add(assetDegFromSlider(s));
  return [...set].sort((a, b) => a - b);
}

function nearestTeachingAssetPhaseDeg(p) {
  const candidates = teachingSliderAssetPhases();
  let best = candidates[0];
  let bestD = Infinity;
  for (const c of candidates) {
    const d = Math.min(Math.abs(p - c), Math.abs(p - c + 360), Math.abs(p - c - 360));
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return { deg: best, deltaDeg: bestD };
}

function classToRgb(cls) {
  if (cls === 0 || cls === 1 || cls === 2) return SURFACE_CLASS_RGB[cls];
  return [40, 40, 40];
}

function putClassDiskOnCanvas(canvas, disk) {
  const ctx = canvas.getContext('2d');
  if (!ctx || !disk?.data) return;
  const w = disk.width;
  const h = disk.height;
  canvas.width = w;
  canvas.height = h;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const src = disk.data;
  for (let i = 0; i < w * h; i++) {
    const cls = src[i];
    const [r, g, b] = classToRgb(cls);
    const j = i * 4;
    d[j] = r;
    d[j + 1] = g;
    d[j + 2] = b;
    d[j + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function putGlobalMapOnCanvas(canvas, materialMap) {
  const ctx = canvas.getContext('2d');
  if (!ctx || !materialMap?.data) return;
  const mw = materialMap.width;
  const mh = materialMap.height;
  const scale = 3;
  canvas.width = mw * scale;
  canvas.height = mh * scale;
  const img = ctx.createImageData(mw, mh);
  const d = img.data;
  const { data } = materialMap;
  for (let i = 0; i < mw * mh; i++) {
    const cls = data[i];
    const [r, g, b] = classToRgb(cls);
    const j = i * 4;
    d[j] = r;
    d[j + 1] = g;
    d[j + 2] = b;
    d[j + 3] = 255;
  }
  const tmp = document.createElement('canvas');
  tmp.width = mw;
  tmp.height = mh;
  const tctx = tmp.getContext('2d');
  if (!tctx) return;
  tctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, mw * scale, mh * scale);
}

function downloadCanvas(canvas, filename) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }, 'image/png');
}

function buildDiskCsv(geoData, disk) {
  const lines = ['x,y,lat_deg,lon_deg,class_0_1_2'];
  if (!geoData || !disk?.data) return lines.join('\n');
  for (let y = 0; y < DISK; y++) {
    for (let x = 0; x < DISK; x++) {
      const lat = getGeoValue(geoData, x, y, 0);
      const lon = getGeoValue(geoData, x, y, 1);
      const cls = disk.data[y * DISK + x];
      lines.push(`${x},${y},${lat},${lon},${cls}`);
    }
  }
  return lines.join('\n');
}

const geoCtx = { hazeFolder: 'tomasko_1.0', albedo: 0.1, compositeType: '5_2_1.3' };

function PhaseThumb({ slider, disk, selected, onSelect }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && disk) putClassDiskOnCanvas(ref.current, disk);
  }, [disk]);
  const asset = assetDegFromSlider(slider);
  return (
    <button
      type="button"
      onClick={() => onSelect(slider)}
      style={{
        border: selected ? '2px solid #66ccff' : '1px solid #444',
        padding: 4,
        background: '#1a1a2e',
        cursor: 'pointer',
      }}
    >
      <div style={{ fontSize: '11px', color: '#ccc', marginBottom: '4px' }}>
        UI {displayDegFromSlider(slider)}° → p{String(asset).padStart(3, '0')}
      </div>
      <canvas
        ref={ref}
        width={DISK}
        height={DISK}
        style={{ width: '120px', height: '120px', imageRendering: 'pixelated', display: 'block' }}
      />
    </button>
  );
}

export default function SurfaceMapDebugPage() {
  const [searchParams] = useSearchParams();
  const [materialMap, setMaterialMap] = useState(null);
  const [err, setErr] = useState(null);
  const [phaseDisks, setPhaseDisks] = useState({});
  const [geoByPhase, setGeoByPhase] = useState({});
  /** 5° catalog: true `p***_geo` (no RT→geo offset). Teaching row uses {@link materialDiskGeoPhaseFromRtFilenamePhase}. */
  const [rawPhaseDisks, setRawPhaseDisks] = useState({});
  const [rawGeoByPhase, setRawGeoByPhase] = useState({});
  const [loadingDisks, setLoadingDisks] = useState(false);
  const [loadingActive, setLoadingActive] = useState(false);
  /** Which teaching-slider thumb is highlighted (`null` = 5° catalog / `?geo=` mode). */
  const [sliderHighlight, setSliderHighlight] = useState(() =>
    readInitialGeoFromSearch(typeof window !== 'undefined' ? window.location.search : '').sliderHighlight
  );
  /** RT teaching phase or raw catalog degrees for the large disk / CSV. */
  const [activeAssetPhaseDeg, setActiveAssetPhaseDeg] = useState(() =>
    readInitialGeoFromSearch(typeof window !== 'undefined' ? window.location.search : '').activeAssetPhaseDeg
  );
  const globalCanvasRef = useRef(null);
  const bigDiskRef = useRef(null);
  const [hover, setHover] = useState(null);

  const geoQuery = searchParams.get('geo');
  useEffect(() => {
    if (geoQuery == null || geoQuery === '') return;
    const deg = snapGeoQueryToCatalogDeg(geoQuery);
    setSliderHighlight(null);
    setActiveAssetPhaseDeg(deg);
  }, [geoQuery]);

  useEffect(() => {
    let cancelled = false;
    loadMaterialAlbedoMap()
      .then((m) => {
        if (!cancelled) setMaterialMap(m);
      })
      .catch((e) => {
        if (!cancelled) setErr(e?.message || String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!materialMap) return;
    let cancelled = false;
    setLoadingDisks(true);
    (async () => {
      const disks = {};
      const geos = {};
      for (let s = SLIDER_MIN; s <= SLIDER_MAX; s++) {
        if (cancelled) return;
        const asset = assetDegFromSlider(s);
        const geoPhase = materialDiskGeoPhaseFromRtFilenamePhase(asset);
        const geo = await getGeoCubeData(geoPhase, geoCtx);
        if (cancelled) return;
        geos[asset] = geo;
        const disk = await getMaterialClassDiskMap(asset, materialMap, { geoLoadContext: geoCtx });
        if (cancelled) return;
        disks[asset] = disk;
      }
      if (!cancelled) {
        setGeoByPhase(geos);
        setPhaseDisks(disks);
        setLoadingDisks(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time warm of teaching phases on map load
  }, [materialMap]);

  const catalogBrowseMode = sliderHighlight === null;

  useEffect(() => {
    if (!materialMap) return;
    const key = Math.round(activeAssetPhaseDeg);
    if (catalogBrowseMode) {
      if (rawPhaseDisks[key] && rawGeoByPhase[key]) {
        setLoadingActive(false);
        return;
      }
    } else if (phaseDisks[key] && geoByPhase[key]) {
      setLoadingActive(false);
      return;
    }
    let cancelled = false;
    setLoadingActive(true);
    (async () => {
      try {
        if (catalogBrowseMode) {
          const geo = await getGeoCubeData(key, geoCtx);
          if (cancelled) return;
          const disk = await getMaterialClassDiskMap(key, materialMap, {
            geoLoadContext: geoCtx,
            geoFilenamePhaseIsExact: true,
          });
          if (cancelled) return;
          setRawGeoByPhase((prev) => (prev[key] ? prev : { ...prev, [key]: geo }));
          setRawPhaseDisks((prev) => (prev[key] ? prev : { ...prev, [key]: disk }));
        } else {
          const geoPhase = materialDiskGeoPhaseFromRtFilenamePhase(key);
          const geo = await getGeoCubeData(geoPhase, geoCtx);
          if (cancelled) return;
          const disk = await getMaterialClassDiskMap(key, materialMap, { geoLoadContext: geoCtx });
          if (cancelled) return;
          setGeoByPhase((prev) => (prev[key] ? prev : { ...prev, [key]: geo }));
          setPhaseDisks((prev) => (prev[key] ? prev : { ...prev, [key]: disk }));
        }
      } catch (e) {
        if (!cancelled) setErr(e?.message || String(e));
      } finally {
        if (!cancelled) setLoadingActive(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [materialMap, activeAssetPhaseDeg, sliderHighlight, phaseDisks, geoByPhase, rawPhaseDisks, rawGeoByPhase]);

  useEffect(() => {
    const c = globalCanvasRef.current;
    if (c && materialMap) putGlobalMapOnCanvas(c, materialMap);
  }, [materialMap]);

  const activeKey = Math.round(activeAssetPhaseDeg);
  const selectedDisk = catalogBrowseMode ? rawPhaseDisks[activeKey] : phaseDisks[activeKey];
  const selectedGeo = catalogBrowseMode ? rawGeoByPhase[activeKey] : geoByPhase[activeKey];
  const geoCubePhaseForDisk = catalogBrowseMode
    ? activeKey
    : materialDiskGeoPhaseFromRtFilenamePhase(activeKey);

  useEffect(() => {
    const c = bigDiskRef.current;
    if (c && selectedDisk) putClassDiskOnCanvas(c, selectedDisk);
  }, [selectedDisk]);

  const onGlobalClick = useCallback(
    (e) => {
      if (!materialMap || !globalCanvasRef.current) return;
      const rect = globalCanvasRef.current.getBoundingClientRect();
      const mx = Math.floor(((e.clientX - rect.left) / rect.width) * materialMap.width);
      const my = Math.floor(((e.clientY - rect.top) / rect.height) * materialMap.height);
      const mr = Math.max(0, Math.min(materialMap.height - 1, my));
      const mc = Math.max(0, Math.min(materialMap.width - 1, mx));
      const lat = 90 - ((mr + 0.5) / materialMap.height) * 180;
      const lonWrapped = ((mc + 0.5) / materialMap.width) * 360 - 180;
      const clsFile = materialMap.data[mr * materialMap.width + mc];
      const clsPipeline = getMaterialClassAtLatLon(materialMap, lat, lonWrapped);
      setHover({
        kind: 'global',
        row: mr,
        col: mc,
        lat,
        lon: lonWrapped,
        clsFile,
        clsPipeline,
      });
    },
    [materialMap]
  );

  const onDiskMove = useCallback(
    (e) => {
      if (!selectedDisk || !selectedGeo || !bigDiskRef.current) return;
      const rect = bigDiskRef.current.getBoundingClientRect();
      const nx = Math.floor(((e.clientX - rect.left) / rect.width) * DISK);
      const ny = Math.floor(((e.clientY - rect.top) / rect.height) * DISK);
      const x = Math.max(0, Math.min(DISK - 1, nx));
      const y = Math.max(0, Math.min(DISK - 1, ny));
      const lat = getGeoValue(selectedGeo, x, y, 0);
      const lon = getGeoValue(selectedGeo, x, y, 1);
      const cls = selectedDisk.data[y * DISK + x];
      const uiLabel =
        sliderHighlight !== null && assetDegFromSlider(sliderHighlight) === activeKey
          ? `${displayDegFromSlider(sliderHighlight)}° (teaching slider)`
          : 'not a teaching-slider step (see picker above)';
      setHover({
        kind: 'disk',
        x,
        y,
        lat,
        lon,
        cls,
        uiPhaseLabel: uiLabel,
        assetPhase: activeKey,
        geoCubePhase: geoCubePhaseForDisk,
      });
    },
    [selectedDisk, selectedGeo, sliderHighlight, activeKey, catalogBrowseMode, geoCubePhaseForDisk]
  );

  const downloadSelectedCsv = () => {
    if (!selectedGeo || !selectedDisk) return;
    const csv = buildDiskCsv(selectedGeo, selectedDisk);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `surface_unit_disk_p${String(activeKey).padStart(3, '0')}_681.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const stepAssetBy = (deltaSteps) => {
    const n = VIMS_GEO_ASSET_PHASES_DEG.length;
    const i = VIMS_GEO_ASSET_PHASES_DEG.findIndex((d) => d === activeKey);
    const base = i >= 0 ? i : 0;
    const next = VIMS_GEO_ASSET_PHASES_DEG[(base + deltaSteps + n * 10) % n];
    setSliderHighlight(null);
    setActiveAssetPhaseDeg(next);
  };

  const nearestTeaching = nearestTeachingAssetPhaseDeg(activeKey);
  const onPickTeachingThumb = (s) => {
    setSliderHighlight(s);
    setActiveAssetPhaseDeg(assetDegFromSlider(s));
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', color: '#e0e0e0' }}>
      <p style={{ marginBottom: '16px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
        <Link to="/" style={{ color: '#66ccff' }}>&larr; Back to main</Link>
        <Link to="/debug/surface-units-map?geo=335" style={{ color: '#8cf' }}>
          Raw p335
        </Link>
        <Link to="/debug/surface-units-map?geo=340" style={{ color: '#8cf' }}>
          Raw p340
        </Link>
      </p>
      <h1 style={{ fontSize: '22px', marginBottom: '8px' }}>Surface unit map inspector</h1>
      <p style={{ color: '#aaa', marginBottom: '12px', lineHeight: 1.5 }}>
        Full <code>material_albedo_map.txt</code> (288×576) and smoothed 681×681 class disks from{' '}
        <code>vims_geo/2012_A0.1_p***_geo.img</code>. Longitude shift for lat/lon sampling:{' '}
        <strong>{MATERIAL_MAP_LON_SHIFT_DEG}°</strong> (<code>MATERIAL_MAP_LON_SHIFT_DEG</code>).
      </p>
      <p style={{ color: '#c9a227', marginBottom: '20px', lineHeight: 1.5, fontSize: '14px' }}>
        The main app’s phase slider only loads <strong>13</strong> UI steps (0°–180° in 15°), which map to RT filename
        phases <strong>p000 … p180</strong> in 15° steps (one RT/geo pair per slider step). The
        repo also ships <strong>72</strong> geo cubes on a <strong>5°</strong> grid (<strong>p000 … p355</strong>).
        Basemap / surface-unit disks use the same <strong>p###</strong> as the RT image when{' '}
        <code>MATERIAL_GEO_CUBE_PHASE_OFFSET_DEG</code> is {MATERIAL_GEO_CUBE_PHASE_OFFSET_DEG} (see{' '}
        <code>materialDiskClassCache.js</code>). The <strong>5° catalog</strong> below can load any cube by exact
        filename for comparison. Deep-link raw geo: <code>?geo=335</code>, <code>?geo=340</code>, etc. (any degree is
        snapped to the nearest 5°).
      </p>

      {err && <p style={{ color: '#f88' }}>{err}</p>}
      {!materialMap && !err && <p>Loading material map…</p>}
      {loadingDisks && materialMap && <p>Building teaching-slider disks (13 thumbnails)…</p>}

      {materialMap && (
        <>
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '18px', marginBottom: '8px' }}>Global basemap (file grid)</h2>
            <p style={{ color: '#999', fontSize: '14px', marginBottom: '8px' }}>
              Row 0 = +90° lat. Click: raw file class vs <code>getMaterialClassAtLatLon</code> (includes lon shift).
            </p>
            <canvas
              ref={globalCanvasRef}
              onClick={onGlobalClick}
              style={{ border: '1px solid #444', cursor: 'crosshair', maxWidth: '100%' }}
            />
            <button
              type="button"
              style={{ marginTop: '8px', padding: '8px 12px', cursor: 'pointer' }}
              onClick={() =>
                globalCanvasRef.current &&
                downloadCanvas(globalCanvasRef.current, 'material_albedo_map_rgb.png')
              }
            >
              Download global map PNG
            </button>
          </section>

          <section style={{ marginBottom: '24px', padding: '16px', background: '#12121f', border: '1px solid #333' }}>
            <h2 style={{ fontSize: '18px', marginBottom: '8px' }}>Any geo filename phase (5° catalog)</h2>
            <p style={{ color: '#999', fontSize: '14px', marginBottom: '12px' }}>
              Large disk / CSV use the <strong>true</strong> <code>p###_geo.img</code> (no RT→geo offset;{' '}
              <code>geoFilenamePhaseIsExact</code>). Closest teaching RT asset:{' '}
              <strong>p{String(nearestTeaching.deg).padStart(3, '0')}</strong> ({nearestTeaching.deltaDeg.toFixed(1)}°
              away).
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Asset p</span>
                <select
                  value={activeKey}
                  onChange={(e) => {
                    setSliderHighlight(null);
                    setActiveAssetPhaseDeg(Number(e.target.value));
                  }}
                  style={{ padding: '6px 10px', fontSize: '14px' }}
                >
                  {VIMS_GEO_ASSET_PHASES_DEG.map((d) => (
                    <option key={d} value={d}>
                      {String(d).padStart(3, '0')} ({d}°)
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" style={{ padding: '6px 12px', cursor: 'pointer' }} onClick={() => stepAssetBy(-1)}>
                −5°
              </button>
              <button type="button" style={{ padding: '6px 12px', cursor: 'pointer' }} onClick={() => stepAssetBy(1)}>
                +5°
              </button>
              {loadingActive && <span style={{ color: '#8cf' }}>Loading p{String(activeKey).padStart(3, '0')}…</span>}
            </div>
          </section>

          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '18px', marginBottom: '8px' }}>Teaching app phase row (13 thumbnails)</h2>
            <p style={{ color: '#999', fontSize: '14px', marginBottom: '12px' }}>
              Same mapping as <code>App.js</code>: UI phase = slider × 15°; RT / geo filename = min(180°, that value). Click a
              thumbnail to sync the picker above.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {Array.from({ length: SLIDER_MAX - SLIDER_MIN + 1 }, (_, i) => SLIDER_MIN + i).map((s) => (
                <PhaseThumb
                  key={s}
                  slider={s}
                  disk={phaseDisks[assetDegFromSlider(s)]}
                  selected={sliderHighlight === s}
                  onSelect={onPickTeachingThumb}
                />
              ))}
            </div>
          </section>

          <section>
            <h2 style={{ fontSize: '18px', marginBottom: '8px' }}>
              Large disk —{' '}
              {catalogBrowseMode ? (
                <>
                  raw geo <strong>p{String(activeKey).padStart(3, '0')}</strong>
                </>
              ) : (
                <>
                  RT <strong>p{String(activeKey).padStart(3, '0')}</strong> → basemap geo{' '}
                  <strong>p{String(geoCubePhaseForDisk).padStart(3, '0')}</strong>
                  {sliderHighlight !== null && assetDegFromSlider(sliderHighlight) === activeKey
                    ? ` (teaching UI ${displayDegFromSlider(sliderHighlight)}°)`
                    : ''}
                </>
              )}
            </h2>
            {!selectedDisk && <p style={{ color: '#888' }}>Building disk…</p>}
            <canvas
              ref={bigDiskRef}
              onMouseMove={onDiskMove}
              onMouseLeave={() => setHover(null)}
              style={{
                width: 'min(90vw, 681px)',
                height: 'min(90vw, 681px)',
                maxWidth: '681px',
                maxHeight: '681px',
                border: '1px solid #444',
                imageRendering: 'pixelated',
                cursor: 'crosshair',
              }}
            />
            <div style={{ marginTop: '10px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                style={{ padding: '8px 12px', cursor: 'pointer' }}
                onClick={() =>
                  bigDiskRef.current &&
                  downloadCanvas(
                    bigDiskRef.current,
                    `surface_units_disk_p${String(activeKey).padStart(3, '0')}.png`
                  )
                }
              >
                Download this disk PNG
              </button>
              <button type="button" style={{ padding: '8px 12px', cursor: 'pointer' }} onClick={downloadSelectedCsv}>
                Download full 681×681 CSV (x,y,lat,lon,class)
              </button>
            </div>
          </section>

          {hover && (
            <pre
              style={{
                marginTop: '16px',
                padding: '12px',
                background: '#111',
                border: '1px solid #333',
                fontSize: '13px',
                overflow: 'auto',
              }}
            >
              {hover.kind === 'global'
                ? `Global map cell: row=${hover.row} col=${hover.col}\nlat=${hover.lat?.toFixed(4)} lon=${hover.lon?.toFixed(4)}\nclass in file (raw)=${hover.clsFile}\nclass via getMaterialClassAtLatLon (pipeline)=${hover.clsPipeline}`
                : `Disk sample/line: x=${hover.x} y=${hover.y}\nTeaching UI phase: ${hover.uiPhaseLabel}\nRT / picker label p${String(hover.assetPhase).padStart(3, '0')}\ngeo cube lat/lon from p${String(hover.geoCubePhase ?? hover.assetPhase).padStart(3, '0')}\nlat=${hover.lat} lon=${hover.lon}\nclass (smoothed disk)=${hover.cls}`}
            </pre>
          )}
        </>
      )}
    </div>
  );
}
