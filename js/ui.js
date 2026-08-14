"use strict";
/** Панель: глубина, число сфер, ход накопления, переключатели уровней. */
class Panel {
    constructor(maxDepth, depth, visible, onDepth, onVisible) {
        this.visible = visible;
        this.onVisible = onVisible;
        this.groups = document.getElementById("groups");
        this.stat = document.getElementById("stat");
        this.progress = document.getElementById("bar");
        this.depthInput = document.getElementById("depth");
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
    rebuild(depth, total) {
        this.groups.replaceChildren(...Array.from({ length: depth + 1 }, (_unused, level) => {
            const label = document.createElement("label");
            label.innerHTML = `<input type="checkbox"${this.visible[level] ? " checked" : ""}> group_${level}`;
            label.firstChild.onchange = e => {
                this.onVisible(level, e.target.checked);
            };
            return label;
        }));
        this.stat.textContent = `${total.toLocaleString("ru")} сфер`;
    }
    /** Полоска показывает, насколько уточнена картинка. */
    setProgress(samples, maxSamples) {
        this.progress.style.width = `${Math.min(100, samples / maxSamples * 100)}%`;
    }
}
