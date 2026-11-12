# FrogFood

A short life as a flightless male fruit fly in a dart-frog vivarium. First person, at true scale. **The only way to win is to breed.**

Play: **https://samuelling.github.io/Frog-food/** (static site on GitHub Pages: main branch, root folder, no build step).

You are a male *Drosophila melanogaster*, 2.5 mm long, from a strain bred not to fly. The keeper tips you, dusted in calcium powder, into a 45 × 45 × 60 cm frog tank, which to you is a cathedral forest about 300 m wide under a 400 m sky. You need to drink, eat, stay damp, survive the frogs, and find a willing female. Your life is short. A vivarium day passes in 3 minutes, and after 5 days you die of old age.

## How to play

| | Desktop | Phone / tablet |
|---|---|---|
| Look | mouse (click the view to capture it) | drag the right half of the screen |
| Walk / run | WASD, hold Shift to run | left stick (push to the edge to run, or toggle Run) |
| Jump (or struggle free) | Space | Jump |
| Drink / eat / tap / lick / mount / shove a rival | E | E |
| Groom | G, then alternate A / D to sweep and W to rub your legs | Groom, then ◀ ▶ and Rub |
| Pulse song | left click or J: tap a steady tempo | ♪ Pulse |
| Sine song | hold right button or K | hold ~ Hum |
| Fly-eye view (the FlyHarp input) | V | — |
| Help / pause / mute | H / P (or Esc) / M | II |

**Goals** (top right):
- **Shake off the dust.** Grooming goes head first: eyes (clears your vision), then antennae (restores smell), then abdomen, wings (strengthens your song) and notum.
- **Find water.** Walk slowly up to a mist droplet or the pond edge and press E to drink. If you run, jump or fall into a droplet, surface tension holds you, and you mash Space to get out.
- **Eat fermenting fruit.** Follow the vinegar plume upwind to the banana in the dish, climb on and press E. The left and right antenna bars show the odour, and the arrow shows which way the air is moving.
- **Wait out the mist somewhere humid.** Twice a day the misting system rains droplets the size of beach balls. When it does, or when the lights go out, shelter under a broad leaf or in the moss.
- **Survive a frog strike.**
- **Win a mate.** This is the only goal you need. Death by frog, drying out, starving, drowning or old age ends the game.

**Frogs see motion.** If you freeze, a frog loses you unless you are almost under its chin. When a frog fixates you, its toes start tapping (real dendrobatid behaviour), your looming detectors fire, and the game drops into slow motion. At that point, jump away from the frog. The tongue goes out and back in about 0.2 s.

**Courtship** is a skill game in six steps:
1. **Orient:** hold her centred in your view.
2. **Follow:** stay 2–7 mm behind her as she walks.
3. **Tap:** press E within 3 mm. Your foreleg tastes her: 7,11-HD means virgin; cVA and 7-T mean she has already mated.
4. **Sing.** Tap a steady tempo. Each tap sets the wing's pulse generator, which sings 10× faster than you tap, so tapping every 350 ms gives 35 ms between pulses, the interval females prefer. Hold the hum key for sine song between pulse trains. Song is near-field, so stay within a few mm.
5. **Lick:** once she slows, get right behind her and press E.
6. **Mount:** press E once her vaginal plate opens. If you mount too early, she kicks you off.

Mated females extrude their ovipositor at you and walk off. A rival male courts the virgins too, and his song scrambles yours. Shove him away with E.

## Scale is the game

Everything is in true millimetres and seconds (`js/core/scale.js`). The camera sits 0.75 mm off the substrate, at the height of a standing fly's head, so:
- soil grains are boulders and moss is a forest of bottle-brush trees;
- a 1 mm mist droplet is a beach ball, and droplets are lenses;
- a fern stem is a tree trunk and a bromeliad is a skyscraper with a lake in its cup;
- a 3 cm dart frog is a 20 m giant;
- the glass walls are distant misty cliffs, and the lid's mesh and LED bar are the sky and the sun.

Small-scale physics drives the gameplay:
- Air is thick: drag is strong and linear, so falls are survivable. Terminal speed is stylised at about 0.8 m/s.
- Surface tension makes droplets into traps.
- A legs-only escape jump goes about 7 mm up.
- A frog's tongue reaches 2/3 of its body length in 65 ms.

## The neuroscience: what is real and what is schematic

