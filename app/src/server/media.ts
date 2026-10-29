import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname } from 'node:path';
import type { MediaInfo } from '../shared/types.js';
import { HttpError } from './http.js';
import { runCommand } from './process.js';

interface ProbeStream { codec_type?: string; width?: number; height?: number; r_frame_rate?: string; sample_rate?: string; channels?: number; }
interface ProbeOutput { format?: { duration?: string }; streams?: ProbeStream[] }

export async function probeMedia(path: string): Promise<MediaInfo> {
  const info = await stat(path).catch(() => null);
  if (!info) throw new HttpError(400, 'Source file not found. Choose an existing video or audio file under Source footage. Set the destination separately under Output folder.');
  if (!info.isFile()) throw new HttpError(400, 'This is a folder. Select your video or audio file under Source footage, and use Output folder for the destination.');
  const args = ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,r_frame_rate,sample_rate,channels', '-of', 'json', path];
  const result = await runCommand('ffprobe', args);
  if (result.code !== 0) throw new HttpError(400, `ffprobe failed: ${result.stderr.trim() || result.command}`);
  let parsed: ProbeOutput;
  try { parsed = JSON.parse(result.stdout) as ProbeOutput; } catch { throw new HttpError(502, 'ffprobe returned invalid JSON.'); }
  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const video = streams.find((stream) => stream.codec_type === 'video');
  const audio = streams.find((stream) => stream.codec_type === 'audio');
  if (!video && !audio) throw new HttpError(415, 'The file has no video or audio stream.');
  const durationS = Number(parsed.format?.duration);
  if (!Number.isFinite(durationS)) throw new HttpError(502, 'ffprobe did not report a duration.');
  return {
    path,
    kind: video ? 'video' : 'audio',
    durationS,
    ...(video ? { width: video.width, height: video.height, fps: video.r_frame_rate } : {}),
    ...(audio?.sample_rate ? { sampleRate: Number(audio.sample_rate) } : {}),
    ...(audio?.channels ? { channels: audio.channels } : {}),
  };
}

export interface ByteRange { start: number; end: number }
export function parseRange(header: string | undefined, size: number): ByteRange | null | undefined {
  if (!header) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!suffix) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) return null;
  return { start, end };
}

const contentTypes: Record<string, string> = { '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.mov': 'video/quicktime', '.m4v': 'video/mp4', '.mkv': 'video/x-matroska', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.aac': 'audio/aac' };

export async function serveMedia(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) throw new HttpError(404, 'Media file not found.');
  const range = parseRange(req.headers.range, info.size);
  if (range === null) {
    res.writeHead(416, { 'Content-Range': `bytes */${info.size}`, 'Accept-Ranges': 'bytes' });
    res.end();
    return;
  }
  const start = range?.start ?? 0;
  const end = range?.end ?? info.size - 1;
  res.writeHead(range ? 206 : 200, {
    'Content-Type': contentTypes[extname(path).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': end - start + 1,
    'Accept-Ranges': 'bytes',
    ...(range ? { 'Content-Range': `bytes ${start}-${end}/${info.size}` } : {}),
    'Cache-Control': 'no-store',
  });
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(path, { start, end }).on('error', () => res.destroy()).pipe(res);
}
