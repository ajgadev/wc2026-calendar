import type { Stadium } from '../lib/types';

/** All 16 venues. `id` is the internal key used on matches. */
export const STADIUMS: Record<string, Stadium> = {
  azteca: {
    id: 'azteca', name: 'Estadio Azteca', fifaName: 'Estadio Ciudad de México',
    city: 'Mexico City', cityShort: 'CDMX', country: 'MX', capacity: 83000,
    timezone: 'America/Mexico_City', lat: 19.3029, lng: -99.1505,
  },
  akron: {
    id: 'akron', name: 'Estadio Akron', fifaName: 'Estadio Guadalajara',
    city: 'Guadalajara', cityShort: 'GDL', country: 'MX', capacity: 48000,
    timezone: 'America/Mexico_City', lat: 20.6817, lng: -103.4625,
  },
  bbva: {
    id: 'bbva', name: 'Estadio BBVA', fifaName: 'Estadio Monterrey',
    city: 'Monterrey', cityShort: 'MTY', country: 'MX', capacity: 53500,
    timezone: 'America/Monterrey', lat: 25.6692, lng: -100.2447,
  },
  bmo: {
    id: 'bmo', name: 'BMO Field', fifaName: 'Toronto Stadium',
    city: 'Toronto', cityShort: 'TOR', country: 'CA', capacity: 45000,
    timezone: 'America/Toronto', lat: 43.6332, lng: -79.4186,
  },
  bcplace: {
    id: 'bcplace', name: 'BC Place', fifaName: 'BC Place Vancouver',
    city: 'Vancouver', cityShort: 'VAN', country: 'CA', capacity: 54000,
    timezone: 'America/Vancouver', lat: 49.2767, lng: -123.1119,
  },
  metlife: {
    id: 'metlife', name: 'MetLife Stadium', fifaName: 'New York New Jersey Stadium',
    city: 'New York / NJ', cityShort: 'NYNJ', country: 'US', capacity: 82500,
    timezone: 'America/New_York', lat: 40.8135, lng: -74.0745,
  },
  sofi: {
    id: 'sofi', name: 'SoFi Stadium', fifaName: 'Los Angeles Stadium',
    city: 'Los Angeles', cityShort: 'LA', country: 'US', capacity: 70000,
    timezone: 'America/Los_Angeles', lat: 33.9535, lng: -118.3392,
  },
  lumen: {
    id: 'lumen', name: 'Lumen Field', fifaName: 'Seattle Stadium',
    city: 'Seattle', cityShort: 'SEA', country: 'US', capacity: 69000,
    timezone: 'America/Los_Angeles', lat: 47.5952, lng: -122.3316,
  },
  levis: {
    id: 'levis', name: "Levi's Stadium", fifaName: 'San Francisco Bay Area Stadium',
    city: 'San Francisco Bay', cityShort: 'SF', country: 'US', capacity: 71000,
    timezone: 'America/Los_Angeles', lat: 37.4033, lng: -121.9694,
  },
  att: {
    id: 'att', name: 'AT&T Stadium', fifaName: 'Dallas Stadium',
    city: 'Dallas', cityShort: 'DAL', country: 'US', capacity: 94000,
    timezone: 'America/Chicago', lat: 32.7473, lng: -97.0945,
  },
  nrg: {
    id: 'nrg', name: 'NRG Stadium', fifaName: 'Houston Stadium',
    city: 'Houston', cityShort: 'HOU', country: 'US', capacity: 72000,
    timezone: 'America/Chicago', lat: 29.6847, lng: -95.4107,
  },
  mbs: {
    id: 'mbs', name: 'Mercedes-Benz Stadium', fifaName: 'Atlanta Stadium',
    city: 'Atlanta', cityShort: 'ATL', country: 'US', capacity: 75000,
    timezone: 'America/New_York', lat: 33.7554, lng: -84.4009,
  },
  hardrock: {
    id: 'hardrock', name: 'Hard Rock Stadium', fifaName: 'Miami Stadium',
    city: 'Miami', cityShort: 'MIA', country: 'US', capacity: 65000,
    timezone: 'America/New_York', lat: 25.958, lng: -80.2389,
  },
  gillette: {
    id: 'gillette', name: 'Gillette Stadium', fifaName: 'Boston Stadium',
    city: 'Boston', cityShort: 'BOS', country: 'US', capacity: 65000,
    timezone: 'America/New_York', lat: 42.0909, lng: -71.2643,
  },
  arrowhead: {
    id: 'arrowhead', name: 'Arrowhead Stadium', fifaName: 'Kansas City Stadium',
    city: 'Kansas City', cityShort: 'KC', country: 'US', capacity: 73000,
    timezone: 'America/Chicago', lat: 39.0489, lng: -94.4839,
  },
  linc: {
    id: 'linc', name: 'Lincoln Financial Field', fifaName: 'Philadelphia Stadium',
    city: 'Philadelphia', cityShort: 'PHI', country: 'US', capacity: 69000,
    timezone: 'America/New_York', lat: 39.9008, lng: -75.1675,
  },
};

/**
 * Exact `ground` strings from the openfootball file → stadium id.
 * schedule.ts logs a build error for any ground string not in this map.
 */
export const GROUND_TO_STADIUM: Record<string, string> = {
  'Mexico City': 'azteca',
  'Guadalajara (Zapopan)': 'akron',
  'Monterrey (Guadalupe)': 'bbva',
  'Toronto': 'bmo',
  'Vancouver': 'bcplace',
  'New York/New Jersey (East Rutherford)': 'metlife',
  'Los Angeles (Inglewood)': 'sofi',
  'Seattle': 'lumen',
  'San Francisco Bay Area (Santa Clara)': 'levis',
  'Dallas (Arlington)': 'att',
  'Houston': 'nrg',
  'Atlanta': 'mbs',
  'Miami (Miami Gardens)': 'hardrock',
  'Boston (Foxborough)': 'gillette',
  'Kansas City': 'arrowhead',
  'Philadelphia': 'linc',
};

export const HOST_COUNTRIES = {
  MX: { name: 'Mexico', short: 'MEX', flag: 'mx' },
  US: { name: 'USA', short: 'USA', flag: 'us' },
  CA: { name: 'Canada', short: 'CAN', flag: 'ca' },
} as const;