**Real connectome model**
- **The female's ears.** She hears your song through FlyHarp's Tonnectome: the FlyWire v783 auditory network (4,222 neurons, 1.35 M synapses: Johnston's organ, AMMC, saddle, wedge, AVLP/PVLP, GNG), run as a connectome-constrained rate network (`js/ear/ear-net.js`, copied from FlyHarp unchanged).
  - The song reaches her antennae as ideal filterbank frames, one per 5 ms, made by Opulation's `Framer` (`js/core/song.js`, copied from Opulation) from the pulses you actually sang (true pitch: 270 Hz pulses, 155 Hz sine).
  - The network runs in a Web Worker (`js/ear/ear-worker.js`).
  - Her song-pathway drive is the mean rate of the 32 AVLP/PVLP/WED neurons that respond most to pulse song. It sets how strongly she hears you.
  - The HUD shows her areas' activity live, and the music plays it: each area voices one note of a chord built on your hum.
  - Honest caveats:
    - In this rate model the drive barely depends on IPI. It does depend on singing, loudness (compressively) and adaptation.
    - The vaginal-plate-opening neurons (vpoEN) stay silent for song alone.
- **What the fly sees (optional, through the hook).** The first-person view can be sampled onto the 721 ommatidia of FlyHarp's flyvis eye (Lappalainen et al. 2024; columns from FlyHarp's `data/fly.json`) in FlyHarp's input format (see below). v1 exports and previews these frames (V key) but does not yet run the optic-lobe model in the game.

**Schematic (literature-based, not connectome wiring)**
- **Her song preference.** Females prefer IPIs near 35 ms (Gaussian, SD 7.5 ms), regular trains and some sine song. This stands in for the pattern tuning found in pC1 and vpoEN (Deutsch et al. 2019; Wang et al. 2021), which the rate model above does not reproduce.
  - Receptivity rises with drive × song quality and decays without song.
  - Song slows her down (Bussell et al. 2014; Coen et al. 2014). At high receptivity she opens her vaginal plate (vpoDN; Wang et al. 2021).
  - Mated females carry cVA and reject: ovipositor extrusion, kicking, decamping (Mezzera et al. 2020).
- **Your courtship circuit** (`js/core/male.js`, copied from Opulation). FlyWire is a female brain, so P1, pIP10 and the VNC song circuits are not in its data. A small labelled rate model drives the HUD:
  - LC10a (seeing her) and ppk23 → vAB3 (tasting her) → P1, the courtship decision hub (Kohatsu & Yamamoto 2015; Clowney et al. 2015)
  - → pIP10, the song command (von Philipsborn et al. 2011)
  - → dPR1 and vPR6 for pulse song, TN1A for sine song (Shirangi et al. 2016; Lillvis et al. 2024, MANC)
  - → the wing.
- **Looming → escape.** LPLC2 / giant-fibre detection is computed geometrically from each frog's angular size and expansion with an η-function, `dθ/dt · exp(−αθ)` (Gabbiani et al. 1999; Klapoetke et al. 2017; von Reyn et al. 2014). The escape jump is aimed away from the loom. When the GF fires, the game slows down; this stands in for the fly's much faster vision.
- **Smell.** Plumes are intermittent filaments carried by the tank's airflow. The antennae compare left and right, with the separation exaggerated for playability. Odours:
  - fruit: acetic acid and ethanol;
  - females: (Z)-4-undecenal, Lebreton et al. 2017;
  - close-range cVA on mated females (Or67d).
- **Grooming** follows the anterior-to-posterior suppression hierarchy (Seeds et al. 2014): sweeps move dust onto the legs, and leg rubs shed it.
- **Frog behaviour** follows what is known of anuran prey capture: motion-triggered detection, which loses still prey (Lettvin et al. 1959; Ewert); orient → approach → fixate (with toe-tapping) → ballistic tongue; sleeping at night.

## The FlyHarp hook

The end goal is to route the first-person view through FlyHarp's visual system, so that frog encounters are musical. v1 has the plumbing (`js/render/eyesample.js`, `js/render/flyeye.js`), exposed as `window.FrogFood.flyharp`:

```js
const hook = window.FrogFood.flyharp;
hook.enable(true);              // render eye frames at 50 Hz (one per 20 ms flyvis step)
hook.exportFrame();             // -> {lum: Float32Array(721), t, pose}
const off = hook.onFrame(f => ...);
hook.connectWorker(worker);     // a FlyHarp js/worker.js: frames are batched as {cmd:'run', frames:[Float32Array(721), ...]}
hook.raw = true;                // absolute luminance instead of re-centring on grey (use with FlyHarp's photoreceptor adaptation)
```

