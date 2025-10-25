const canvas = document.getElementById('brain-canvas');

if (canvas) {
  const hasWebGLSupport = (() => {
    try {
      const gl =
        canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      return !!gl;
    } catch (e) {
      return false;
    }
  })();

  if (!window.THREE || !hasWebGLSupport) {
    console.warn('WebGL/Three.js unavailable — swapping to 2D fallback.');
    startFallbackBrain(canvas);
  } else {
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      36,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    camera.position.set(0, 0, 4.2);

    const ambient = new THREE.AmbientLight(0xd7e4ff, 1.2);
    scene.add(ambient);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.65);
    rimLight.position.set(-2.5, 3.5, 4);
    scene.add(rimLight);

    const backLight = new THREE.DirectionalLight(0xa8c4ff, 0.45);
    backLight.position.set(2.8, -3.2, -3.5);
    scene.add(backLight);

    const POINT_COUNT = 7200;
    const positions = new Float32Array(POINT_COUNT * 3);
    const basePositions = new Float32Array(POINT_COUNT * 3);
    const seeds = new Float32Array(POINT_COUNT);
    const colors = new Float32Array(POINT_COUNT * 3);

    const baseColor = new THREE.Color('#dfe9ff');
    const highlightColor = new THREE.Color('#ffffff');
    const pointerColor = new THREE.Color('#9fc2ff');

    function sampleBrainPoint() {
      const regionRoll = Math.random();
      if (regionRoll < 0.12) {
        return sampleBrainStem();
      }
      if (regionRoll < 0.34) {
        return sampleCerebellum();
      }
      return sampleCerebrum();
    }

    function sampleCerebrum() {
      const hemisphere = Math.random() < 0.5 ? -1 : 1;
      const u = Math.random();
      const v = Math.random();
      const theta = Math.acos(1 - 2 * u); // polar angle
      const phi = 2 * Math.PI * v; // azimuth

      let x = Math.sin(theta) * Math.cos(phi);
      let y = Math.cos(theta);
      let z = Math.sin(theta) * Math.sin(phi);

      const verticalWeight = Math.pow(Math.abs(y), 1.6);
      const swirl = Math.sin(phi * 6 + hemisphere * 0.4) * 0.05;
      const ripple = Math.sin(phi * 14 + theta * 7 + hemisphere * 0.7) * 0.07;
      const elongate = 0.78 + verticalWeight * 0.32;

      x *= elongate;
      y *= 0.88 + Math.pow(Math.abs(z), 1.4) * 0.18;
      z *= 0.82 + verticalWeight * 0.22;

      const lateralOffset = hemisphere * (0.36 - 0.2 * verticalWeight);
      x += lateralOffset;

      const radius = 1.02 + swirl + ripple + Math.sin(theta * 3.3 + phi * 1.2) * 0.05;
      const jitter = (Math.random() - 0.5) * 0.05;

      return {
        x: (x * radius + jitter) * 1.52,
        y: (y * radius + jitter * 0.6) * 1.52,
        z: (z * radius + jitter) * 1.52,
      };
    }

    function sampleCerebellum() {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.36 + Math.random() * 0.08;
      const wave = Math.sin(angle * 5.5) * 0.08;
      return {
        x: Math.cos(angle) * radius * 0.65,
        y: -0.62 + (Math.random() - 0.5) * 0.18 + wave * 0.2,
        z: -0.62 + Math.sin(angle) * radius * 0.92 + wave * 0.3,
      };
    }

    function sampleBrainStem() {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.08 + Math.random() * 0.05;
      return {
        x: Math.cos(angle) * radius * 0.4,
        y: -0.86 - Math.random() * 0.55,
        z: -0.22 + Math.sin(angle) * radius * 0.55,
      };
    }

    for (let i = 0; i < POINT_COUNT; i++) {
      const point = sampleBrainPoint();
      const idx = i * 3;
      positions[idx] = basePositions[idx] = point.x;
      positions[idx + 1] = basePositions[idx + 1] = point.y;
      positions[idx + 2] = basePositions[idx + 2] = point.z;
      seeds[i] = Math.random() * Math.PI * 2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.05,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.98,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });

    const brainMesh = new THREE.Points(geometry, material);
    scene.add(brainMesh);

    const pointerPosition = new THREE.Vector3(0, 0, 0.35);
    const pointerGoal = pointerPosition.clone();
    let pointerInfluence = 0.08;

    let targetRotationX = -0.2;
    let targetRotationY = 0.4;
    let currentRotationX = targetRotationX;
    let currentRotationY = targetRotationY;

    function onResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }

    window.addEventListener('resize', onResize);

    window.addEventListener('pointermove', event => {
      const x = (event.clientX / window.innerWidth) * 2 - 1;
      const y = (event.clientY / window.innerHeight) * 2 - 1;
      pointerGoal.set(x * 0.9, -y * 0.9, 0.25);
      pointerInfluence = 1;
      targetRotationY = x * 0.65;
      targetRotationX = -0.15 - y * 0.55;
    });

    const clock = new THREE.Clock();

    function animate() {
      const delta = clock.getDelta();
      const elapsed = clock.elapsedTime;

      pointerPosition.lerp(pointerGoal, 0.08);
      pointerInfluence *= 0.94;

      currentRotationX += (targetRotationX - currentRotationX) * 0.08;
      currentRotationY += (targetRotationY - currentRotationY) * 0.08;
      brainMesh.rotation.set(currentRotationX, currentRotationY, 0);
      brainMesh.rotation.z += delta * 0.02;

      const pulse = 1 + Math.sin(elapsed * 0.9) * 0.015;
      brainMesh.scale.setScalar(pulse);

      const posArray = geometry.attributes.position.array;
      for (let i = 0; i < POINT_COUNT; i++) {
        const idx = i * 3;
        const seed = seeds[i];
        const baseX = basePositions[idx];
        const baseY = basePositions[idx + 1];
        const baseZ = basePositions[idx + 2];
        const wave = Math.sin(elapsed * 1.6 + seed * 4.1) * 0.018 +
          Math.sin(elapsed * 0.9 + seed * 7.3) * 0.012;
        posArray[idx] = baseX + baseX * wave;
        posArray[idx + 1] = baseY + baseY * wave * 0.92;
        posArray[idx + 2] = baseZ + baseZ * wave;
      }
      geometry.attributes.position.needsUpdate = true;

      updateColors(elapsed);

      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }

    function updateColors(time) {
      const colorArray = geometry.attributes.color.array;
      const baseR = baseColor.r;
      const baseG = baseColor.g;
      const baseB = baseColor.b;
      const hiR = highlightColor.r;
      const hiG = highlightColor.g;
      const hiB = highlightColor.b;

      for (let i = 0; i < POINT_COUNT; i++) {
        const idx = i * 3;
        const seed = seeds[i];
        const baseX = basePositions[idx];
        const baseY = basePositions[idx + 1];
        const baseZ = basePositions[idx + 2];
        const wave = 0.55 + 0.35 * Math.sin(time * 2.6 + seed * 6.2);

        const dx = baseX - pointerPosition.x;
        const dy = baseY - pointerPosition.y;
        const dz = baseZ - pointerPosition.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        const pointerEffect = Math.exp(-distSq * 4) * pointerInfluence;

        const brightness = Math.min(1, wave + pointerEffect * 0.9);
        const r = baseR + (hiR - baseR) * brightness;
        const g = baseG + (hiG - baseG) * brightness;
        const b = baseB + (hiB - baseB) * brightness;

        if (pointerEffect > 0.02) {
          const mix = Math.min(1, pointerEffect * 1.4);
          colorArray[idx] = THREE.MathUtils.lerp(r, pointerColor.r, mix);
          colorArray[idx + 1] = THREE.MathUtils.lerp(g, pointerColor.g, mix);
          colorArray[idx + 2] = THREE.MathUtils.lerp(b, pointerColor.b, mix);
        } else {
          colorArray[idx] = r;
          colorArray[idx + 1] = g;
          colorArray[idx + 2] = b;
        }
      }

      geometry.attributes.color.needsUpdate = true;
    }

    animate();
  }
}

