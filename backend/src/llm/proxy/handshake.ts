import type { BufferedReader } from "./buffered-reader";
import { ProxyConnectError } from "./errors";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Tunnel set-up for the two proxy kinds: both end with a raw TCP pipe to the target host. */
export async function performSocks5Handshake(
  br: BufferedReader,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  targetHost: string,
  targetPort: number,
  username: string,
  password: string,
): Promise<void> {
  const hasAuth = username.length > 0 || password.length > 0;
  // 1. Greeting
  await writer.write(
    hasAuth ? new Uint8Array([0x05, 0x02, 0x00, 0x02]) : new Uint8Array([0x05, 0x01, 0x00]),
  );
  const greetResp = await br.readExact(2);
  if (greetResp[0] !== 0x05) {
    throw new Error(`SOCKS5 invalid version: ${greetResp[0]}`);
  }
  const method = greetResp[1];
  if (method === 0xff) {
    throw new Error("SOCKS5 proxy rejected all authentication methods");
  }

  // 2. RFC 1929 Username/Password Auth
  if (method === 0x02) {
    const uBytes = encoder.encode(username);
    const pBytes = encoder.encode(password);
    if (uBytes.length > 255 || pBytes.length > 255) {
      throw new Error("SOCKS5 username/password exceeds 255 bytes");
    }
    const authReq = new Uint8Array(3 + uBytes.length + pBytes.length);
    authReq[0] = 0x01;
    authReq[1] = uBytes.length;
    authReq.set(uBytes, 2);
    authReq[2 + uBytes.length] = pBytes.length;
    authReq.set(pBytes, 3 + uBytes.length);
    await writer.write(authReq);

    const authResp = await br.readExact(2);
    if (authResp[1] !== 0x00) {
      throw new Error(`SOCKS5 authentication failed (status=${authResp[1]})`);
    }
  } else if (method !== 0x00) {
    throw new Error(`SOCKS5 unsupported auth method: ${method}`);
  }

  // 3. CONNECT request (ATYP = 0x03 domain so DNS resolves on proxy)
  const hostBytes = encoder.encode(targetHost);
  if (hostBytes.length > 255) {
    throw new Error("Target hostname exceeds 255 bytes");
  }
  const req = new Uint8Array(7 + hostBytes.length);
  req[0] = 0x05; // VER
  req[1] = 0x01; // CMD = CONNECT
  req[2] = 0x00; // RSV
  req[3] = 0x03; // ATYP = DOMAINNAME
  req[4] = hostBytes.length;
  req.set(hostBytes, 5);
  req[5 + hostBytes.length] = (targetPort >> 8) & 0xff;
  req[6 + hostBytes.length] = targetPort & 0xff;
  await writer.write(req);

  // 4. Read CONNECT reply
  const replyHead = await br.readExact(4);
  if (replyHead[0] !== 0x05) throw new Error("Invalid SOCKS5 CONNECT reply");
  if (replyHead[1] !== 0x00) throw new ProxyConnectError(replyHead[1]!);
  const atyp = replyHead[3];
  if (atyp === 0x01) {
    await br.readExact(6);
  } else if (atyp === 0x04) {
    await br.readExact(18);
  } else if (atyp === 0x03) {
    const lenByte = await br.readExact(1);
    await br.readExact(lenByte[0]! + 2);
  } else {
    throw new Error(`SOCKS5 unknown reply ATYP: ${atyp}`);
  }
}

export async function performHttpConnectHandshake(
  br: BufferedReader,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  targetHost: string,
  targetPort: number,
  username: string,
  password: string,
): Promise<void> {
  const CRLFCRLF = new Uint8Array([13, 10, 13, 10]);
  const lines = [
    `CONNECT ${targetHost}:${targetPort} HTTP/1.1`,
    `Host: ${targetHost}:${targetPort}`,
  ];
  if (username || password) {
    lines.push(`Proxy-Authorization: Basic ${btoa(`${username}:${password}`)}`);
  }
  lines.push("", "");
  await writer.write(encoder.encode(lines.join("\r\n")));

  const headerBytes = await br.readUntil(CRLFCRLF);
  const statusLine = decoder.decode(headerBytes).split("\r\n")[0] ?? "";
  if (!/^HTTP\/1\.[01]\s+200\b/.test(statusLine)) {
    throw new Error(`HTTP CONNECT proxy failed: ${statusLine}`);
  }
}
