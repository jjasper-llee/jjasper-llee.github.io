(function () {
  const canvas = document.getElementById('brain-canvas');
  if (!canvas) {
    return;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }

  const NODE_COUNT = 240;
  const nodes = [];
  const connections = [];
  const pointer = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    strength: 0,
  };

  let width = 0;
  let height = 0;
  let centerX = 0;
  let centerY = 0;
  let scale = 0;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.8);

  let highlightMode = 'none';

  function sampleBrainPoint() {
    const hemisphere = Math.random() < 0.5 ? -1 : 1;
    const angle = Math.random() * Math.PI * 2;
    const radial = Math.pow(Math.random(), 0.7);

    let x = Math.cos(angle) * radial;
    let y = Math.sin(angle) * radial * (0.78 + 0.25 * radial);

    const ridge = Math.sin(angle * 3.2 + hemisphere * 0.4) * 0.28;
    x = x * (0.9 + 0.36 * Math.abs(y)) + hemisphere * (0.32 - Math.abs(y) * 0.2);
    y = y * (1.0 + ridge * 0.18);

    if (Math.random() > 0.82) {
      const cerebAngle = Math.random() * Math.PI * 2;
      const cerebRadius = 0.42 + Math.random() * 0.12;
      x = Math.cos(cerebAngle) * cerebRadius * 0.58;
      y = 0.78 + Math.sin(cerebAngle) * cerebRadius * 0.55;
    }

    return { x, y, hemisphere: hemisphere === -1 ? 'left' : 'right' };
  }

  function initNodes() {
    nodes.length = 0;
    for (let i = 0; i < NODE_COUNT; i++) {
      const point = sampleBrainPoint();
      nodes.push({
        baseX: point.x,
        baseY: point.y,
        hemisphere: point.hemisphere,
        x: 0,
        y: 0,
        offset: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 0.9,
      });
    }
  }

  function initConnections() {
    connections.length = 0;
    for (let i = 0; i < NODE_COUNT; i++) {
      for (let j = i + 1; j < NODE_COUNT; j++) {
        const nodeA = nodes[i];
        const nodeB = nodes[j];
        const dx = nodeA.baseX - nodeB.baseX;
        const dy = nodeA.baseY - nodeB.baseY;
        const distance = Math.hypot(dx, dy);
        if (distance < 0.65) {
          connections.push({ a: i, b: j, baseDistance: distance });
        }
      }
    }
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    centerX = width / 2;
    centerY = height / 2;
    scale = Math.min(width, height) * 0.25;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function resetPointer() {
    pointer.targetX = centerX;
    pointer.targetY = centerY;
  }

  function setupPointer() {
    resetPointer();
    pointer.x = centerX;
    pointer.y = centerY;

    window.addEventListener('pointermove', event => {
      pointer.targetX = event.clientX;
      pointer.targetY = event.clientY;
      pointer.strength = 1.4;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    });

    window.addEventListener('pointerleave', () => {
      pointer.strength = 0;
      resetPointer();
    });

    window.addEventListener('touchend', () => {
      pointer.strength = 0;
      resetPointer();
    });
  }

  function drawBackground() {
    const gradient = ctx.createRadialGradient(
      centerX,
      centerY - scale * 1.6,
      scale * 0.18,
      centerX,
      centerY,
      scale * 3.8
    );
    gradient.addColorStop(0, 'rgba(100, 134, 230, 0.55)');
    gradient.addColorStop(0.45, 'rgba(28, 46, 114, 0.82)');
    gradient.addColorStop(1, 'rgba(5, 12, 32, 0.96)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  function updateNodes(time) {
    const influenceX = ((pointer.x - centerX) / scale) * 0.95;
    const influenceY = ((pointer.y - centerY) / scale) * 0.95;

    for (const node of nodes) {
      const breathe = Math.sin(time * 0.8 + node.offset) * 0.05;
      const swirl = Math.sin(time * node.speed + node.offset * 2.3) * 0.04;
      const lift = Math.cos(time * 0.6 + node.offset * 1.7) * 0.03;

      const baseX = node.baseX + swirl + breathe * node.baseY * 0.35;
      const baseY = node.baseY + lift + breathe;

      const pointerPullX = baseX + influenceX * pointer.strength * 0.45;
      const pointerPullY = baseY + influenceY * pointer.strength * 0.45;

      node.x = centerX + pointerPullX * scale;
      node.y = centerY + pointerPullY * scale;
    }
  }

  function drawConnections() {
    const highlight = highlightMode !== 'none';
    const pointerBoost = 0.12 + pointer.strength * 0.18;

    for (const connection of connections) {
      const nodeA = nodes[connection.a];
      const nodeB = nodes[connection.b];
      const dx = nodeA.x - nodeB.x;
      const dy = nodeA.y - nodeB.y;
      const distance = Math.hypot(dx, dy);

      const maxDistance = scale * 1.05;
      if (distance > maxDistance) {
        continue;
      }

      const intensity = 1 - distance / maxDistance;
      const alpha = 0.08 + intensity * 0.28 + pointerBoost;

      const accent =
        highlight &&
        (nodeA.hemisphere === highlightMode || nodeB.hemisphere === highlightMode);

      ctx.strokeStyle = accent
        ? `rgba(255, 217, 102, ${Math.min(0.9, alpha)})`
        : `rgba(255, 255, 255, ${Math.min(0.65, alpha)})`;

      ctx.lineWidth = accent ? 1.4 : 1.1;
      ctx.beginPath();
      ctx.moveTo(nodeA.x, nodeA.y);
      ctx.lineTo(nodeB.x, nodeB.y);
      ctx.stroke();
    }
  }

  function drawPointerGlow() {
    if (pointer.strength < 0.05) {
      return;
    }

    const radius = scale * 0.9;
    const gradient = ctx.createRadialGradient(
      pointer.x,
      pointer.y,
      0,
      pointer.x,
      pointer.y,
      radius
    );

    gradient.addColorStop(0, `rgba(255, 255, 255, ${0.18 * Math.min(1, pointer.strength)})`);
    gradient.addColorStop(0.35, 'rgba(120, 160, 255, 0.12)');
    gradient.addColorStop(1, 'rgba(10, 20, 50, 0)');

    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawNodes() {
    const highlight = highlightMode !== 'none';
    ctx.shadowColor = 'rgba(255, 255, 255, 0.6)';
    ctx.shadowBlur = 16;

    for (const node of nodes) {
      const accent = highlight && node.hemisphere === highlightMode;
      const distToPointer = Math.hypot(node.x - pointer.x, node.y - pointer.y);
      const pointerInfluence = Math.max(0, 1 - distToPointer / (scale * 0.8));
      const pulse = 0.92 + pointerInfluence * pointer.strength * 0.15;
      ctx.fillStyle = accent
        ? `rgba(255, 217, 102, ${Math.min(1, pulse)})`
        : `rgba(255, 255, 255, ${Math.min(1, pulse)})`;
      ctx.beginPath();
      const radius = accent ? 3.8 : 3 + pointerInfluence * pointer.strength * 0.8;
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowBlur = 0;
  }

  let lastTimestamp = 0;
  function tick(now) {
    const delta = (now - lastTimestamp) / 1000 || 0.016;
    lastTimestamp = now;

    pointer.x += (pointer.targetX - pointer.x) * 0.16;
    pointer.y += (pointer.targetY - pointer.y) * 0.16;
    pointer.strength *= Math.pow(0.94, delta * 60);
    if (pointer.strength < 0.02) {
      pointer.strength = 0;
    }

    const seconds = now / 1000;

    ctx.clearRect(0, 0, width, height);
    drawBackground();
    updateNodes(seconds);
    drawPointerGlow();
    drawConnections();
    drawNodes();

    requestAnimationFrame(tick);
  }

  function setBrainHighlight(mode) {
    highlightMode = mode === 'left' || mode === 'right' ? mode : 'none';
  }

  window.setBrainHighlight = setBrainHighlight;

  resize();
  initNodes();
  initConnections();
  setupPointer();
  requestAnimationFrame(tick);

  window.addEventListener('resize', () => {
    resize();
    initConnections();
    resetPointer();
  });

  if (window.pendingBrainHighlight) {
    setBrainHighlight(window.pendingBrainHighlight);
    delete window.pendingBrainHighlight;
  }
})();

if (typeof window !== 'undefined' && !window.setBrainHighlight) {
  window.setBrainHighlight = mode => {
    window.pendingBrainHighlight = mode;
  };
}
