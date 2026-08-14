/** Небольшая векторная арифметика — ровно то, что нужно камере. */
class Vec {
  static norm(a: number[]): number[] {
    const len = Math.hypot(a[0], a[1], a[2]);
    return [a[0] / len, a[1] / len, a[2] / len];
  }
  static cross(a: number[], b: number[]): number[] {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  static clamp(v: number, lo: number, hi: number): number {
    return Math.min(hi, Math.max(lo, v));
  }
}

/**
 * Камера: орбита вокруг точки target, зум в точку под курсором, полёт с клавиатуры.
 *
 * Положение выводится из target: eye = target + radius * dir(alpha, beta). Поэтому и
 * вращение, и движение сводятся к изменению target — камера следует за ним сама.
 */
class Camera {
  alpha = 0;
  beta = Math.PI / 2;
  radius: number;
  target = [0, 0, 0];

  /** клавиша -> [ось: f вперёд / x вбок, знак] */
  private static readonly MOVE: Record<string, [string, number]> = {
    KeyW: ["f", 1], ArrowUp: ["f", 1],
    KeyS: ["f", -1], ArrowDown: ["f", -1],
    KeyA: ["x", -1], ArrowLeft: ["x", -1],
    KeyD: ["x", 1], ArrowRight: ["x", 1],
  };

  private readonly canvas: HTMLCanvasElement;
  private readonly scale: number;
  private readonly probe: (origin: number[], dir: number[]) => number;
  private readonly onChange: () => void;
  private readonly pressed = new Set<string>();

  /**
   * @param scale  характерный размер сцены: от него берутся пределы зума и скорость полёта
   * @param probe  расстояние до поверхности вдоль луча, нужно для зума в точку под курсором
   */
  constructor(
    canvas: HTMLCanvasElement,
    scale: number,
    probe: (origin: number[], dir: number[]) => number,
    onChange: () => void,
  ) {
    this.canvas = canvas;
    this.scale = scale;
    this.probe = probe;
    this.onChange = onChange;
    this.radius = scale * 3.9;             // такое же кадрирование, как у исходной сцены

    let dragging = false;
    canvas.onpointerdown = e => { dragging = true; canvas.setPointerCapture(e.pointerId); };
    canvas.onpointerup = () => { dragging = false; };
    canvas.onpointermove = e => {
      if (!dragging) return;
      this.alpha += e.movementX / 300;
      this.beta = Vec.clamp(this.beta - e.movementY / 300, 0.01, Math.PI - 0.01);
      onChange();
    };
    canvas.onwheel = e => {
      e.preventDefault();
      this.zoom(e.offsetX, e.offsetY, 1 + e.deltaY / 500);
    };

    addEventListener("keydown", e => {
      // иначе стрелки в поле глубины двигали бы камеру
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (!Camera.MOVE[e.code] || e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      this.pressed.add(e.code);
      onChange();
    });
    addEventListener("keyup", e => { this.pressed.delete(e.code); });
    addEventListener("blur", () => { this.pressed.clear(); });
  }

  /** Направление от цели к камере. */
  dir(): number[] {
    return [
      Math.cos(this.alpha) * Math.sin(this.beta),
      Math.cos(this.beta),
      Math.sin(this.alpha) * Math.sin(this.beta),
    ];
  }

  eye(): number[] {
    const d = this.dir();
    return [0, 1, 2].map(k => this.target[k] + this.radius * d[k]);
  }

  /** [вправо, вверх, вперёд]; dir смотрит от цели к камере, поэтому вперёд это -dir. */
  basis(): number[][] {
    const z = this.dir();
    const x = Vec.norm([z[2], 0, -z[0]]);   // cross([0,1,0], z); вырождается лишь при взгляде строго вверх
    return [x, Vec.cross(z, x), [-z[0], -z[1], -z[2]]];
  }

  /** Луч через точку холста, заданную в CSS-пикселях. */
  rayAt(px: number, py: number): number[] {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight, tan = Math.tan(0.4);
    const [x, y, f] = this.basis();
    const sx = (px / w * 2 - 1) * (w / h) * tan;
    const sy = (1 - py / h * 2) * tan;
    return Vec.norm([0, 1, 2].map(k => f[k] + x[k] * sx + y[k] * sy));
  }

  /**
   * Масштабирование сцены относительно точки под курсором: она остаётся на месте
   * экрана, потому что вектор от глаза до неё умножается ровно на тот же множитель,
   * что и радиус, а базис не меняется.
   */
  zoom(px: number, py: number, factor: number): void {
    const origin = this.eye();
    const dir = this.rayAt(px, py);
    const t = this.probe(origin, dir);
    const anchor = [0, 1, 2].map(k => origin[k] + dir[k] * (t > 0 ? t : this.radius));

    const next = Vec.clamp(this.radius * factor, this.scale * 1e-6, this.scale * 16);
    const applied = next / this.radius;
    this.target = [0, 1, 2].map(k => anchor[k] + (this.target[k] - anchor[k]) * applied);
    this.radius = next;

    const far = this.scale * 4.7;           // на полном отдалении мягко возвращаем центр
    if (this.radius > far) {
      const k = Math.min(1, (this.radius - far) / (far * 1.5));
      this.target = this.target.map(v => v * (1 - k));
    }
    this.onChange();
  }

  /**
   * Шаг полёта с клавиатуры; возвращает true, пока клавиши зажаты. Скорость
   * пропорциональна масштабу, поэтому у мелких веток движение такое же плавное,
   * как вдали от всего фрактала.
   */
  step(): boolean {
    if (this.pressed.size === 0) return false;
    const [x, , f] = this.basis();
    const speed = this.radius * 0.02;
    for (const key of this.pressed) {
      const [axis, sign] = Camera.MOVE[key];
      const d = axis === "f" ? f : x;
      this.target = this.target.map((v, i) => v + d[i] * sign * speed);
    }
    return true;
  }
}
