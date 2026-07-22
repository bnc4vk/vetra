import React, { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { geoEquirectangular, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import worldAtlas from 'world-atlas/countries-110m.json'
import landAtlas from 'world-atlas/land-110m.json'
import { normalizeLocationName, resolveRouteLocations } from './locationCatalog.js'

const EARTH_RADIUS = 1.56
const MIN_TRAVERSAL_MS = 9600
const CENTER = new THREE.Vector3(0, 0, 0)
const CAMERA_DIRECTION = new THREE.Vector3(-0.12, 0.05, 1).normalize()

function extractRoute(brief) {
  const cities = []
  ;(brief?.flightLegs || []).forEach((leg, index) => {
    if (index === 0 && leg.origin) cities.push(leg.origin)
    if (leg.destination) cities.push(leg.destination)
  })
  const finalized = cities.filter((city, index) => city && city !== cities[index - 1])
  const routeCities = finalized.length > 1 ? finalized : ['New York', 'Tokyo', 'Seoul', 'New York']
  const resolution = resolveRouteLocations(routeCities)
  return {
    cities: resolution.mode === 'geographic' ? resolution.locations : [],
    label: routeCities.join(' → '),
    mode: resolution.mode,
    unresolvedCities: resolution.unresolvedCities,
  }
}

function latLonToVector({ lat, lon }, radius = EARTH_RADIUS) {
  const phi = THREE.MathUtils.degToRad(90 - lat)
  const theta = THREE.MathUtils.degToRad(lon + 180)
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  )
}

function greatCirclePoints(from, to) {
  const start = latLonToVector(from, 1).normalize()
  const end = latLonToVector(to, 1).normalize()
  const omega = Math.acos(THREE.MathUtils.clamp(start.dot(end), -1, 1))
  const steps = Math.max(36, Math.ceil(omega * 42))
  const sinOmega = Math.sin(omega)
  const distanceLift = THREE.MathUtils.clamp(omega / Math.PI, .08, 1)
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps
    const point = sinOmega < .0001
      ? start.clone().lerp(end, t).normalize()
      : start.clone().multiplyScalar(Math.sin((1 - t) * omega) / sinOmega)
        .add(end.clone().multiplyScalar(Math.sin(t * omega) / sinOmega)).normalize()
    const lift = Math.sin(Math.PI * t) * (.12 + (.2 * distanceLift))
    return point.multiplyScalar(EARTH_RADIUS + .035 + lift)
  })
}

function ambientEquatorPoints() {
  return Array.from({ length: 144 }, (_, index) => latLonToVector({
    lat: 0,
    lon: -180 + ((index / 144) * 360),
  }, EARTH_RADIUS + .17))
}

function drawGeoTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 2048
  canvas.height = 1024
  const context = canvas.getContext('2d')
  // Only vary by latitude so the equirectangular texture wraps at ±180°
  // without exposing a visible longitude seam on Pacific-crossing routes.
  const ocean = context.createLinearGradient(0, 0, 0, canvas.height)
  ocean.addColorStop(0, '#acc6cf')
  ocean.addColorStop(.48, '#7599a6')
  ocean.addColorStop(1, '#416b78')
  context.fillStyle = ocean
  context.fillRect(0, 0, canvas.width, canvas.height)

  const countries = feature(worldAtlas, worldAtlas.objects.countries)
  const land = feature(landAtlas, landAtlas.objects.land)
  const projection = geoEquirectangular()
    .translate([canvas.width / 2, canvas.height / 2])
    .scale(canvas.width / (Math.PI * 2))
    .precision(.1)
    .clipExtent([[0, 0], [canvas.width, canvas.height]])
  const path = geoPath(projection, context)
  context.beginPath()
  path(land)
  const landShade = context.createLinearGradient(0, 0, 0, canvas.height)
  landShade.addColorStop(0, '#e3eae1')
  landShade.addColorStop(.5, '#cbdacb')
  landShade.addColorStop(1, '#b9cfbf')
  context.fillStyle = landShade
  context.fill('evenodd')
  context.strokeStyle = 'rgba(238,247,240,.68)'
  context.lineWidth = 2.1
  context.stroke()
  countries.features.forEach((country) => {
    context.beginPath()
    path(country)
    context.strokeStyle = 'rgba(244,249,245,.24)'
    context.lineWidth = .85
    context.stroke()
  })

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

function drawCloudTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const context = canvas.getContext('2d')
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.filter = 'blur(13px)'
  for (let index = 0; index < 95; index += 1) {
    const x = Math.random() * canvas.width
    const y = Math.random() * canvas.height
    const width = 28 + (Math.random() * 105)
    const height = 5 + (Math.random() * 20)
    context.fillStyle = `rgba(255,255,255,${.055 + (Math.random() * .11)})`
    context.beginPath()
    context.ellipse(x, y, width, height, Math.random() * Math.PI, 0, Math.PI * 2)
    context.fill()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function createLabelSprite(location) {
  const canvas = document.createElement('canvas')
  canvas.width = 280
  canvas.height = 84
  const context = canvas.getContext('2d')
  context.shadowColor = 'rgba(28,42,40,.18)'
  context.shadowBlur = 13
  context.shadowOffsetY = 4
  context.fillStyle = 'rgba(250,252,250,.94)'
  context.beginPath()
  context.roundRect(12, 10, 256, 64, 28)
  context.fill()
  context.shadowColor = 'transparent'
  context.strokeStyle = 'rgba(92,107,103,.18)'
  context.lineWidth = 1.5
  context.stroke()
  context.fillStyle = '#f2542d'
  context.beginPath()
  context.arc(57, 42, 7, 0, Math.PI * 2)
  context.fill()
  context.fillStyle = '#263431'
  context.font = '700 29px Manrope, Arial, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(location.code, 157, 43)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, opacity: 0 })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(.41, .123, 1)
  return sprite
}

function createPlane() {
  const shape = new THREE.Shape()
  shape.moveTo(0, .115)
  shape.lineTo(.028, .018)
  shape.lineTo(.11, -.025)
  shape.lineTo(.108, -.052)
  shape.lineTo(.025, -.026)
  shape.lineTo(.018, -.085)
  shape.lineTo(.042, -.106)
  shape.lineTo(.038, -.12)
  shape.lineTo(0, -.105)
  shape.lineTo(-.038, -.12)
  shape.lineTo(-.042, -.106)
  shape.lineTo(-.018, -.085)
  shape.lineTo(-.025, -.026)
  shape.lineTo(-.108, -.052)
  shape.lineTo(-.11, -.025)
  shape.lineTo(-.028, .018)
  shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: .014, bevelEnabled: true, bevelSize: .006, bevelThickness: .006, bevelSegments: 2 })
  geometry.center()
  const material = new THREE.MeshStandardMaterial({ color: '#fff8f5', emissive: '#f26a3d', emissiveIntensity: .9, metalness: .38, roughness: .28 })
  return new THREE.Mesh(geometry, material)
}

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.()
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose?.())
    else child.material?.dispose?.()
    child.material?.map?.dispose?.()
  })
}

