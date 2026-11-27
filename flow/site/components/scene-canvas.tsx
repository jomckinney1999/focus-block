"use client";

import { useEffect, useRef } from "react";
import { FRAGMENT, VERTEX } from "@/lib/scenes";
import { cn } from "@/lib/utils";

/**
 * Full-bleed live scene (WebGL). Renders at reduced resolution and ~30 fps to stay light,
 * pauses when the tab is hidden, and draws a single still frame for reduced motion.
 */
export function SceneCanvas({ scene, className }: { scene: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef(scene);
  useEffect(() => { sceneRef.current = scene; }, [scene]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
    if (!gl) return; // no WebGL: the CSS background behind the canvas stays visible

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uR = gl.getUniformLocation(prog, "R");
    const uT = gl.getUniformLocation(prog, "T");
    const uS = gl.getUniformLocation(prog, "SCENE");

    const SCALE = 0.6; // render below native resolution; the scenes are soft, so it's invisible
    const resize = () => {
      const w = Math.max(1, Math.round(canvas.clientWidth * SCALE));
      const h = Math.max(1, Math.round(canvas.clientHeight * SCALE));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    const draw = (t: number) => {
      resize();
      gl.uniform2f(uR, canvas.width, canvas.height);
      gl.uniform1f(uT, t);
      gl.uniform1f(uS, sceneRef.current);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      draw(30);
      const onResize = () => draw(30);
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }

    let raf = 0;
    let last = 0;
    const start = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || now - last < 33) return; // ~30 fps
      last = now;
      draw(20 + (now - start) / 1000);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} aria-hidden className={cn("block h-full w-full", className)} />;
}
