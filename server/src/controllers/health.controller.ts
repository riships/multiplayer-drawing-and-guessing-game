import { Request, Response } from 'express';

export function getHealth(_req: Request, res: Response): void {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}

export function getStatus(_req: Request, res: Response): void {
  res.status(200).json({
    service: 'pictionary-live-server',
    status: 'online',
    version: '1.0.0',
    uptime: process.uptime(),
  });
}
