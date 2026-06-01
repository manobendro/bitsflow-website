import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import {
  Environment,
  Float,
  OrbitControls,
  PresentationControls,
  useGLTF,
} from '@react-three/drei';
import type { Group, Mesh } from 'three';

/**
 * 3D hero for the Bitsflow board.
 *
 * By default it renders a stylized *procedural* board with an animated 5×5 RGB
 * matrix so the page looks finished before the real model exists. When you drop
 * your exported file at `public/models/bitsflow.glb`, pass `modelUrl` (already
 * wired from the .astro page) and it will load the real model instead.
 */
export default function Hero3D({ modelUrl }: { modelUrl?: string }) {
  // On small screens, move the camera closer and widen the FOV so the board
  // fills the canvas instead of floating tiny in the middle.
  const isMobile =
    typeof window !== 'undefined' &&
    window.matchMedia('(max-width: 639px)').matches;

  return (
    <Canvas
      camera={{
        position: isMobile ? [0, 0.4, 3.1] : [0, 1.2, 4.0],
        fov: isMobile ? 52 : 42,
      }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      className="!h-full !w-full"
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 6, 3]} intensity={1.6} castShadow />
      <directionalLight position={[-4, 2, -3]} intensity={0.5} color="#88aaff" />

      <Suspense fallback={null}>
        <PresentationControls
          global
          rotation={[0.1, -0.3, 0]}
          polar={[-0.3, 0.4]}
          azimuth={[-0.8, 0.8]}
          config={{ mass: 1, tension: 200 }}
          snap={{ mass: 2, tension: 200 }}
        >
          <Float rotationIntensity={0.5} floatIntensity={0.7} speed={1.5}>
            {modelUrl ? <GltfBoard url={modelUrl} /> : <ProceduralBoard />}
          </Float>
        </PresentationControls>
        <Environment preset="city" />
      </Suspense>

      <OrbitControls
        enableZoom={false}
        enablePan={false}
        makeDefault
        minPolarAngle={Math.PI / 3}
        maxPolarAngle={Math.PI / 1.9}
      />
    </Canvas>
  );
}

/** Loads the real exported GLB. Drei caches by URL. */
function GltfBoard({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  // Center & scale heuristically; tweak once the real model lands.
  return <primitive object={scene} scale={1.5} />;
}

/** Stylized stand-in board with a live RGB matrix — used until the GLB lands. */
function ProceduralBoard() {
  const group = useRef<Group>(null);

  useFrame((state) => {
    if (group.current) {
      // gentle idle spin
      group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.15;
    }
  });

  return (
    <group ref={group} rotation={[0.15, 0, 0]}>
      {/* PCB body */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[3, 2.4, 0.12]} />
        <meshStandardMaterial color="#14532d" roughness={0.5} metalness={0.2} />
      </mesh>

      {/* gold edge connector */}
      <mesh position={[0, -1.28, 0.02]}>
        <boxGeometry args={[2.6, 0.28, 0.13]} />
        <meshStandardMaterial color="#d4af37" metalness={0.9} roughness={0.3} />
      </mesh>

      {/* 5×5 RGB matrix */}
      <LedMatrix />

      {/* a couple of "buttons" */}
      <RoundButton position={[-1.15, -0.85, 0.08]} />
      <RoundButton position={[1.15, -0.85, 0.08]} />
    </group>
  );
}

function LedMatrix() {
  const meshes = useRef<(Mesh | null)[]>([]);
  const cells = useMemo(() => {
    const arr: { key: string; x: number; y: number; i: number }[] = [];
    let i = 0;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        arr.push({
          key: `${r}-${c}`,
          x: (c - 2) * 0.42,
          y: (2 - r) * 0.42 + 0.15,
          i: i++,
        });
      }
    }
    return arr;
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    meshes.current.forEach((m, idx) => {
      if (!m) return;
      const mat = m.material as THREE_StandardMaterialLike;
      const hue = (t * 0.15 + idx * 0.04) % 1;
      const [r, g, b] = hslToRgb(hue, 0.9, 0.55);
      mat.color.setRGB(r, g, b);
      mat.emissive.setRGB(r, g, b);
      mat.emissiveIntensity = 0.6 + 0.4 * Math.sin(t * 2 + idx);
    });
  });

  return (
    <group position={[0, 0, 0.07]}>
      {cells.map((cell) => (
        <mesh
          key={cell.key}
          position={[cell.x, cell.y, 0]}
          ref={(el) => {
            meshes.current[cell.i] = el;
          }}
        >
          <boxGeometry args={[0.26, 0.26, 0.06]} />
          <meshStandardMaterial emissiveIntensity={1} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function RoundButton({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position}>
      <cylinderGeometry args={[0.14, 0.14, 0.08, 24]} />
      <meshStandardMaterial color="#1f2937" metalness={0.4} roughness={0.4} />
    </mesh>
  );
}

// Minimal structural type so we don't need to import THREE for material typing.
interface THREE_StandardMaterialLike {
  color: { setRGB(r: number, g: number, b: number): void };
  emissive: { setRGB(r: number, g: number, b: number): void };
  emissiveIntensity: number;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)];
}
