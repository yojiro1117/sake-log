import { alcoholProfiles } from '../data/alcoholProfiles';
import type { SakeLog } from '../types';

export async function fileToResizedBlob(file: File, maxSize = 1400, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvasを初期化できませんでした。');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return await canvasToBlob(canvas, 'image/jpeg', quality);
}

export async function generatePostImage(log: SakeLog, photo?: Blob): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvasを初期化できませんでした。');

  const gradient = ctx.createLinearGradient(0, 0, 1080, 1080);
  gradient.addColorStop(0, '#07100d');
  gradient.addColorStop(0.48, '#173f35');
  gradient.addColorStop(1, '#101a33');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1080, 1080);

  if (photo) {
    const image = await createImageBitmap(photo);
    const box = { x: 72, y: 92, w: 430, h: 620 };
    const ratio = Math.max(box.w / image.width, box.h / image.height);
    const w = image.width * ratio;
    const h = image.height * ratio;
    ctx.save();
    roundedRect(ctx, box.x, box.y, box.w, box.h, 28);
    ctx.clip();
    ctx.drawImage(image, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);
    ctx.restore();
  }

  ctx.fillStyle = '#f7f3e8';
  ctx.font = '700 76px system-ui, sans-serif';
  wrapText(ctx, log.productName || '今日のお酒', 548, 160, 450, 88);

  ctx.fillStyle = '#d9b45f';
  ctx.font = '600 34px system-ui, sans-serif';
  ctx.fillText(alcoholProfiles[log.alcoholType].label, 552, 318);
  ctx.fillText(`満足度 ${log.satisfactionScore}/6`, 552, 374);
  ctx.fillText(`コスパ ${log.valueScore ?? 'B'}`, 552, 430);

  drawRadar(ctx, log);

  ctx.fillStyle = 'rgba(247,243,232,0.92)';
  ctx.font = '500 34px system-ui, sans-serif';
  wrapText(ctx, log.generatedTexts.oneLine, 82, 820, 900, 46);

  ctx.fillStyle = 'rgba(247,243,232,0.72)';
  ctx.font = '500 26px system-ui, sans-serif';
  ctx.fillText(new Date(log.drankAt).toLocaleDateString('ja-JP'), 82, 1000);
  ctx.fillText('SAKEログ / お酒は20歳になってから', 554, 1000);

  return await canvasToBlob(canvas, 'image/png', 0.95);
}

function drawRadar(ctx: CanvasRenderingContext2D, log: SakeLog) {
  const axes = alcoholProfiles[log.alcoholType].axes;
  const cx = 740;
  const cy = 652;
  const radius = 190;
  ctx.strokeStyle = 'rgba(247,243,232,0.2)';
  ctx.lineWidth = 2;
  for (let level = 1; level <= 6; level += 1) {
    ctx.beginPath();
    axes.forEach((_, index) => {
      const angle = -Math.PI / 2 + (index / axes.length) * Math.PI * 2;
      const pointRadius = (radius / 6) * level;
      const x = cx + Math.cos(angle) * pointRadius;
      const y = cy + Math.sin(angle) * pointRadius;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  }

  ctx.beginPath();
  axes.forEach((axis, index) => {
    const angle = -Math.PI / 2 + (index / axes.length) * Math.PI * 2;
    const value = log.baseScores[axis.key] ?? 3;
    const x = cx + Math.cos(angle) * (radius * value) / 6;
    const y = cy + Math.sin(angle) * (radius * value) / 6;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = 'rgba(217,180,95,0.34)';
  ctx.strokeStyle = '#d9b45f';
  ctx.lineWidth = 5;
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#f7f3e8';
  ctx.font = '600 24px system-ui, sans-serif';
  axes.forEach((axis, index) => {
    const angle = -Math.PI / 2 + (index / axes.length) * Math.PI * 2;
    ctx.fillText(axis.label, cx + Math.cos(angle) * (radius + 34) - 28, cy + Math.sin(angle) * (radius + 34) + 8);
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const chars = [...text];
  let line = '';
  for (const char of chars) {
    const test = line + char;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = char;
      y += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('画像生成に失敗しました。'));
    }, type, quality);
  });
}
