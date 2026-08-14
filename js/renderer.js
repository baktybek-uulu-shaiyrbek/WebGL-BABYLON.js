"use strict";
/** Скомпилированная программа вместе с адресами её uniform-ов. */
class Program {
    constructor(gl, vertexSource, fragmentSource) {
        this.slots = new Map();
        this.gl = gl;
        const compile = (type, source) => {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                throw new Error(gl.getShaderInfoLog(shader) ?? "не удалось собрать шейдер");
            }
            return shader;
        };
        this.handle = gl.createProgram();
        gl.attachShader(this.handle, compile(gl.VERTEX_SHADER, vertexSource));
        gl.attachShader(this.handle, compile(gl.FRAGMENT_SHADER, fragmentSource));
        gl.linkProgram(this.handle);
        if (!gl.getProgramParameter(this.handle, gl.LINK_STATUS)) {
            throw new Error(gl.getProgramInfoLog(this.handle) ?? "не удалось слинковать программу");
        }
    }
    at(name) {
        if (!this.slots.has(name))
            this.slots.set(name, this.gl.getUniformLocation(this.handle, name));
        return this.slots.get(name);
    }
    use() {
        this.gl.useProgram(this.handle);
    }
}
/**
 * Рендер в два прохода.
 *
 * Первый складывает выборки в float-текстуру: каждый кадр добавляет один луч на
 * пиксель со случайным сдвигом внутри него, поэтому картинка сама уточняется, пока
 * камера стоит. Второй делит накопленное на число выборок и выводит на экран.
 */
class Renderer {
    constructor(canvas, fractal) {
        this.maxSamples = 128; // мягкие тени и затенение в складках набираются выборками
        this.samples = 0;
        this.texture = null;
        this.width = 0;
        this.height = 0;
        const gl = canvas.getContext("webgl2");
        if (!gl)
            throw new Error("нужен WebGL2");
        this.gl = gl;
        if (!gl.getExtension("EXT_color_buffer_float")) {
            throw new Error("нужно расширение EXT_color_buffer_float для накопления кадров");
        }
        this.trace = new Program(gl, Shaders.screenTriangle, Shaders.trace(fractal));
        this.present = new Program(gl, Shaders.screenTriangle, Shaders.present);
        this.target = gl.createFramebuffer();
        gl.bindVertexArray(gl.createVertexArray());
        this.trace.use();
        gl.uniform1f(this.trace.at("tanHalf"), Math.tan(0.4)); // угол обзора 0.8 рад по вертикали
    }
    /** Пересоздаёт накопитель под новый размер холста. Возвращает true, если размер сменился. */
    resize(width, height) {
        if (width === this.width && height === this.height)
            return false;
        const gl = this.gl;
        this.width = width;
        this.height = height;
        if (this.texture)
            gl.deleteTexture(this.texture);
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.target);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, width, height);
        this.reset();
        return true;
    }
    setDepth(depth) {
        this.trace.use();
        this.gl.uniform1i(this.trace.at("maxLevel"), depth);
        this.reset();
    }
    setVisible(visible) {
        const mask = visible.reduce((acc, on, level) => on ? acc | (1 << level) : acc, 0);
        this.trace.use();
        this.gl.uniform1i(this.trace.at("visMask"), mask);
        this.reset();
    }
    /** Сбрасывает накопление: вызывается всякий раз, когда картинка должна измениться. */
    reset() {
        const gl = this.gl;
        this.samples = 0;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.target);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    get done() {
        return this.samples >= this.maxSamples;
    }
    /** Добавляет одну выборку и выводит накопленное на экран. */
    draw(eye, basis, aspect) {
        const gl = this.gl;
        const [right, up, forward] = basis;
        if (!this.done) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.target);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE); // накопление — обычное сложение
            this.trace.use();
            gl.uniform3fv(this.trace.at("eye"), eye);
            gl.uniformMatrix3fv(this.trace.at("cam"), false, [...right, ...up, ...forward]);
            gl.uniform1f(this.trace.at("aspect"), aspect);
            gl.uniform2f(this.trace.at("pixel"), 2 / this.width, 2 / this.height);
            gl.uniform1i(this.trace.at("seed"), this.samples);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            gl.disable(gl.BLEND);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            this.samples++;
        }
        this.present.use();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.uniform1i(this.present.at("accum"), 0);
        gl.uniform1f(this.present.at("invSamples"), 1 / Math.max(this.samples, 1));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
}
