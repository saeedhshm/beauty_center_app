export const MARKET = {
  cityCode: 'EG-CAI',
  cityName: 'القاهرة',
  timeZone: 'Africa/Cairo',
  paymentMode: 'demo',
  daytimeOnly: true,
} as const;

export const PUBLIC_MAP_CONFIG = {
  type: 'raster',
  tileUrlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  minZoom: 0,
  maxZoom: 19,
  attribution: {
    text: '© OpenStreetMap contributors',
    url: 'https://www.openstreetmap.org/copyright',
  },
  reportIssueUrl: 'https://www.openstreetmap.org/fixthemap',
} as const;
