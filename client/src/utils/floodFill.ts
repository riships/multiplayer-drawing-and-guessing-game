/**
 * High-performance scanline flood fill algorithm on HTML5 Canvas 2D context
 */

function hexToRgba(hex: string): [number, number, number, number] {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map((char) => char + char).join('');
  }
  const num = parseInt(c, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255, 255];
}

export function performFloodFill(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  fillColorHex: string,
): void {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  const [fillR, fillG, fillB, fillA] = hexToRgba(fillColorHex);

  const startPos = (startY * width + startX) * 4;
  const startR = data[startPos];
  const startG = data[startPos + 1];
  const startB = data[startPos + 2];
  const startA = data[startPos + 3];

  // Already the target color
  if (startR === fillR && startG === fillG && startB === fillB && startA === fillA) {
    return;
  }

  const colorMatch = (pos: number): boolean => {
    return (
      Math.abs(data[pos] - startR) <= 30 &&
      Math.abs(data[pos + 1] - startG) <= 30 &&
      Math.abs(data[pos + 2] - startB) <= 30 &&
      Math.abs(data[pos + 3] - startA) <= 30
    );
  };

  const queue: [number, number][] = [[startX, startY]];
  const visited = new Uint8Array(width * height);
  visited[startY * width + startX] = 1;

  while (queue.length > 0) {
    const [x, y] = queue.pop()!;
    const pos = (y * width + x) * 4;

    data[pos] = fillR;
    data[pos + 1] = fillG;
    data[pos + 2] = fillB;
    data[pos + 3] = fillA;

    // Check 4 adjacent neighbors
    const neighbors: [number, number][] = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];

    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nIndex = ny * width + nx;
        if (!visited[nIndex]) {
          visited[nIndex] = 1;
          const nPos = nIndex * 4;
          if (colorMatch(nPos)) {
            queue.push([nx, ny]);
          }
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}
