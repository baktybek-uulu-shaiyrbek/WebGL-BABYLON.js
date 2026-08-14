"use strict";
/**
 * Параметры фрактала и обход его дерева.
 *
 * Дерево неявное — его нигде не строят и не хранят. Узел уровня l имеет радиус
 * R0/2 * RL^l и шесть детей на расстоянии STEP0 * RL^l по осям координат, кроме
 * того направления, откуда в него пришли (иначе ребёнок сел бы внутрь родителя).
 *
 * Ключевое свойство: всё поддерево узла целиком умещается в сферу радиуса 3r.
 * Из a*r = 1.5r + a*0.5r следует a = 3. Граница точная и не завышена — на ней
 * держится всё отсечение и в шейдере, и здесь.
 */
class Fractal {
    constructor() {
        this.rootDiameter = 4096; // диаметр корневой сферы
        this.ratio = 0.5; // во сколько раз мельче следующий уровень
        // Предел глубины упирается в точность float32, а не в скорость. Габарит сцены
        // 6144, шаг разрядной сетки у её края 7.3e-4. На 14-м уровне радиус сферы 0.125,
        // то есть ошибка её центра — 0.6% радиуса: нормали и свет ещё чистые. На 17-м
        // радиус 0.0156, ошибка уже 4.7% — нормали плывут, картинка сыпется.
        this.maxDepth = 14;
        this.masks = [4, 2, 1, 6, 3, 5]; // цвета уровней по кругу: 100, 010, 001, 110, 011, 101
    }
    radius(level) {
        return this.rootDiameter / 2 * this.ratio ** level;
    }
    step(level) {
        return this.rootDiameter * (this.ratio + 1) / 2 * this.ratio ** level;
    }
    /** Габарит всей сцены: поддерево корня. */
    extent() {
        return 3 * this.radius(0);
    }
    /** Сколько сфер в дереве глубины n: 1 + 6*(5^n - 1)/4. В double не влезает. */
    total(depth) {
        return 1n + 6n * (5n ** BigInt(depth) - 1n) / 4n;
    }
    /**
     * Ближайшее пересечение луча с фракталом; возвращает расстояние или -1.
     * Тот же алгоритм, что в шейдере: явный стек, в каждом кадре стека маска
     * неперебранных детей и направление, которым сюда спустились.
     */
    pick(origin, dir, maxLevel, visible) {
        const stack = new Int32Array(this.maxDepth + 2);
        let best = 1e30;
        let centre = [0, 0, 0];
        let level = 0;
        // -1 — поддерево отсечено, 0 — сферу учли и хватит, 1 — учли и спускаемся
        const enter = (c, l) => {
            const ox = c[0] - origin[0], oy = c[1] - origin[1], oz = c[2] - origin[2];
            const b = ox * dir[0] + oy * dir[1] + oz * dir[2];
            const k = b * b - (ox * ox + oy * oy + oz * oz); // общая часть обоих пересечений
            const r = this.radius(l), rr = r * r;
            const hb = k + 9 * rr; // граница поддерева радиуса 3r
            if (hb < 0)
                return -1;
            const sb = Math.sqrt(hb);
            if (b + sb < 0)
                return -1;
            if (Math.max(b - sb, 0) >= best)
                return -1;
            if (visible[l]) {
                const hs = k + rr;
                if (hs >= 0) {
                    const t = b - Math.sqrt(hs);
                    if (t > 0 && t < best)
                        best = t;
                }
            }
            return l < maxLevel ? 1 : 0;
        };
        const first = enter(centre, 0);
        if (first < 0)
            return -1;
        stack[0] = (first === 1 ? 63 : 0) | (7 << 6);
        for (let guard = 0; guard < 1 << 20; guard++) {
            const mask = stack[level] & 63;
            if (mask === 0) { // дети кончились — назад к родителю
                if (level === 0)
                    break;
                const back = (stack[level] >> 6) & 7;
                level--;
                centre[back >> 1] -= ((back & 1) ? 1 : -1) * this.step(level);
                continue;
            }
            let n = 0;
            while (!((mask >> n) & 1))
                n++;
            stack[level] &= ~(1 << n);
            const child = centre.slice();
            child[n >> 1] += ((n & 1) ? 1 : -1) * this.step(level);
            const down = enter(child, level + 1);
            if (down >= 0) {
                centre = child;
                level++;
                stack[level] = (down === 1 ? (63 & ~(1 << (n ^ 1))) : 0) | (n << 6);
            }
        }
        return best < 1e29 ? best : -1;
    }
}
