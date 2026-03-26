import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer } from 'expo-three';
import * as THREE from 'three';

type ThreeGlobal = typeof globalThis & {
  THREE?: typeof THREE;
};

type ExpoGLContextWithBufferSize = ExpoWebGLRenderingContext & {
  drawingBufferWidth: number;
  drawingBufferHeight: number;
};

const vertexShader = `
uniform float u_time;
uniform float u_frequency;

vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 mod289(vec4 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x) {
  return mod289(((x * 34.0) + 10.0) * x);
}

vec4 taylorInvSqrt(vec4 r) {
  return 1.79284291400159 - 0.85373472095314 * r;
}

vec3 fade(vec3 t) {
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

float pnoise(vec3 P, vec3 rep) {
  vec3 Pi0 = mod(floor(P), rep);
  vec3 Pi1 = mod(Pi0 + vec3(1.0), rep);
  Pi0 = mod289(Pi0);
  Pi1 = mod289(Pi1);
  vec3 Pf0 = fract(P);
  vec3 Pf1 = Pf0 - vec3(1.0);

  vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
  vec4 iy = vec4(Pi0.yy, Pi1.yy);
  vec4 iz0 = Pi0.zzzz;
  vec4 iz1 = Pi1.zzzz;

  vec4 ixy = permute(permute(ix) + iy);
  vec4 ixy0 = permute(ixy + iz0);
  vec4 ixy1 = permute(ixy + iz1);

  vec4 gx0 = ixy0 * (1.0 / 7.0);
  vec4 gy0 = fract(floor(gx0) * (1.0 / 7.0)) - 0.5;
  gx0 = fract(gx0);
  vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
  vec4 sz0 = step(gz0, vec4(0.0));
  gx0 -= sz0 * (step(0.0, gx0) - 0.5);
  gy0 -= sz0 * (step(0.0, gy0) - 0.5);

  vec4 gx1 = ixy1 * (1.0 / 7.0);
  vec4 gy1 = fract(floor(gx1) * (1.0 / 7.0)) - 0.5;
  gx1 = fract(gx1);
  vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
  vec4 sz1 = step(gz1, vec4(0.0));
  gx1 -= sz1 * (step(0.0, gx1) - 0.5);
  gy1 -= sz1 * (step(0.0, gy1) - 0.5);

  vec3 g000 = vec3(gx0.x, gy0.x, gz0.x);
  vec3 g100 = vec3(gx0.y, gy0.y, gz0.y);
  vec3 g010 = vec3(gx0.z, gy0.z, gz0.z);
  vec3 g110 = vec3(gx0.w, gy0.w, gz0.w);
  vec3 g001 = vec3(gx1.x, gy1.x, gz1.x);
  vec3 g101 = vec3(gx1.y, gy1.y, gz1.y);
  vec3 g011 = vec3(gx1.z, gy1.z, gz1.z);
  vec3 g111 = vec3(gx1.w, gy1.w, gz1.w);

  vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
  g000 *= norm0.x;
  g010 *= norm0.y;
  g100 *= norm0.z;
  g110 *= norm0.w;
  vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
  g001 *= norm1.x;
  g011 *= norm1.y;
  g101 *= norm1.z;
  g111 *= norm1.w;

  float n000 = dot(g000, Pf0);
  float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
  float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
  float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
  float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
  float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
  float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
  float n111 = dot(g111, Pf1);

  vec3 fade_xyz = fade(Pf0);
  vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
  vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
  float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);

  return 2.2 * n_xyz;
}

void main() {
  float noise = 3.0 * pnoise(position + (u_time * 0.75), vec3(10.0));
  float normalized_freq = clamp(u_frequency / 30.0, 0.0, 2.35);
  float displacement = normalized_freq * noise * 0.45;
  vec3 newPosition = position + normal * displacement;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
`;

const fragmentShader = `
uniform float u_red;
uniform float u_green;
uniform float u_blue;

void main() {
  gl_FragColor = vec4(vec3(u_red, u_green, u_blue), 1.0);
}
`;

