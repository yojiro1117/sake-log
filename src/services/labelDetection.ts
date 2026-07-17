import type { LabelRegion, PerspectivePoint, PerspectiveQuad, PhotoQualityAnalysis } from '../types';

export function detectLabelRegions(quality: PhotoQualityAnalysis): LabelRegion[] {
  const portrait = quality.height >= quality.width;
  const regions: LabelRegion[] = [{
    id: 'center-label', x: portrait ? 0.12 : 0.2, y: portrait ? 0.27 : 0.18,
    width: portrait ? 0.76 : 0.6, height: portrait ? 0.56 : 0.68,
    confidence: quality.blurScore >= 0.25 ? 0.62 : 0.44, kind: 'center',
    reasons: ['ボトル写真の中央ラベル領域']
  }];
  for (const region of regions) attachRegionGeometry(region, 'bottle-axis-fallback');
  regions.push(attachRegionGeometry({ id:'neck-label', x:0.28, y:0.03, width:0.44, height:0.25, confidence:0.38, kind:'neck', reasons:['首ラベル候補'] }, 'bottle-axis-fallback'));
  regions.push(attachRegionGeometry({ id:'barcode-region', x:0.48, y:0.42, width:0.48, height:0.52, confidence:0.34, kind:'barcode', reasons:['裏ラベル右下のコード候補'] }, 'barcode-prior'));
  return regions;
}

export async function detectLabelRegionsFromImage(blob: Blob, quality: PhotoQualityAnalysis): Promise<LabelRegion[]> {
  const fallback = detectLabelRegions(quality);
  try {
    const bitmap = await createImageBitmap(blob);
    const width = 192;
    const height = Math.max(96, Math.round(width * bitmap.height / bitmap.width));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return fallback;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const pixels = context.getImageData(0, 0, width, height).data;
    const columns = 6; const rows = 8; const cells: Array<{ x: number; y: number; score: number }> = [];
    for (let gy = 0; gy < rows; gy += 1) for (let gx = 0; gx < columns; gx += 1) {
      let edges = 0; let samples = 0;
      const startX = Math.floor(gx * width / columns); const endX = Math.floor((gx + 1) * width / columns);
      const startY = Math.floor(gy * height / rows); const endY = Math.floor((gy + 1) * height / rows);
      for (let y = Math.max(1, startY); y < endY; y += 2) for (let x = Math.max(1, startX); x < endX; x += 2) {
        const index = (y * width + x) * 4;
        edges += pixelDifference(pixels, index, index - 4) + pixelDifference(pixels, index, index - width * 4);
        samples += 2;
      }
      cells.push({ x: gx, y: gy, score: edges / Math.max(1, samples) });
    }
    const ranked = cells.sort((left, right) => right.score - left.score);
    const best = ranked.find((cell) => cell.x >= 1 && cell.x <= columns - 2 && cell.y >= 1 && cell.y <= rows - 2) ?? ranked[0];
    if (!best || best.score < 8) return fallback;
    const region: LabelRegion = {
      id: 'edge-density-label',
      x: Math.max(0.02, (best.x - 1) / columns),
      y: Math.max(0.02, (best.y - 1) / rows),
      width: Math.min(0.96, 3 / columns),
      height: Math.min(0.9, 4 / rows),
      confidence: Math.max(0.45, Math.min(0.82, best.score / 45)),
      kind: 'center',
      reasons: ['文字・輪郭密度が高い領域']
    };
    const threshold = Math.max(8, best.score * 0.68);
    const connected = connectedDenseCells(cells, columns, rows, threshold)
      .filter((group) => group.some((cell) => cell.x >= 1 && cell.x <= columns - 2))
      .sort((left, right) => groupScore(right) - groupScore(left))[0];
    const adaptive = connected?.length ? regionFromCells(connected, columns, rows, best.score) : undefined;
    return [attachRegionGeometry(region, 'edge-density'), ...(adaptive ? [attachRegionGeometry(adaptive, 'adaptive-connected-components')] : []), ...fallback.filter((item) => item.kind !== 'center')];
  } catch {
    return fallback;
  }
}

function attachRegionGeometry<T extends LabelRegion>(region: T, detectionMethod: string): T {
  region.quad = {
    nw:{ x:region.x, y:region.y }, ne:{ x:region.x + region.width, y:region.y },
    se:{ x:region.x + region.width, y:region.y + region.height }, sw:{ x:region.x, y:region.y + region.height }
  };
  region.areaRatio = region.width * region.height;
  region.detectionMethod = detectionMethod;
  return region;
}

export async function cropRegion(blob: Blob, region: LabelRegion, rotateDegrees = 0): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const sx = Math.round(region.x * bitmap.width); const sy = Math.round(region.y * bitmap.height);
  const sw = Math.max(1, Math.round(region.width * bitmap.width)); const sh = Math.max(1, Math.round(region.height * bitmap.height));
  const quarterTurn = Math.abs(rotateDegrees) % 180 === 90;
  const canvas = new OffscreenCanvas(quarterTurn ? sh : sw, quarterTurn ? sw : sh);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('ラベル範囲を切り出せません。');
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(rotateDegrees * Math.PI / 180);
  context.drawImage(bitmap, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
  bitmap.close();
  return canvas.convertToBlob({ type:'image/jpeg', quality:0.9 });
}