export default function FlightGlobe({ brief, onFirstTraversalComplete }) {
  const mountRef = useRef(null)
  const route = useMemo(() => extractRoute(brief), [brief])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount || (route.mode === 'geographic' && route.cities.length < 2)) return undefined

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(34, 1, .1, 100)
    camera.position.set(0, .03, 6.6)
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.18
    renderer.setClearColor(0x000000, 0)
    mount.replaceChildren(renderer.domElement)

    const globeGroup = new THREE.Group()
    scene.add(globeGroup)

    const earthTexture = drawGeoTexture()
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS, 112, 112),
      new THREE.MeshPhysicalMaterial({ map: earthTexture, roughness: .72, metalness: .04, clearcoat: .2, clearcoatRoughness: .66 }),
    )
    globeGroup.add(earth)

    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS + .016, 96, 96),
      new THREE.MeshPhongMaterial({ map: drawCloudTexture(), transparent: true, opacity: .42, depthWrite: false }),
    )
    globeGroup.add(clouds)

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS + .11, 96, 96),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: { glowColor: { value: new THREE.Color('#f2855e') } },
        vertexShader: 'varying vec3 vNormal; void main(){ vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 glowColor; varying vec3 vNormal; void main(){ float intensity = pow(0.72 - dot(vNormal, vec3(0.0,0.0,1.0)), 2.25); gl_FragColor = vec4(glowColor, intensity * 0.34); }',
      }),
    )
    globeGroup.add(atmosphere)

    scene.add(new THREE.HemisphereLight(0xf5fbff, 0x2f4e55, 2.45))
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.25)
    keyLight.position.set(-3, 4, 5)
    scene.add(keyLight)
    const rimLight = new THREE.DirectionalLight(0xff8a5c, 2.1)
    rimLight.position.set(4, -1, -3)
    scene.add(rimLight)

    const segments = []
    let totalDistance = 0
    const addSegment = ({ points, curve, distance, closed = false, ambient = false, fromKey = '', toKey = '' }) => {
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, Math.max(48, points.length), ambient ? .006 : .009, 7, closed),
        new THREE.MeshStandardMaterial({
          color: '#f2542d',
          emissive: '#f26a3d',
          emissiveIntensity: ambient ? .7 : 1.2,
          transparent: true,
          opacity: ambient ? .26 : .64,
          roughness: .35,
        }),
      )
      globeGroup.add(tube)
      const linePoints = closed ? [...points, points[0]] : points
      const dashedGeometry = new THREE.BufferGeometry().setFromPoints(linePoints)
      const dashedMaterial = new THREE.LineDashedMaterial({
        color: '#fff4ef',
        transparent: true,
        opacity: ambient ? .48 : .86,
        dashSize: ambient ? .055 : .075,
        gapSize: ambient ? .075 : .05,
      })
      const dashedLine = new THREE.Line(dashedGeometry, dashedMaterial)
      dashedLine.computeLineDistances()
      globeGroup.add(dashedLine)
      segments.push({ curve, distance, dashedMaterial, fromKey, toKey })
      totalDistance += distance
    }

    if (route.mode === 'ambient') {
      const points = ambientEquatorPoints()
      addSegment({
        points,
        curve: new THREE.CatmullRomCurve3(points, true, 'centripetal'),
        distance: Math.PI * 2,
        closed: true,
        ambient: true,
      })
    } else {
      for (let index = 0; index < route.cities.length - 1; index += 1) {
        const from = route.cities[index]
        const to = route.cities[index + 1]
        const points = greatCirclePoints(from, to)
        addSegment({
          points,
          curve: new THREE.CatmullRomCurve3(points),
          distance: latLonToVector(from, 1).angleTo(latLonToVector(to, 1)),
          fromKey: normalizeLocationName(from.city),
          toKey: normalizeLocationName(to.city),
        })
      }
    }

    let accumulated = 0
    segments.forEach((segment) => {
      segment.start = accumulated / totalDistance
      accumulated += segment.distance
      segment.end = accumulated / totalDistance
    })

    const uniqueLocations = route.cities.filter((location, index, all) => (
      all.findIndex((candidate) => normalizeLocationName(candidate.city) === normalizeLocationName(location.city)) === index
    ))
    const markerEntries = uniqueLocations.map((location) => {
      const vector = latLonToVector(location, EARTH_RADIUS + .045)
      const normalizedVector = vector.clone().normalize()
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(.036, 20, 20),
        new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#f26a3d', emissiveIntensity: 1.5, roughness: .28 }),
      )
      marker.position.copy(vector)
      globeGroup.add(marker)
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(.052, .075, 32),
        new THREE.MeshBasicMaterial({ color: '#f5a184', transparent: true, opacity: .72, side: THREE.DoubleSide, depthWrite: false }),
      )
      halo.position.copy(vector.clone().normalize().multiplyScalar(EARTH_RADIUS + .047))
      halo.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), vector.clone().normalize())
      globeGroup.add(halo)
      const label = createLabelSprite(location)
      label.position.copy(normalizedVector.clone().multiplyScalar(EARTH_RADIUS + .21))
      globeGroup.add(label)
      return { label, vector: normalizedVector, key: normalizeLocationName(location.city) }
    })

    const plane = createPlane()
    plane.scale.setScalar(.78)
    globeGroup.add(plane)
    const planeGlow = new THREE.PointLight(0xf26a3d, 1.1, .48, 2)
    plane.add(planeGlow)

    const traversalMs = Math.max(MIN_TRAVERSAL_MS, segments.length * 2400)
    const desiredRotation = new THREE.Quaternion()
    const tangent = new THREE.Vector3()
    const planeDirection = new THREE.Vector3()
    const planeForward = new THREE.Vector3()
    const planeOutward = new THREE.Vector3()
    const planeRight = new THREE.Vector3()
    const planeOrientation = new THREE.Matrix4()
    const worldMarkerDirection = new THREE.Vector3()
    const cameraPositionDirection = camera.position.clone().normalize()
    const clock = new THREE.Clock()
    let elapsedMs = 0
    let notified = false
    let animationFrame = null

    const resize = () => {
      const width = Math.max(1, mount.clientWidth)
      const height = Math.max(1, mount.clientHeight)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    resize()

    const animate = () => {
      const delta = Math.min(clock.getDelta(), .05)
      elapsedMs += delta * 1000
      const progress = (elapsedMs % traversalMs) / traversalMs
      const segment = segments.find((candidate) => progress <= candidate.end) || segments.at(-1)
      const localProgress = THREE.MathUtils.clamp((progress - segment.start) / Math.max(.0001, segment.end - segment.start), 0, 1)
      const position = segment.curve.getPointAt(localProgress)
      segment.curve.getTangentAt(localProgress, tangent).normalize()
      plane.position.copy(position)
      planeOutward.copy(position).normalize()
      planeForward.copy(tangent)
        .addScaledVector(planeOutward, -tangent.dot(planeOutward))
        .normalize()
      planeRight.crossVectors(planeForward, planeOutward).normalize()
      planeOutward.crossVectors(planeRight, planeForward).normalize()
      planeOrientation.makeBasis(planeRight, planeForward, planeOutward)
      plane.quaternion.setFromRotationMatrix(planeOrientation)
      if (route.mode === 'ambient') {
        globeGroup.rotation.y += delta * .105
      } else {
        planeDirection.copy(position).normalize()
        desiredRotation.setFromUnitVectors(planeDirection, CAMERA_DIRECTION)
        globeGroup.quaternion.slerp(desiredRotation, 1 - Math.exp(-delta * 1.65))
      }
      clouds.rotation.y += delta * .012
      segments.forEach((routeSegment) => { routeSegment.dashedMaterial.dashOffset -= delta * .055 })
      markerEntries.forEach(({ label, vector, key }) => {
        worldMarkerDirection.copy(vector).applyQuaternion(globeGroup.quaternion)
        // Fade labels before they reach the limb so their glass pills never clip
        // against the WebGL viewport. Showing only the active destination also
        // keeps dense European and multi-airport routes visually quiet.
        const targetOpacity = segment.toKey === key && worldMarkerDirection.dot(cameraPositionDirection) > .34 ? 1 : 0
        label.material.opacity = THREE.MathUtils.lerp(label.material.opacity, targetOpacity, 1 - Math.exp(-delta * 7))
      })
      if (!notified && elapsedMs >= traversalMs) {
        notified = true
        onFirstTraversalComplete?.()
      }
      renderer.render(scene, camera)
      animationFrame = window.requestAnimationFrame(animate)
    }
    animate()

    return () => {
      observer.disconnect()
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
      disposeObject(globeGroup)
      earthTexture.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [onFirstTraversalComplete, route])

  return (
    <figure
      className="flight-globe"
      aria-label={route.mode === 'geographic'
        ? `Animated 3D flight path for ${route.label}`
        : 'Decorative globe animation while personalized flight paths are generated'}
      data-testid="flight-globe"
      data-mode={route.mode}
      data-unresolved-cities={route.unresolvedCities.join('|')}
      data-route-coordinates={route.cities.map(({ lat, lon }) => `${lat.toFixed(4)},${lon.toFixed(4)}`).join('|')}
    >
      <div className="flight-globe-stage" ref={mountRef} aria-hidden="true" />
      <div className="flight-globe-shadow" aria-hidden="true" />
      <figcaption>{route.mode === 'geographic' ? route.label : 'Exploring global flight paths'}</figcaption>
    </figure>
  )
}

export { extractRoute }
