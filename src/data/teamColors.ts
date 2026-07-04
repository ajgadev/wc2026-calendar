/**
 * A single signature colour per nation, used to tint the radial bracket's
 * advancing connector lines (the line a team drags inward as it wins). Each
 * is the country's primary kit/flag colour, chosen vivid enough to read as a
 * 2px stroke on the dark stage. Keyed by FIFA code; unmapped falls back to
 * the generic win-gold.
 */
export const TEAM_COLORS: Record<string, string> = {
  MEX: '#006847', // Mexico — green
  RSA: '#007A4D', // South Africa — green
  KOR: '#C60C30', // South Korea — red
  CZE: '#D7141A', // Czechia — red
  CAN: '#D52B1E', // Canada — red
  SUI: '#D80027', // Switzerland — red
  QAT: '#8A1538', // Qatar — maroon
  BIH: '#1F4EA1', // Bosnia & Herz. — blue
  BRA: '#F7D117', // Brazil — yellow
  MAR: '#0C7B3E', // Morocco — green
  HAI: '#00209F', // Haiti — blue
  SCO: '#0065BF', // Scotland — blue
  USA: '#0A3161', // United States — navy
  PAR: '#DA121A', // Paraguay — red
  AUS: '#00843D', // Australia — green
  TUR: '#E30A17', // Türkiye — red
  GER: '#E8E8E8', // Germany — white
  CUW: '#0038A8', // Curaçao — blue
  CIV: '#FF8200', // Côte d'Ivoire — orange
  ECU: '#FDD116', // Ecuador — yellow
  NED: '#EC7A08', // Netherlands — orange
  JPN: '#0033A0', // Japan — blue
  TUN: '#E70013', // Tunisia — red
  SWE: '#1F73B7', // Sweden — blue
  BEL: '#E30613', // Belgium — red
  EGY: '#CE1126', // Egypt — red
  IRN: '#239F40', // Iran — green
  NZL: '#E8E8E8', // New Zealand — white
  ESP: '#C60B1E', // Spain — red
  CPV: '#003893', // Cabo Verde — blue
  KSA: '#006C35', // Saudi Arabia — green
  URU: '#55A0DB', // Uruguay — light blue
  FRA: '#1B3DA6', // France — blue
  SEN: '#00853F', // Senegal — green
  NOR: '#EF2B2D', // Norway — red
  IRQ: '#007A3D', // Iraq — green
  ARG: '#75AADB', // Argentina — sky blue (celeste)
  ALG: '#0C7B3E', // Algeria — green
  AUT: '#ED2939', // Austria — red
  JOR: '#CE1126', // Jordan — red
  POR: '#C8102E', // Portugal — red
  UZB: '#0099B5', // Uzbekistan — blue
  COL: '#FCD116', // Colombia — yellow
  COD: '#3A9BDC', // DR Congo — sky blue
  ENG: '#F0F0F0', // England — white
  CRO: '#ED1C24', // Croatia — red
  GHA: '#0C7B3E', // Ghana — green
  PAN: '#005293', // Panama — blue
};
