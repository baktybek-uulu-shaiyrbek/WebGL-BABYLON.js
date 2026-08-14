/** Панель: глубина, число сфер, ход накопления, переключатели уровней. */
class Panel {
  private readonly depthInput: HTMLInputElement;
  private readonly groups: HTMLElement;
  private readonly stat: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly visible: boolean[];
  private readonly onVisible: (level: number, on: boolean) => void;

  constructor(
    maxDepth: number,
    depth: number,
    visible: boolean[],
    onDepth: (depth: number) => void,
    onVisible: (level: number, on: boolean) => void,
  ) {
    this.visible = visible;
    this.onVisible = onVisible;
    this.groups = document.getElementById("groups")!;
    this.stat = document.getElementById("stat")!;
    this.progress = document.getElementById("bar")!;
    this.depthInput = document.getElementById("depth") as HTMLInputElement;

    this.depthInput.max = String(maxDepth);
    this.depthInput.value = String(depth);
    this.depthInput.onchange = () => {
      const n = Vec.clamp(Math.round(+this.depthInput.value) || 0, 0, maxDepth);
      this.depthInput.value = String(n);
      onDepth(n);
    };
  }

  /**
   * Пересобирает список групп под текущую глубину. Состояние галочек берётся из
   * общего массива видимости, поэтому переживает смену глубины.
   */
  rebuild(depth: number, total: bigint): void {
    this.groups.replaceChildren(...Array.from({ length: depth + 1 }, (_unused, level) => {
      const label = document.createElement("label");
      label.innerHTML = `<input type="checkbox"${this.visible[level] ? " checked" : ""}> group_${level}`;
      (label.firstChild as HTMLInputElement).onchange = e => {
        this.onVisible(level, (e.target as HTMLInputElement).checked);
      };
      return label;
    }));
    this.stat.textContent = `${total.toLocaleString("ru")} сфер`;
  }

  /** Полоска показывает, насколько уточнена картинка. */
  setProgress(samples: number, maxSamples: number): void {
    this.progress.style.width = `${Math.min(100, samples / maxSamples * 100)}%`;
  }
}
