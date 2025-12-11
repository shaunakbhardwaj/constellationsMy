import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const vertexShader = `
  attribute vec3 color;
  varying vec3 vColor;
  uniform float time;

  vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  vec3 fade(vec3 t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }

  float cnoise(vec3 P) {
    vec3 Pi0 = floor(P);
    vec3 Pi1 = Pi0 + vec3(1.0);
    Pi0 = mod(Pi0, 289.0);
    Pi1 = mod(Pi1, 289.0);
    vec3 Pf0 = fract(P);
    vec3 Pf1 = Pf0 - vec3(1.0);
    vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
    vec4 iy = vec4(Pi0.yy, Pi1.yy);
    vec4 iz0 = Pi0.zzzz;
    vec4 iz1 = Pi1.zzzz;
    vec4 ixy = permute(permute(ix) + iy);
    vec4 ixy0 = permute(ixy + iz0);
    vec4 ixy1 = permute(ixy + iz1);
    vec4 gx0 = ixy0 / 7.0;
    vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5;
    gx0 = fract(gx0);
    vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
    vec4 sz0 = step(gz0, vec4(0.0));
    gx0 -= sz0 * (step(0.0, gx0) - 0.5);
    gy0 -= sz0 * (step(0.0, gy0) - 0.5);
    vec4 gx1 = ixy1 / 7.0;
    vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5;
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
    vColor = vec3(1.0);
    vec3 pos = position;
    float noiseFreq = 0.05;
    float noiseAmp = 0.5;
    float noiseSpeed = 0.2;
    pos.x += cnoise(pos * noiseFreq + time * noiseSpeed) * noiseAmp;
    pos.y += cnoise(pos * noiseFreq + time * noiseSpeed + vec3(123.45)) * noiseAmp;
    pos.z += cnoise(pos * noiseFreq + time * noiseSpeed + vec3(678.9)) * noiseAmp;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = 1.2 + sin(time * 2.0 + position.x * 0.01 + position.y * 0.01) * 0.8;
  }
`

const fragmentShader = `
  varying vec3 vColor;
  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    if (dist > 0.5) discard;
    gl_FragColor = vec4(vColor, 1.0 - smoothstep(0.4, 0.5, dist));
  }
`

const NUM_STARS = 1000
const RADIUS = 90

function GalaxyCanvas(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(
      65,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    )
    camera.position.z = 200

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio ?? 1)
    renderer.setClearColor(0x000000, 0)
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enablePan = false
    controls.enableZoom = false
    controls.enableDamping = true
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.4

    const group = new THREE.Group()

    const positions = new Float32Array(NUM_STARS * 3)
    const colors = new Float32Array(NUM_STARS * 3)
    const starVectors: THREE.Vector3[] = []

    for (let i = 0; i < NUM_STARS; i++) {
      const r = RADIUS * Math.cbrt(Math.random())
      const theta = Math.acos(2 * Math.random() - 1)
      const phi = Math.random() * 2 * Math.PI
      const x = r * Math.sin(theta) * Math.cos(phi)
      const y = r * Math.sin(theta) * Math.sin(phi)
      const z = r * Math.cos(theta)

      const index = i * 3
      positions[index] = x
      positions[index + 1] = y
      positions[index + 2] = z

      colors[index] = 1
      colors[index + 1] = 1
      colors[index + 2] = 1

      starVectors.push(new THREE.Vector3(x, y, z))
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))

    const material = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })

    const stars = new THREE.Points(geometry, material)
    group.add(stars)

    const desiredAvgNeighbors = 4
    const volume = (4 / 3) * Math.PI * Math.pow(RADIUS, 3)
    const density = NUM_STARS / volume
    const neighborVolume = desiredAvgNeighbors / density
    const maxDistance = Math.pow(neighborVolume / ((4 / 3) * Math.PI), 1 / 3)

    const linePositions: number[] = []
    for (let i = 0; i < NUM_STARS; i++) {
      for (let j = i + 1; j < NUM_STARS; j++) {
        if (starVectors[i].distanceTo(starVectors[j]) < maxDistance) {
          linePositions.push(starVectors[i].x, starVectors[i].y, starVectors[i].z)
          linePositions.push(starVectors[j].x, starVectors[j].y, starVectors[j].z)
        }
      }
    }

    const lineGeometry = new THREE.BufferGeometry()
    lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3))

    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      opacity: 0.18,
      transparent: true
    })

    const lines = new THREE.LineSegments(lineGeometry, lineMaterial)
    group.add(lines)
    scene.add(group)

    let animationId: number
    const animate = (): void => {
      animationId = requestAnimationFrame(animate)
      material.uniforms.time.value += 0.01
      lineMaterial.opacity = 0.14 + Math.sin(performance.now() * 0.001) * 0.04
      group.rotation.y += 0.0005
      controls.update()
      renderer.render(scene, camera)
    }

    animate()

    const handleResize = (): void => {
      if (!container) return
      const { clientWidth, clientHeight } = container
      renderer.setSize(clientWidth, clientHeight)
      camera.aspect = clientWidth / clientHeight
      camera.updateProjectionMatrix()
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(animationId)
      controls.dispose()

      // Dispose all objects in the scene to prevent memory leaks
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line) {
          object.geometry?.dispose()
          if (Array.isArray(object.material)) {
            object.material.forEach((m) => m.dispose())
          } else if (object.material) {
            object.material.dispose()
          }
        }
      })

      geometry.dispose()
      lineGeometry.dispose()
      material.dispose()
      lineMaterial.dispose()
      renderer.dispose()
      renderer.forceContextLoss() // Force WebGL context release

      // Safe removal in case component unmounts rapidly
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [])

  return <div className="galaxy-canvas" ref={containerRef} />
}

export default GalaxyCanvas
