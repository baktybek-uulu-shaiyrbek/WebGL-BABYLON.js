"use strict";
/**
 * Исходники GLSL.
 *
 * Геометрии нет: вершинный шейдер рисует один треугольник на весь экран, всю работу
 * делает фрагментный. Каждый пиксель трассирует луч по неявному дереву фрактала,
 * затем светит его солнцем с настоящей тенью, небом и затенением в складках.
 *
 * Кадр копится: каждый проход добавляет одну выборку со сдвигом внутри пикселя
 * в float-текстуру, а проход показа делит на число выборок и применяет гамму.
 * Поэтому сглаживание и мягкие тени появляются сами, стоит перестать двигать камеру.
 */
class Shaders {
    /** float-литерал GLSL обязан иметь десятичную точку: "1" не приведётся к float */
    static f(v) {
        return v.toFixed(6);
    }
    static trace(fractal) {
        const sun = Vec.norm([0.5, 0.85, 0.35]); // нормируем здесь, а не в const-инициализаторе GLSL
        return `#version 300 es
    precision highp float;
    precision highp int;

    in vec2 uv;
    uniform vec3 eye;
    uniform mat3 cam;                        // столбцы: вправо, вверх, вперёд
    uniform float tanHalf, aspect;
    uniform vec2 pixel;                      // размер пикселя в координатах NDC
    uniform int maxLevel, visMask, seed;     // visMask: бит l = уровень l виден
    out vec4 outColor;

    const int MASKS[6] = int[6](${fractal.masks.join(', ')});
    const float RAD0  = ${this.f(fractal.radius(0))};
    const float STEP0 = ${this.f(fractal.step(0))};
    const float FAR   = ${this.f(fractal.extent() * 4.0)};
    const vec3  SUN   = vec3(${this.f(sun[0])}, ${this.f(sun[1])}, ${this.f(sun[2])});
    const vec3  SUN_COLOR = vec3(1.05, 0.98, 0.88);

    struct Hit {
      float t;
      int level;
      vec3 centre;
      float radius;
    };

    // ---------- генератор случайных чисел (PCG) ----------
    uint rngState;
    float rnd() {
      rngState = rngState * 747796405u + 2891336453u;
      uint r = ((rngState >> ((rngState >> 28) + 4u)) ^ rngState) * 277803737u;
      return float((r >> 22) ^ r) * (1.0 / 4294967296.0);
    }

    vec3 dirv(int n) {
      vec3 v = vec3(0.);
      v[n >> 1] = (n & 1) == 1 ? 1. : -1.;
      return v;
    }

    // Один заход в узел. Обе сферы считаются разом: общая часть уравнения
    // пересечения k = b^2 - |oc|^2 от радиуса не зависит.
    //   -1 — поддерево отсечено целиком
    //    0 — сферу учли, глубже не идём
    //    1 — сферу учли, спускаемся к детям
    int enter(vec3 ro, vec3 rd, vec3 c, int l, inout Hit h) {
      vec3 oc = c - ro;
      float b = dot(oc, rd);
      float k = b * b - dot(oc, oc);
      float r = RAD0 * exp2(-float(l));
      float rr = r * r;

      float hb = k + 9. * rr;                // граница поддерева: сфера радиуса 3r
      if (hb < 0.) return -1;                // луч мимо всей ветки
      float sb = sqrt(hb);
      if (b + sb < 0.) return -1;            // ветка позади луча
      if (max(b - sb, 0.) >= h.t) return -1; // ветка дальше уже найденного

      if (((visMask >> l) & 1) == 1) {
        float hs = k + rr;
        if (hs >= 0.) {
          float t = b - sqrt(hs);            // луч начался внутри сферы -> t < 0, её нет
          if (t > 0. && t < h.t) { h.t = t; h.level = l; h.centre = c; h.radius = r; }
        }
      }
      return l < maxLevel ? 1 : 0;
    }

    // anyHit — для теневых лучей: достаточно любого попадания, дальше не ищем.
    Hit trace(vec3 ro, vec3 rd, float tmax, bool anyHit) {
      Hit h;
      h.t = tmax; h.level = -1; h.centre = vec3(0.); h.radius = 1.;

      // Кадр стека: биты 0..5 — неперебранные дети, биты 6..8 — направление,
      // которым спустились (нужно, чтобы на возврате вычесть смещение).
      int st[${fractal.maxDepth + 2}];
      int first = enter(ro, rd, vec3(0.), 0, h);
      if (first < 0) return h;
      st[0] = (first == 1 ? 63 : 0) | (7 << 6);

      int l = 0;
      vec3 c = vec3(0.);
      for (int guard = 0; guard < 65536; guard++) {
        if (anyHit && h.level >= 0) break;
        int m = st[l] & 63;
        if (m == 0) {                        // дети кончились — назад к родителю
          if (l == 0) break;
          int back = (st[l] >> 6) & 7;
          l--;
          c -= dirv(back) * (STEP0 * exp2(-float(l)));
          continue;
        }
        int n = 0;
        for (int i = 0; i < 6; i++) if (((m >> i) & 1) == 1) { n = i; break; }
        st[l] &= ~(1 << n);

        vec3 child = c + dirv(n) * (STEP0 * exp2(-float(l)));
        int down = enter(ro, rd, child, l + 1, h);
        if (down >= 0) {
          c = child; l++;
          st[l] = (down == 1 ? (63 & ~(1 << (n ^ 1))) : 0) | (n << 6);
        }
      }
      return h;
    }

    // ---------- освещение ----------
    vec3 sky(vec3 d) {
      return vec3(.050, .055, .075) + vec3(.10, .115, .15) * (.5 + .5 * d.y);
    }

    void basisOf(vec3 n, out vec3 t, out vec3 b) {
      vec3 a = abs(n.z) < .9 ? vec3(0., 0., 1.) : vec3(1., 0., 0.);
      t = normalize(cross(a, n));
      b = cross(n, t);
    }

    vec3 albedoOf(int level) {
      int m = MASKS[level - 6 * (level / 6)];
      vec3 raw = vec3(.1) + .6 * vec3(float((m >> 2) & 1), float((m >> 1) & 1), float(m & 1));
      return mix(raw, vec3(dot(raw, vec3(1. / 3.))), .22);   // чуть приглушаем неон
    }

    vec3 shade(vec3 ro, vec3 rd) {
      Hit h = trace(ro, rd, FAR, false);
      if (h.level < 0) return sky(rd);

      vec3 p = ro + rd * h.t;
      vec3 n = (p - h.centre) / h.radius;

      // Сдвиг от поверхности, иначе теневой луч поймает ту же сферу и точка почернеет.
      // Одной доли радиуса мало: на мелких уровнях она оказывается меньше шага
      // разрядной сетки float32, и точка просто не сходит с поверхности.
      float grid = (h.t + length(h.centre)) * 1.2e-7;      // ~2^-23 от порядка координат
      vec3 origin = p + n * max(h.radius * .02, grid * 6.);

      // Солнце — не точка, а маленький диск: направление слегка дрожит на каждой
      // выборке, поэтому тени получаются с мягким краем, а не с рваным.
      vec3 sun = normalize(SUN + (vec3(rnd(), rnd(), rnd()) - .5) * ${this.f(0.035)});
      float ndl = max(dot(n, sun), 0.);
      float lit = (ndl > 0. && trace(origin, sun, FAR, true).level >= 0) ? 0. : 1.;

      // затенение в складках: один косинусный луч по полусфере на выборку,
      // мягкость набирается накоплением кадров
      vec3 tx, ty;
      basisOf(n, tx, ty);
      float u1 = rnd(), u2 = rnd();
      float sr = sqrt(u1), phi = 6.28318530718 * u2;
      vec3 around = tx * (sr * cos(phi)) + ty * (sr * sin(phi)) + n * sqrt(max(0., 1. - u1));
      float open = trace(origin, around, h.radius * 12., true).level >= 0 ? 0. : 1.;

      vec3 ambient = vec3(.10, .11, .14) + vec3(.16, .18, .24) * (n.y * .5 + .5);
      float spec = .30 * lit * ndl * pow(max(dot(n, normalize(sun - rd)), 0.), 64.);

      return albedoOf(h.level) * (SUN_COLOR * ndl * lit * 2.3 + ambient * open * 4.0)
           + SUN_COLOR * spec;
    }

    void main() {
      rngState = uint(gl_FragCoord.x) + uint(gl_FragCoord.y) * 1973u + uint(seed) * 9277u;
      rnd();                                                  // раскачиваем состояние
      vec2 q = uv + (vec2(rnd(), rnd()) - .5) * pixel;        // сдвиг внутри пикселя -> сглаживание
      vec3 rd = normalize(cam * vec3(q.x * aspect * tanHalf, q.y * tanHalf, 1.));
      outColor = vec4(shade(eye, rd), 1.);
    }`;
    }
}
Shaders.screenTriangle = `#version 300 es
    out vec2 uv;
    void main() {
      vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2. - 1.;
      uv = p;
      gl_Position = vec4(p, 0., 1.);
    }`;
/** Проход показа: делит накопленное на число выборок и применяет гамму. */
Shaders.present = `#version 300 es
    precision highp float;
    uniform sampler2D accum;
    uniform float invSamples;
    out vec4 outColor;
    void main() {
      vec3 c = texelFetch(accum, ivec2(gl_FragCoord.xy), 0).rgb * invSamples;
      outColor = vec4(pow(clamp(c, 0., 1.), vec3(1. / 2.2)), 1.);
    }`;
