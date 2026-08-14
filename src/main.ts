/**
 * Сборка приложения.
 *
 * Фрактал трассируется лучами: геометрии и буферов сфер нет, память не зависит от
 * глубины. Порога детализации тоже нет — все сферы всех уровней до текущей глубины
 * участвуют всегда, поэтому при зуме ничего не появляется и не исчезает.
 *
 * Кадр не рисуется вхолостую: он запрашивается, только когда картинка должна
 * измениться, либо пока идёт накопление выборок и полёт с клавиатуры.
 */
class App {
  private readonly canvas: HTMLCanvasElement;
  private readonly fractal = new Fractal();
  private readonly renderer: Renderer;
  private readonly camera: Camera;
  private readonly panel: Panel;
  private readonly visible: boolean[];
  private depth = 8;
  private queued = false;

  constructor() {
    this.canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
    this.visible = new Array(this.fractal.maxDepth + 1).fill(true);

    this.renderer = new Renderer(this.canvas, this.fractal);
    this.camera = new Camera(
      this.canvas,
      this.fractal.rootDiameter,
      (origin, dir) => this.fractal.pick(origin, dir, this.depth, this.visible),
      () => this.invalidate(),
    );
    this.panel = new Panel(
      this.fractal.maxDepth,
      this.depth,
      this.visible,
      depth => { this.depth = depth; this.applyDepth(); },
      (level, on) => { this.visible[level] = on; this.renderer.setVisible(this.visible); this.request(); },
    );

    new ResizeObserver(() => this.request()).observe(this.canvas);
  }

  start(): void {
    this.applyDepth();
  }

  private applyDepth(): void {
    this.renderer.setDepth(this.depth);
    this.renderer.setVisible(this.visible);
    this.panel.rebuild(this.depth, this.fractal.total(this.depth));
    this.request();
  }

  /** Картинка устарела: копить заново. */
  private invalidate(): void {
    this.renderer.reset();
    this.request();
  }

  private request(): void {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => this.frame());
  }

  private frame(): void {
    this.queued = false;
    const flying = this.camera.step();
    if (flying) this.renderer.reset();

    const width = Math.floor(this.canvas.clientWidth * devicePixelRatio);
    const height = Math.floor(this.canvas.clientHeight * devicePixelRatio);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.renderer.resize(width, height);   // сам решит, менялся ли размер накопителя

    this.renderer.draw(this.camera.eye(), this.camera.basis(), width / height);
    this.panel.setProgress(this.renderer.samples, this.renderer.maxSamples);

    if (flying || !this.renderer.done) this.request();
  }
}

new App().start();
