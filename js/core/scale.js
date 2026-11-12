// Everything in FrogFood is in true units: millimetres and seconds. The fly is 2.5 mm long, so to a person
// standing 1.7 m tall the world is magnified by about 680x. The renderer never rescales anything: the
// cathedral feeling comes from putting the camera where a fly's head is.

export const MM = 1;
export const FLY_LENGTH = 2.5;          // mm, a D. melanogaster male
export const HUMAN_HEIGHT = 1700;       // mm, for the "at your scale" read-outs
export const SCALE = HUMAN_HEIGHT / FLY_LENGTH;   // ~680
export const EYE_HEIGHT = 0.75;         // mm above the substrate: the head of a standing fly

export const TANK = { w: 450, d: 450, h: 600, x0: -225, x1: 225, z0: -225, z1: 225 };   // a 45x45x60 cm vivarium

// how big something would look to a person, given its true size in mm
export function humanEquivalent(mm) {
  const m = mm * SCALE / 1000;
  return m >= 1000 ? (m / 1000).toFixed(1) + ' km' : m >= 1 ? Math.round(m) + ' m' : Math.round(m * 100) + ' cm';
}

// small-scale physics (see README "Scale is the game")
export const PHYS = {
  g: 9810,                 // mm/s^2
  // Air is thick at this size: drag is linear in speed (low Reynolds number) and strong.
  // A falling fly-sized body reaches terminal velocity within a few body lengths, so falls are survivable.
  dragVert: 12,            // 1/s: terminal speed g/dragVert ~ 820 mm/s (stylised; a real fly's is a few m/s)
  dragHoriz: 5,            // 1/s, while airborne
  walk: 9,                 // mm/s (~4 body lengths/s)
  run: 24,                 // mm/s
  jumpUp: 420,             // mm/s take-off (the giant-fibre escape jump, legs only: this strain cannot fly): ~7 mm high
  jumpFwd: 160,            // mm/s: ~12 mm forward
  climb: 4.0,              // mm: a step this high is just walked up (flies climb anything rough)
  bodyRadius: 0.9,         // mm, for collisions
};

export const TIME = {
  day: 180,                // real seconds per 24 h vivarium day
  lightsOn: 0.25,          // fraction of the day: 06:00
  lightsOff: 0.8125,       // 19:30
  start: 0.32,             // the keeper drops the feeder flies in at ~07:40
  lifeDays: 5,             // compressed life, in vivarium days
  mist: [0.26, 0.55],      // misting system runs at 06:15 and 13:12
  mistDuration: 7,         // real seconds
};