export default function LokiNativeVoiceVisualizer() {
  const frameRef = useRef<number | null>(null);
  const teardownRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
      }
      teardownRef.current?.();
    };
  }, []);

  const handleContextCreate = async (gl: ExpoWebGLRenderingContext) => {
    (globalThis as ThreeGlobal).THREE = (globalThis as ThreeGlobal).THREE ?? THREE;

    const sizedGl = gl as ExpoGLContextWithBufferSize;
    const { drawingBufferWidth: width, drawingBufferHeight: height } = sizedGl;

    const renderer = new Renderer({
      gl,
      alpha: true,
      antialias: true,
    });

    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 0, 10.5);
    camera.lookAt(0, 0, 0);

    const uniforms = {
      u_time: { value: 0 },
      u_frequency: { value: 8 },
      u_red: { value: 0.98 },
      u_green: { value: 0.43 },
      u_blue: { value: 0.08 },
    };

    const shellMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xff7a1a),
      transparent: true,
      opacity: 0.09,
      side: THREE.BackSide,
    });

    const innerGlowMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x2a1408),
      transparent: true,
      opacity: 0.48,
    });

    const wireframeMaterial = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      wireframe: true,
    });

    const baseGeometry = new THREE.IcosahedronGeometry(3.05, 18);
    const shellGeometry = new THREE.IcosahedronGeometry(3.38, 8);

    const innerGlow = new THREE.Mesh(baseGeometry, innerGlowMaterial);
    scene.add(innerGlow);

    const mesh = new THREE.Mesh(baseGeometry, wireframeMaterial);
    scene.add(mesh);

    const shell = new THREE.Mesh(shellGeometry, shellMaterial);
    scene.add(shell);

    const ambient = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambient);

    const rim = new THREE.PointLight(0xff8a3d, 4.5, 30, 2);
    rim.position.set(0, 0, 7);
    scene.add(rim);

    const backGlow = new THREE.PointLight(0x1b0d07, 2.6, 24, 2);
    backGlow.position.set(0, 0, -8);
    scene.add(backGlow);

    const startTime = Date.now();

    const render = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const envelope =
        8 +
        Math.sin(elapsed * 2.1) * 3.4 +
        Math.max(0, Math.sin(elapsed * 5.6)) * 10 +
        Math.max(0, Math.sin(elapsed * 10.7)) * 4.2;

      uniforms.u_time.value = elapsed;
      uniforms.u_frequency.value = envelope;

      mesh.rotation.x = elapsed * 0.22;
      mesh.rotation.y = elapsed * 0.38;
      innerGlow.rotation.x = mesh.rotation.x;
      innerGlow.rotation.y = mesh.rotation.y;
      shell.rotation.x = -elapsed * 0.11;
      shell.rotation.y = elapsed * 0.26;

      camera.position.x = Math.sin(elapsed * 0.55) * 0.32;
      camera.position.y = Math.cos(elapsed * 0.4) * 0.24;
      camera.lookAt(0, 0, 0);

      shellMaterial.opacity = 0.08 + Math.max(0, Math.sin(elapsed * 2.7)) * 0.06;
      innerGlowMaterial.opacity = 0.36 + Math.max(0, Math.sin(elapsed * 1.9)) * 0.16;
      rim.intensity = 3.4 + Math.max(0, Math.sin(elapsed * 2.8)) * 1.8;

      renderer.render(scene, camera);
      gl.endFrameEXP();
      frameRef.current = requestAnimationFrame(render);
    };

    render();

    teardownRef.current = () => {
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
      }
      baseGeometry.dispose();
      shellGeometry.dispose();
      wireframeMaterial.dispose();
      shellMaterial.dispose();
      innerGlowMaterial.dispose();
      renderer.dispose();
    };
  };

  return (
    <View style={styles.frame}>
      <GLView style={styles.gl} onContextCreate={handleContextCreate} />
      <View pointerEvents="none" style={styles.overlay}>
        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <View style={styles.badgeDot} />
            <View>
              <View style={styles.badgeLinePrimary} />
              <View style={styles.badgeLineSecondary} />
            </View>
          </View>
          <View style={[styles.badge, styles.badgeCompact]}>
            <View style={styles.badgeGlow} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 32,
    backgroundColor: '#090706',
  },
  gl: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 245, 235, 0.08)',
  },
  badgeCompact: {
    minWidth: 34,
    justifyContent: 'center',
  },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#ff8a3d',
  },
  badgeGlow: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#ff8a3d',
  },
  badgeLinePrimary: {
    width: 54,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 237, 213, 0.95)',
  },
  badgeLineSecondary: {
    width: 34,
    height: 4,
    borderRadius: 999,
    marginTop: 4,
    backgroundColor: 'rgba(255, 154, 75, 0.52)',
  },
});