function connectedDenseCells(cells:Array<{x:number;y:number;score:number}>, columns:number, rows:number, threshold:number) {
  const dense=new Map(cells.filter((cell)=>cell.score>=threshold).map((cell)=>[`${cell.x}:${cell.y}`,cell]));
  const groups:Array<Array<{x:number;y:number;score:number}>>=[];
  while(dense.size){
    const first=dense.values().next().value as {x:number;y:number;score:number};
    const queue=[first]; const group=[]; dense.delete(`${first.x}:${first.y}`);
    while(queue.length){
      const cell=queue.shift()!; group.push(cell);
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const x=cell.x+dx; const y=cell.y+dy;
        if(x<0||x>=columns||y<0||y>=rows)continue;
        const next=dense.get(`${x}:${y}`); if(next){dense.delete(`${x}:${y}`);queue.push(next);}
      }
    }
    groups.push(group);
  }
  return groups;
}

function groupScore(group:Array<{score:number}>) { return group.reduce((sum,cell)=>sum+cell.score,0)*Math.sqrt(group.length); }

function regionFromCells(cells:Array<{x:number;y:number;score:number}>,columns:number,rows:number,referenceScore:number):LabelRegion {
  const minX=Math.min(...cells.map((cell)=>cell.x)); const maxX=Math.max(...cells.map((cell)=>cell.x));
  const minY=Math.min(...cells.map((cell)=>cell.y)); const maxY=Math.max(...cells.map((cell)=>cell.y));
  return {
    id:'adaptive-connected-label',
    x:Math.max(0.01,(minX-0.5)/columns), y:Math.max(0.01,(minY-0.5)/rows),
    width:Math.min(0.98,(maxX-minX+2)/columns), height:Math.min(0.96,(maxY-minY+2)/rows),
    confidence:Math.max(0.42,Math.min(0.84,groupScore(cells)/Math.max(1,referenceScore*6))),
    kind:'center', reasons:['適応しきい値と連結輪郭で抽出した領域']
  };
}

export async function cropPerspectiveQuad(blob:Blob, quad:PerspectiveQuad, rotateDegrees = 0):Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const point = (value:PerspectivePoint) => ({ x:value.x * bitmap.width, y:value.y * bitmap.height });
  const source = { nw:point(quad.nw), ne:point(quad.ne), se:point(quad.se), sw:point(quad.sw) };
  const width = Math.max(1, Math.round((distance(source.nw, source.ne) + distance(source.sw, source.se)) / 2));
  const height = Math.max(1, Math.round((distance(source.nw, source.sw) + distance(source.ne, source.se)) / 2));
  const raw = new OffscreenCanvas(width, height);
  const context = raw.getContext('2d');
  if (!context) throw new Error('ラベルの四隅補正を実行できません。');
  drawAffineTriangle(context, bitmap, [source.nw, source.ne, source.se], [{x:0,y:0},{x:width,y:0},{x:width,y:height}]);
  drawAffineTriangle(context, bitmap, [source.nw, source.se, source.sw], [{x:0,y:0},{x:width,y:height},{x:0,y:height}]);
  bitmap.close();
  if (rotateDegrees % 360 === 0) return raw.convertToBlob({ type:'image/jpeg', quality:0.92 });
  const quarterTurn = Math.abs(rotateDegrees) % 180 === 90;
  const rotated = new OffscreenCanvas(quarterTurn ? height : width, quarterTurn ? width : height);
  const rotatedContext = rotated.getContext('2d');
  if (!rotatedContext) throw new Error('ラベル画像を回転できません。');
  rotatedContext.translate(rotated.width / 2, rotated.height / 2);
  rotatedContext.rotate(rotateDegrees * Math.PI / 180);
  rotatedContext.drawImage(raw, -width / 2, -height / 2);
  return rotated.convertToBlob({ type:'image/jpeg', quality:0.92 });
}

function drawAffineTriangle(
  context:OffscreenCanvasRenderingContext2D,
  image:ImageBitmap,
  source:[PerspectivePoint,PerspectivePoint,PerspectivePoint],
  target:[PerspectivePoint,PerspectivePoint,PerspectivePoint]
) {
  const [s0,s1,s2]=source; const [t0,t1,t2]=target;
  const denominator=s0.x*(s1.y-s2.y)+s1.x*(s2.y-s0.y)+s2.x*(s0.y-s1.y);
  if (Math.abs(denominator)<0.001) return;
  const a=(t0.x*(s1.y-s2.y)+t1.x*(s2.y-s0.y)+t2.x*(s0.y-s1.y))/denominator;
  const c=(t0.x*(s2.x-s1.x)+t1.x*(s0.x-s2.x)+t2.x*(s1.x-s0.x))/denominator;
  const e=(t0.x*(s1.x*s2.y-s2.x*s1.y)+t1.x*(s2.x*s0.y-s0.x*s2.y)+t2.x*(s0.x*s1.y-s1.x*s0.y))/denominator;
  const b=(t0.y*(s1.y-s2.y)+t1.y*(s2.y-s0.y)+t2.y*(s0.y-s1.y))/denominator;
  const d=(t0.y*(s2.x-s1.x)+t1.y*(s0.x-s2.x)+t2.y*(s1.x-s0.x))/denominator;
  const f=(t0.y*(s1.x*s2.y-s2.x*s1.y)+t1.y*(s2.x*s0.y-s0.x*s2.y)+t2.y*(s0.x*s1.y-s1.x*s0.y))/denominator;
  context.save();
  context.beginPath(); context.moveTo(t0.x,t0.y); context.lineTo(t1.x,t1.y); context.lineTo(t2.x,t2.y); context.closePath(); context.clip();
  context.setTransform(a,b,c,d,e,f); context.drawImage(image,0,0); context.restore();
}

function distance(left:PerspectivePoint,right:PerspectivePoint) { return Math.hypot(left.x-right.x,left.y-right.y); }

function pixelDifference(data: Uint8ClampedArray, left: number, right: number) {
  return Math.abs(data[left] - data[right]) + Math.abs(data[left + 1] - data[right + 1]) + Math.abs(data[left + 2] - data[right + 2]);
}
