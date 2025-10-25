const canvas = document.getElementById('bg-waves');
const ctx = canvas.getContext('2d');
let w, h, t = 0;

function resize() {
  w = canvas.width = window.innerWidth;
  h = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

function drawWave(color, amp, freq, speed, offset) {
  ctx.beginPath();
  for (let x = 0; x < w; x++) {
    const y = h / 2 + amp * Math.sin((x * freq + t * speed) + offset);
    ctx.lineTo(x, y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function animate() {
  ctx.clearRect(0, 0, w, h);
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#000814");
  grad.addColorStop(1, "#001b2e");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  drawWave("rgba(0,255,255,0.35)", 60, 0.015, 0.03, 0);
  drawWave("rgba(0,255,255,0.25)", 80, 0.01, 0.02, Math.PI / 2);
  drawWave("rgba(0,255,255,0.15)", 40, 0.02, 0.04, Math.PI);

  t += 1;
  requestAnimationFrame(animate);
}
animate();
