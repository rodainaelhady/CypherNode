import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Points, PointMaterial } from "@react-three/drei";
import * as THREE from "three";

function BackgroundParticles() {
  const ref = useRef<THREE.Points>(null!);
  
  // Create a sphere of random points
  const points = new Float32Array(5000 * 3);
  for (let i = 0; i < 5000; i++) {
    const r = 50;
    const theta = 2 * Math.PI * Math.random();
    const phi = Math.acos(2 * Math.random() - 1);
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);
    points.set([x, y, z], i * 3);
  }

  useFrame((state) => {
    ref.current.rotation.x = state.clock.getElapsedTime() * 0.05;
    ref.current.rotation.y = state.clock.getElapsedTime() * 0.03;
  });

  return (
    <group rotation={[0, 0, Math.PI / 4]}>
      <Points ref={ref} positions={points} stride={3} frustumCulled={false}>
        <PointMaterial
          transparent
          color="#00f2fe"
          size={0.05}
          sizeAttenuation={true}
          depthWrite={false}
        />
      </Points>
    </group>
  );
}

function GridBackground() {
  return (
    <gridHelper 
      args={[100, 50, "#00f2fe", "#002030"]} 
      position={[0, -10, 0]} 
      rotation={[Math.PI / 8, 0, 0]}
      onUpdate={(self) => {
        if (self.material instanceof THREE.Material) {
            self.material.transparent = true;
            self.material.opacity = 0.2;
        }
      }}
    />
  );
}

export default function Scene3D() {
  return (
    <div className="fixed inset-0 z-0 bg-black">
      <Canvas camera={{ position: [0, 0, 20], fov: 75 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} color="#00f2fe" intensity={2} />
        <BackgroundParticles />
        <GridBackground />
      </Canvas>
    </div>
  );
}
