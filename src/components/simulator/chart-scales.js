export function uncappedAxis(scale) {
  const { max: _max, suggestedMax: _suggestedMax, ...rest } = scale ?? {};
  return { ...rest, min: 0 };
}

export const ROUTE_SERIES_COLORS = [
  "--primary",
  "--secondary-green",
  "--warning",
  "--damage",
  "--foreground",
  "--muted-foreground",
];
