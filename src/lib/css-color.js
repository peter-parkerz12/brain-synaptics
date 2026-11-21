export function resolveCssColor(value) {
  const rgb = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) return `rgb(${rgb[1]}, ${rgb[2]}, ${rgb[3]})`;

  const oklch = value.match(/oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+)/i);
  if (!oklch) return value;

  const lightness = Number.parseFloat(oklch[1]) / (oklch[1].endsWith("%") ? 100 : 1);
  const chroma = Number.parseFloat(oklch[2]) * (oklch[2].endsWith("%") ? 0.004 : 1);
  const hue = (Number(oklch[3]) * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const channels = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => {
    const srgb =
      channel <= 0.0031308 ? 12.92 * channel : 1.055 * Math.max(0, channel) ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, srgb)) * 255);
  });
  return `rgb(${channels.join(", ")})`;
}

export function readToken(name) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return resolveCssColor(raw);
}
