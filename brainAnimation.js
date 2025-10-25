const canvas = document.getElementById('brainCanvas');
const ctx = canvas.getContext('2d');
let t = 0;

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function drawBrain() {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const scale = 1 + 0.02 * Math.sin(t * 2); // Slight pulsation effect

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  // Draw left hemisphere
  ctx.beginPath();
  ctx.arc(-60, 0, 60, Math.PI * 0.5, Math.PI * 1.5);
  ctx.strokeStyle = 'cyan';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw right hemisphere
  ctx.beginPath();
  ctx.arc(60, 0, 60, Math.PI * 1.5, Math.PI * 0.5);
  ctx.stroke();

  // Draw connecting lines
  ctx.strokeStyle = 'gold';
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 50; i++) {
    const angle = Math.random() * Math.PI * 2;
    const x1 = -60 + Math.cos(angle) * 60;
    const y1 = Math.sin(angle) * 60;
    const x2 = 60 + Math.cos(angle) * 60;
    const y2 = Math.sin(angle) * 60;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  ctx.restore();
}

function animate() {
  t += 1 / 60;
  drawBrain();
  requestAnimationFrame(animate);
}
animate();