function startFallbackBrain(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }

  const NODE_COUNT = 180;
  const nodes = [];
  const pointer = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    strength: 0,
  };

  let width = window.innerWidth;
  let height = window.innerHeight;
  let scale = Math.min(width, height) * 0.23;
  let centerX = width / 2;
  let centerY = height / 2;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  function sampleBrainPoint2D() {
    const hemisphere = Math.random() < 0.5 ? -1 : 1;
    const angle = Math.random() * Math.PI * 2;
    const radial = Math.pow(Math.random(), 0.8);

    let x = Math.cos(angle) * radial;
    let y = Math.sin(angle) * radial * (0.75 + 0.25 * radial);

    const ridge = Math.sin(angle * 2.8 + hemisphere * 0.4) * 0.25;
    x = x * (0.9 + 0.3 * Math.abs(y)) + hemisphere * (0.28 - Math.abs(y) * 0.18);
    y = y * (1.0 + ridge * 0.15);

    const cerebellumChance = Math.random();
    if (cerebellumChance > 0.86) {
      const cerebAngle = Math.random() * Math.PI * 2;
      const cerebRadius = 0.42 + Math.random() * 0.1;
      x = Math.cos(cerebAngle) * cerebRadius * 0.55;
      y = 0.7 + Math.sin(cerebAngle) * cerebRadius * 0.55;
    }

    return { x, y };
  }

  for (let i = 0; i < NODE_COUNT; i++) {
    const point = sampleBrainPoint2D();
    nodes.push({
      baseX: point.x,
      baseY: point.y,
      offset: Math.random() * Math.PI * 2,
      speed: 0.6 + Math.random() * 0.8,
      x: 0,
      y: 0,
    });
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    centerX = width / 2;
    centerY = height / 2;
    scale = Math.min(width, height) * 0.23;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function resetPointerTarget() {
    pointer.targetX = centerX;
    pointer.targetY = centerY;
  }

  resetPointerTarget();
  pointer.x = centerX;
  pointer.y = centerY;

  resize();

  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', event => {
    pointer.targetX = event.clientX;
    pointer.targetY = event.clientY;
    pointer.strength = 1;
  });
  window.addEventListener('pointerleave', () => {
    pointer.strength = 0;
    resetPointerTarget();
  });
  window.addEventListener('touchend', () => {
    pointer.strength = 0;
    resetPointerTarget();
  });

  function drawBackground() {
    const gradient = ctx.createRadialGradient(
      centerX,
      centerY - scale * 2.2,
      scale * 0.3,
      centerX,
      centerY,
      scale * 3.6
    );
    gradient.addColorStop(0, 'rgba(240, 248, 255, 0.95)');
    gradient.addColorStop(0.5, 'rgba(190, 210, 255, 0.6)');
    gradient.addColorStop(1, 'rgba(120, 150, 220, 0.35)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  function updateNodes(time) {
    const pulse = Math.sin(time * 0.8) * 0.04;
    const hoverStrength = pointer.strength;
    const influenceX = ((pointer.x - centerX) / scale) * 0.5;
    const influenceY = ((pointer.y - centerY) / scale) * 0.5;

    for (const node of nodes) {
      const swirl = Math.sin(time * node.speed + node.offset) * 0.05;
      const baseX = node.baseX + swirl + pulse * node.baseY;
      const baseY = node.baseY + swirl * 0.5;

      const pointerPullX = baseX + influenceX * hoverStrength;
      const pointerPullY = baseY + influenceY * hoverStrength;

      node.x = centerX + pointerPullX * scale;
      node.y = centerY + (pointerPullY - hoverStrength * 0.08) * scale;
    }
  }

  function drawConnections() {
    const maxDistance = scale * 0.9;

    for (let i = 0; i < NODE_COUNT; i++) {
      const nodeA = nodes[i];
      for (let j = i + 1; j < NODE_COUNT; j++) {
        const nodeB = nodes[j];
        const dx = nodeA.x - nodeB.x;
        const dy = nodeA.y - nodeB.y;
        const distance = Math.hypot(dx, dy);

        if (distance > maxDistance) {
          continue;
        }

        const intensity = 1 - distance / maxDistance;
        const alpha = 0.08 + intensity * 0.25 + pointer.strength * 0.1;
        ctx.strokeStyle = `rgba(159, 194, 255, ${alpha})`;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(nodeA.x, nodeA.y);
        ctx.lineTo(nodeB.x, nodeB.y);
        ctx.stroke();
      }
    }
  }

  function drawNodes() {
    ctx.shadowColor = 'rgba(255, 255, 255, 0.55)';
    ctx.shadowBlur = 14;
    for (const node of nodes) {
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.arc(node.x, node.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  let lastTime = 0;

  function animate(now) {
    const seconds = now / 1000;
    const delta = (now - lastTime) / 1000 || 0.016;
    lastTime = now;

    pointer.x += (pointer.targetX - pointer.x) * 0.08;
    pointer.y += (pointer.targetY - pointer.y) * 0.08;
    pointer.strength *= Math.pow(0.92, delta * 60);

    ctx.clearRect(0, 0, width, height);
    drawBackground();
    updateNodes(seconds);
    drawConnections();
    drawNodes();

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}
