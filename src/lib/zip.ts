// قارئ وكاتب ZIP بسيط يعتمد على zlib المدمج في Node (بدون أي مكتبات خارجية)
import fs from 'fs';
import zlib from 'zlib';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function safeZipName(name: string): string {
  return name
    .split('/')
    .map((part) => part.replace(/[\\:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+$/, '_').trim())
    .filter((part) => part.length > 0)
    .join('/');
}

function dosDateTime(d: Date) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

const MAX_ZIP = 0xfffffff0;

export class ZipWriter {
  private offset = 0;
  private central: Buffer[] = [];
  private names = new Set<string>();
  private count = 0;

  private out: fs.WriteStream;
  constructor(out: fs.WriteStream) { this.out = out; }

  private write(buf: Buffer): Promise<void> {
    this.offset += buf.length;
    if (this.offset > MAX_ZIP) throw new Error('حجم الأرشيف أكبر من 4 جيجابايت، الرجاء التصدير على دفعات (حسب الفرع)');
    return new Promise((resolve, reject) => {
      const ok = this.out.write(buf, (err) => (err ? reject(err) : undefined));
      if (ok) resolve();
      else this.out.once('drain', () => resolve());
    });
  }

  private uniqueName(name: string) {
    let candidate = name;
    let i = 2;
    const dot = name.lastIndexOf('.');
    const base = dot > name.lastIndexOf('/') ? name.slice(0, dot) : name;
    const ext = dot > name.lastIndexOf('/') ? name.slice(dot) : '';
    while (this.names.has(candidate.toLowerCase())) candidate = `${base} (${i++})${ext}`;
    this.names.add(candidate.toLowerCase());
    return candidate;
  }

  async addBuffer(rawName: string, data: Buffer, mtime = new Date()) {
    const name = this.uniqueName(safeZipName(rawName));
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    let method = 8;
    let body: Buffer = zlib.deflateRawSync(data);
    if (body.length >= data.length) { method = 0; body = data; }
    const { time, date } = dosDateTime(mtime);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    const localOffset = this.offset;
    await this.write(Buffer.concat([local, nameBuf]));
    await this.write(body);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(method, 10);
    cen.writeUInt16LE(time, 12);
    cen.writeUInt16LE(date, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(body.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(localOffset, 42);
    this.central.push(Buffer.concat([cen, nameBuf]));
    this.count++;
  }

  async addFile(rawName: string, filePath: string): Promise<boolean> {
    if (!fs.existsSync(filePath)) return false;
    const stat = fs.statSync(filePath);
    await this.addBuffer(rawName, fs.readFileSync(filePath), stat.mtime);
    return true;
  }

  async finish() {
    const cdStart = this.offset;
    const cd = Buffer.concat(this.central);
    await this.write(cd);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(this.count, 8);
    end.writeUInt16LE(this.count, 10);
    end.writeUInt32LE(cd.length, 12);
    end.writeUInt32LE(cdStart, 16);
    await this.write(end);
    await new Promise<void>((resolve, reject) => {
      this.out.on('error', reject);
      this.out.end(() => resolve());
    });
  }
}

export interface ZipEntry {
  name: string;
  isDir: boolean;
  size: number;
  read: () => Buffer;
}

function decodeName(raw: Buffer, flags: number, extra: Buffer): string {
  // Info-ZIP Unicode Path Extra Field (0x7075)
  let i = 0;
  while (i + 4 <= extra.length) {
    const id = extra.readUInt16LE(i);
    const len = extra.readUInt16LE(i + 2);
    if (id === 0x7075 && len > 5) return extra.slice(i + 9, i + 4 + len).toString('utf8');
    i += 4 + len;
  }
  const utf8 = raw.toString('utf8');
  if (flags & 0x0800 || !utf8.includes('\ufffd')) return utf8;
  return raw.toString('latin1');
}

export function readZip(filePath: string): ZipEntry[] {
  const fd = fs.openSync(filePath, 'r');
  const size = fs.fstatSync(fd).size;
  const tailLen = Math.min(size, 65557);
  const tail = Buffer.alloc(tailLen);
  fs.readSync(fd, tail, 0, tailLen, size - tailLen);
  let eocd = -1;
  for (let i = tailLen - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) { fs.closeSync(fd); throw new Error('الملف ليس بصيغة ZIP صحيحة'); }
  const total = tail.readUInt16LE(eocd + 10);
  const cdSize = tail.readUInt32LE(eocd + 12);
  const cdOffset = tail.readUInt32LE(eocd + 16);
  if (cdSize === 0xffffffff || cdOffset === 0xffffffff || total === 0xffff) {
    fs.closeSync(fd);
    throw new Error('ملف ZIP كبير جداً (ZIP64) غير مدعوم، قسّم الملف إلى أجزاء أصغر');
  }
  const cd = Buffer.alloc(cdSize);
  fs.readSync(fd, cd, 0, cdSize, cdOffset);

  const entries: ZipEntry[] = [];
  let p = 0;
  while (p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50) {
    const flags = cd.readUInt16LE(p + 8);
    const method = cd.readUInt16LE(p + 10);
    const csize = cd.readUInt32LE(p + 20);
    const usize = cd.readUInt32LE(p + 24);
    const nameLen = cd.readUInt16LE(p + 28);
    const extraLen = cd.readUInt16LE(p + 30);
    const commentLen = cd.readUInt16LE(p + 32);
    const localOffset = cd.readUInt32LE(p + 42);
    const nameRaw = cd.slice(p + 46, p + 46 + nameLen);
    const extra = cd.slice(p + 46 + nameLen, p + 46 + nameLen + extraLen);
    const name = decodeName(nameRaw, flags, extra).replace(/\\/g, '/');
    p += 46 + nameLen + extraLen + commentLen;

    entries.push({
      name,
      isDir: name.endsWith('/'),
      size: usize,
      read: () => {
        const lh = Buffer.alloc(30);
        fs.readSync(fd, lh, 0, 30, localOffset);
        const dataStart = localOffset + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
        const body = Buffer.alloc(csize);
        fs.readSync(fd, body, 0, csize, dataStart);
        if (method === 0) return body;
        if (method === 8) return zlib.inflateRawSync(body);
        throw new Error(`طريقة ضغط غير مدعومة في الملف ${name}`);
      },
    });
  }
  // نغلق الملف عند انتهاء المعالجة عبر الدالة المرفقة
  (entries as any).close = () => { try { fs.closeSync(fd); } catch { /* ignore */ } };
  return entries;
}

export function closeZip(entries: ZipEntry[]) {
  (entries as any).close?.();
}
