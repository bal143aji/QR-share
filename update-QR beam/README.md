# QRBeam — optical file transfer (screen → camera)

React + TypeScript + Vite + Tailwind PWA. No backend: the file never leaves the two devices.

```
npm install
npm run dev        # camera needs HTTPS or localhost (use a tunnel/mkcert for phones)
npm test           # 10 tests: RS, packets, headers, encrypted/QR/gray4 end-to-end, tearing, 3 MB carousel
npm run build
```

## How it works
1. **Sender** hashes the file (streaming SHA-256 in a Worker), builds a binary header and shows it as a *text* QR (handshake).
2. The file is cut into **segments** (≤ 240 chunks). Each segment is optionally AES-256-GCM encrypted (PBKDF2 key), split into chunks, and gets **Reed-Solomon (Cauchy, GF(256))** parity: FEC off/low/medium/high.
3. Shards are sent as a **one-way carousel**, interleaved across 4 segments (burst-loss protection), looping until the receiver is done.
4. Each screen frame = 4 corner finder markers + a 64-bit sync strip (transfer-ID fragment + frame counter + CRC16) + a fixed grid (1×1, 2×2, 3×3) of independently decodable regions. Each region holds one packet: `magic | type | transferTag | frameSeq | segment | shard | region | len | payload | SHA-256[0..8]`. Modes: **Fast optical** (dense 1- or 2-bit cells, whitened, with reference cells) or **Pure QR** (binary QR per region).
5. **Receiver** (decode Worker): grayscale → finder detection → homography (perspective correction) → per-cell sampling → packet validation → shard stored in IndexedDB → segment rebuilt when any k shards arrive → final streaming SHA-256 over all segments → only then a Blob exists. Mismatch = no file.
6. **Optimize / Benchmark**: sender plays test frames for 8 configurations; the receiver measures real reliability and throughput, recommends the best *reliable* one and shows it as a QR the sender scans.

## Honest performance notes
* **1 GB in 5–10 minutes is not achievable** with a phone/laptop screen and camera (that needs 1.7–3.4 MB/s). Camera resolution, 30–60 fps capture, focus and blur cap the link far below that. Expect roughly tens of KB/s (safe settings) up to a few hundred KB/s (excellent conditions, dense grid). 1 GB is then hours. The app never claims otherwise: the sender shows a labelled *theoretical ceiling*, the receiver shows *measured* speed and ETA.
* The link is one-way, so "adaptive" control is: calibration (measured, then applied via QR), live sender speed buttons, and receiver guidance text. There is no automatic closed loop.
* Verified by the automated tests **in software only** (simulated perspective/blur/noise camera). In that model the binary decoder works down to ~4 px per cell and 4-level gray to ~5 px per cell. **It has not been run on real phones/cameras**, and the UI was compile-checked and bundled but not exercised in a browser here. Expect tuning on real devices.
* Reed-Solomon encoding runs at ~10–20 MB/s in a Worker, far faster than the optical link, so it never bottlenecks.

## Deviations from the brief (deliberate)
* Per-packet checksum is SHA-256 truncated to 64 bits (plus final full SHA-256), not a full 32-byte hash per chunk (would cost 3% payload).
* FEC is Reed-Solomon erasure coding per segment plus carousel repetition, rather than simple XOR parity.
* The handshake/calibration/recommendation QRs are *text* (base64url) so `BarcodeDetector` can read them; binary data QRs are decoded with jsQR, because `BarcodeDetector.rawValue` is a string and can corrupt bytes.
* Finder detection assumes the frame is roughly upright (small rotation) and uses the rear camera.
* Received segments are kept as Blobs in IndexedDB (OPFS would be a further improvement for multi-GB files). `Test F` (one flipped byte → rejection) and duplicate/out-of-order/torn-frame cases are automated tests; move/blur tests (A–C) need real hardware.