How a frame is made:
1. A second, wide camera (150°, 96 × 96 px) renders from the fly's eye.
2. Each of the 721 columns looks 4.784° from its neighbours. That is the median interommatidial angle in FlyHarp's `data/eyemap.json`.
3. The lattice positions are computed exactly as FlyHarp's engine does: `x = 1.5 v/√3`, `y = −(u + v/2)`, with +y dorsal and +x to the right of view.
4. Each column takes the 3 × 3 box-filtered Rec. 709 luminance at its viewing direction.
5. By default each frame is re-centred on 0.5, as FlyHarp's webcam path does.

To close the loop in FlyHarp, either:
- add a "FrogFood" stimulus source that receives these frames (for example over `postMessage` from an embedding page, or a BroadcastChannel), or
- vendor FlyHarp's `engine.js`, `gain.js`, `worker.js` and `data/fly.json` here and drive the worker directly.

Then read out T4/T5 (motion) and an LPLC2-like pooling of outward motion in place of the geometric loom detector.

## Code map

```
index.html, css/style.css
js/main.js            wiring: game + renderer + audio + ear worker + hook
js/core/              pure logic, runs in Node (tests)
  scale.js            units, physics constants, the life clock's timings
  world.js            the vivarium: terrain, features, droplets, humidity, odour plumes
  fly.js              your body: walk, run, jump, drag, droplet traps
  frog.js             dart frogs: detect by motion, stalk, toe-tap, strike
  loom.js             LPLC2 / giant-fibre (schematic)
  npc.js              females (receptivity), rival male, siblings
  courtship.js        the six-step courtship game
  songadapter.js      your taps -> pulse/sine song (IPI = tap interval / 10)
  song.js, male.js    copied from Opulation (song framer; schematic male circuit)
  missions.js         grooming (Seeds et al. 2014) and the goals
  lifeclock.js        days, lights, misting
  game.js             the rules, tying it all together
js/ear/               the female's ears: ear-net.js (FlyHarp's EarNet), female-ear.js, ear-worker.js
js/render/            three.js r181 (vendored): toon shading, scene, near-field detail, actors, FlyHarp hook
js/audio.js           Web Audio: true-pitch song, her brain's chord, loom drone, frog calls
data/                 ear.json + ear.bin (FlyWire auditory network, from FlyHarp), fly.json (flyvis columns, from FlyHarp), song-model.json (from Opulation)
tools/test.mjs        39 headless checks (npm test)
tools/smoke.mjs       headless Chrome: loads the game, fails on console errors, writes screenshots to shots/
```

## Development

There is no build step: serve the folder and open `index.html`. Optional query parameters:
- `?seed=N` makes a different tank.
- `?autostart` skips the title screen.

```
npm install                      # only for the headless-browser smoke test (puppeteer-core)
npm test                         # game logic, song -> Tonnectome, courtship, frogs, grooming (Node 22)
node tools/smoke.mjs [chrome]    # renderer/shaders/worker in headless Chrome + screenshots
```

## Status (v1)

Playable:
- one tank, a full day/night cycle with misting, and the five goals;
- two frogs (*D. tinctorius* "azureus" and *D. leucomelas*), three females (one already mated), a rival male, siblings and keeper restocking;
- the whole courtship with sound, and the Tonnectome-driven female;
- the FlyHarp frame export and fly-eye preview.

Not yet:
- running FlyHarp's optic-lobe model on the frames;
- climbing walls and leaves (the fly walks a heightfield; leaves are shelter overhead);
- a second level;
- tuning from real play on phones.

All playtesting so far has been headless (Node simulations plus SwiftShader screenshots), so difficulty, pacing and audio still need human ears and hands.

## Credits and provenance

- FlyHarp (samuelling/FlyHarp):
  - `js/ear/ear-net.js`;
  - `data/ear.json` and `data/ear.bin`, built from FlyWire v783 (Dorkenwald et al. 2024; Schlegel et al. 2024);
  - `data/fly.json`, the flyvis model of Lappalainen et al. 2024.
- Opulation (samuelling/Opulation):
  - `js/core/song.js` and `js/core/male.js`;
  - the song constants in `data/song-model.json`.
- three.js r181 (MIT), vendored.
- Everything visual is procedural. The frogs are original designs coloured like real dart-frog morphs.
