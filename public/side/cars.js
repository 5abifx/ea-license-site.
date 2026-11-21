// The garage cars (picked in Appearance, look.car), shared by the 3D garage (garage.js) and the journal intro
// (nightrun.js). Each model is one scanned mesh; the wheels are cut out of it by position:
// axles [centre x, centre y, radius, rear?] in the model's own units (+x is the rear, -x the nose), zCut = how far out a
// point must be to count as wheel, zMid = the wheel's centre plane, zFace = its outer face (for the speed blur disc).
// head / tail = lamp points (one side; mirrored in z) for the intro's lights. No badges or logos on any model.
export const CARS = {
  hyper: { glb: '/side/car.glb', len: 2.5, axles: [[0.627, -0.08, 0.162, true], [-0.563, -0.09, 0.152, false]], zCut: 0.26, zMid: 0.36, zFace: 0.452,
    head: [-0.97, -0.03, 0.3], tail: [0.99, 0.02, 0.3], engine: 'hyper' },
  gwagon: { glb: '/side/gwagon.glb', len: 2.35, axles: [[0.565, -0.219, 0.19, true], [-0.652, -0.231, 0.182, false]], zCut: 0.29, zMid: 0.36, zFace: 0.428,
    head: [-0.98, 0.02, 0.3], tail: [0.88, 0.0, 0.38], engine: 'g63' },
};
export const pickCar = () => CARS[(window.__LOOK && window.__LOOK.car) || 'hyper'] || CARS.hyper;
