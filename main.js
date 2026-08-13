const N = 4, RL = .5, R0 = 256, C = [4, 2, 1, 6, 3];   // C[l] — битовая маска RGB уровня: 100, 010, 001, 110, 011
const DIRS = [[-1,0,0], [1,0,0], [0,-1,0], [0,1,0], [0,0,-1], [0,0,1]];
const engine = new BABYLON.Engine(document.getElementById("renderCanvas"), true);
const scene = new BABYLON.Scene(engine);
const gui = new dat.GUI({ closeOnTop: true, width: 190 });
scene.clearColor = BABYLON.Color3.White();
new BABYLON.ArcRotateCamera("", 0, Math.PI / 2, 1000, BABYLON.Vector3.Zero(), scene).attachControl(false);
[[1, .7], [-1, .2]].forEach(([y, i]) => new BABYLON.HemisphericLight("", new BABYLON.Vector3(0, y, 0), scene).intensity = i);

let pts = [[0, 0, 0, -1]];                             // [x, y, z, индекс направления «назад»]
for (let l = 0, r = R0, d = R0 * (RL + 1) / 2; l <= N; l++, r *= RL, d *= RL) {
  const m = BABYLON.MeshBuilder.CreateSphere(`${l}`, { diameter: r, segments: 16 }, scene);
  m.material = Object.assign(new BABYLON.StandardMaterial("", scene),{ diffuseColor: new BABYLON.Color3(...[2, 1, 0].map(b => .1 + .6 * (C[l] >> b & 1))) });
  m.thinInstanceSetBuffer("matrix", Float32Array.from(pts.flatMap(([x, y, z]) => [1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1])), 16);
  gui.add({ [`group_${l}`]: true }, `group_${l}`).onChange(v => m.isVisible = v);
  pts = pts.flatMap(([x, y, z, b]) => DIRS.map(([i, j, k], n) => [x + i*d, y + j*d, z + k*d, n ^ 1]).filter((_, n) => n !== b));
}

engine.runRenderLoop(() => scene.render());
addEventListener("resize", () => engine.resize());