<USER_REQUEST>
# QRBeam — COMPLETE PROJECT UPDATE INSTRUCTION

## CRITICAL RULE

**DO NOT REMOVE ANY EXISTING QRBeam FEATURE, LOGIC, PAGE, COMPONENT, PROTOCOL, UI, PERFORMANCE FEATURE, SECURITY FEATURE, OR OPTICAL TRANSFER FUNCTIONALITY.**

This is an **UPDATE / EXTENSION**, NOT a rewrite.

You must preserve the complete existing QRBeam implementation and add the new transfer modes described below.

### Existing functionality MUST continue working

Do NOT remove or break:

* Pure QR Transfer
* Fast Optical Transfer
* QR handshake
* High-density optical frames
* Multi-region optical transmission
* 1×1 / 2×2 / 3×3 adaptive grid
* Fixed optical region positions
* Synchronization markers
* Frame IDs
* Chunk IDs
* Out-of-order frame handling
* Duplicate-frame elimination
* Missing-frame tracking
* Per-chunk checksum
* Final SHA-256 verification
* FEC / parity
* Frame repetition
* Adaptive transmission rate
* Adaptive grid calibration
* Throughput measurement
* Moving-average speed calculation
* Estimated remaining time
* Camera preprocessing
* Perspective correction
* Camera quality indicators
* IndexedDB storage
* Web Workers
* Large-file memory management
* Streaming/chunk processing
* Optional AES-256-GCM encryption
* PWA/offline capability
* File preview
* Video metadata display
* Transfer resume/recovery
* Benchmark mode
* Demo mode
* Accessibility
* Responsive design
* Error handling
* Existing sender UI
* Existing receiver UI
* Existing project structure
* Existing APIs and modules unless an extension is required

The optical transfer must remain capable of operating with:

**NO Wi-Fi + NO Bluetooth + NO mobile data + NO Internet + NO cable**

The original byte-preserving requirement must remain unchanged.

---

# NEW OBJECTIVE

Extend QRBeam into a **multi-transport file-transfer platform**.

Add these transfer modes:

```text
1. Wi-Fi Fast Transfer
2. Bluetooth Transfer
3. Live Optical Transfer
4. QR Image Relay / Store-and-Forward
```

Also add:

```text
5. Automatic Mode
```

Automatic Mode chooses an available transfer method, while the user must always be able to manually select:

```text
Wi-Fi
Bluetooth
Optical
QR Image Relay
```

---

# 1. NEW TRANSFER ARCHITECTURE

Do NOT create separate file-transfer logic for every mode.

Create a common transfer engine.

Architecture:

```text
                    QRBeam
                      │
                Transfer Engine
                      │
          ┌───────────┼───────────┐
          │           │           │
       Wi-Fi      Bluetooth    Optical
          │           │           │
          └───────────┼───────────┘
                      │
                 QR Relay
                      │
                      ▼
               Common Protocol
                      ↓
                 Chunking
                      ↓
                Packetization
                      ↓
             Checksum / FEC
                      ↓
              Storage / Recovery
                      ↓
                 Reassembly
                      ↓
                  SHA-256
                      ↓
               Original File
```

Create a transport abstraction such as:

```ts
interface TransferTransport {
  initialize(): Promise<void>;
  send(packet: Uint8Array): Promise<void>;
  receive(): Promise<Uint8Array>;
  close(): Promise<void>;
  getCapabilities(): TransportCapabilities;
}
```

Use adapters:

```text
WiFiTransport
BluetoothTransport
OpticalTransport
QRRelayTransport
```

The existing optical implementation should be moved behind the transport abstraction **only if necessary**, without changing its behavior.

---

# 2. WI-FI FAST TRANSFER

Add a new transfer mode:

```text
⚡ Wi-Fi Fast
```

Purpose:

* very large files
* high-speed transfers
* local device-to-device transfer
* no cloud upload
* no backend file storage

Support local transfer through appropriate platform capabilities.

Possible connection types:

```text
Wi-Fi Direct
Local Wi-Fi network
Local-only hotspot
```

The application must NOT require Internet access.

Example:

```text
Sender
   │
   └── Local Wi-Fi
            │
            ▼
        Receiver
```

Show connection state:

```text
Wi-Fi
Connected ✓

Local Network
Internet: Not Required
```

Do NOT upload the file to any backend.

The same:

```text
chunk
checksum
integrity
reassembly
SHA-256
```

pipeline must still be used.

---

# 3. HOTSPOT HANDLING

IMPORTANT:

A hotspot is a Wi-Fi transport.

Do NOT confuse:

```text
Internet
```

with:

```text
Wi-Fi connectivity
```

Example:

```text
Internet: OFF
Wi-Fi: ON
Hotspot: ON
```

This can still support local Wi-Fi file transfer.

However, if the user explicitly selects:

```text
🔴 Optical Only
```

then QRBeam MUST NOT use Wi-Fi, even if a hotspot or local Wi-Fi network exists.

Example:

```text
Wi-Fi available ✓
Bluetooth available ✓
User selected Optical
        ↓
Ignore Wi-Fi
Ignore Bluetooth
        ↓
Use optical transport only
```

Add a clear status:

```text
Optical Only Mode

Wi-Fi: Ignored
Bluetooth: Ignored
Internet: Not Used
```

---

# 4. BLUETOOTH TRANSFER

Add:

```text
🟦 Bluetooth
```

Use appropriate native/platform Bluetooth capabilities where required.

IMPORTANT:

Do NOT fake unrestricted phone-to-phone Bluetooth file transfer in a browser if the browser APIs do not support it.

If the current project is a PWA and direct Bluetooth file transfer is unavailable in the browser:

* keep the PWA optical functionality fully operational
* architect Bluetooth as a transport adapter
* provide the required native/mobile integration layer if the project architecture supports it
* do not create fake Bluetooth progress
* do not simulate successful Bluetooth transfer

The UI must clearly show:

```text
Bluetooth
Available
```

or:

```text
Bluetooth
Unavailable on this platform
```

Never pretend the transfer happened.

---

# 5. QR IMAGE RELAY / STORE-AND-FORWARD MODE

Add a completely new mode:

```text
🖼 QR Image Relay
```

This mode allows the sender to convert the file into a sequence of QR images and share those images through another application.

Example:

```text
File
 ↓
Chunk
 ↓
Packetize
 ↓
Generate QR sequence
 ↓
Download QR images
 ↓
Share using WhatsApp / Telegram / Email / etc.
 ↓
Receiver saves QR images
 ↓
QRBeam imports QR images
 ↓
Decode
 ↓
Reconstruct
 ↓
SHA-256 verification
```

IMPORTANT:

This mode is **not live optical transfer**.

Clearly label it:

```text
QR Image Relay
Store-and-Forward
```

The external messaging application is only transporting the QR images.

Do NOT claim that WhatsApp/Telegram/etc. is bypassed.

---

# 6. SENDER QR RELAY UI

Add a sender option:

```text
Transfer Method

○ Wi-Fi Fast
○ Bluetooth
○ Live Optical
● QR Image Relay
○ Automatic
```

When QR Image Relay is selected:

```text
Select File
      ↓
Generate QR Sequence
      ↓
Prepare QR Package
```

Show:

```text
File:
movie.mp4

Size:
1.00 GB

QR Frames:
XXXXXX

Estimated Package Size:
XXXX MB
```

Do NOT generate millions of QR images into memory.

Generate incrementally.

---

# 7. QR DOWNLOAD OPTIONS

Add:

```text
[ Download QR Images ]

[ Download QR Package ]

[ Download Selected ]

[ Share ]
```

Do NOT require users to manually save every QR image.

Create a QR package format:

```text
QRBeam_Transfer_<transferId>.zip
```

Inside:

```text
manifest.qrb

QR_000001.png
QR_000002.png
QR_000003.png
...
```

The package must not contain the original file unless explicitly required for another purpose.

The QR images themselves contain the transferred binary packets.

---

# 8. QR IMAGE PACKET FORMAT

Do NOT encode large JSON payloads.

Use the existing binary-safe protocol.

Every QR payload should identify:

```text
MAGIC
PROTOCOL_VERSION
TRANSFER_ID
FILE_ID
FRAME_SEQUENCE
CHUNK_INDEX
BLOCK_INDEX
PAYLOAD_LENGTH
PAYLOAD
PAYLOAD_CHECKSUM
```

Use compact binary serialization.

Do NOT do:

```text
Binary
↓
Base64
↓
Huge JSON
↓
QR
```

for the high-density protocol.

Maintain the existing binary packet architecture.

---

# 9. RECEIVER UI — GOOGLE-PAY-STYLE FLOW

Update the receiver page.

Create two primary methods:

```text
┌────────────────────────────────────┐
│              RECEIVE               │
│                                    │
│      ┌────────────────────────┐    │
│      │                        │    │
│      │      CAMERA SCANNER    │    │
│      │                        │    │
│      └────────────────────────┘    │
│                                    │
│         Scan QR Live               │
│                                    │
│              OR                    │
│                                    │
│   [ 🖼 Import QR Images ]          │
│                                    │
└────────────────────────────────────┘
```

The user can:

### Method A

Use camera scanning.

```text
Scan Live QR
```

### Method B

Upload QR images from:

```text
Gallery
Files
Photos
Downloaded images
```

---

# 10. MULTIPLE IMAGE IMPORT

The receiver MUST support selecting many QR images at once.

Example:

```text
[ Import QR Images ]

Select:
5
50
100
500
1000+
```

Do NOT force one-by-one upload.

Process them using a Worker where practical.

Display:

```text
QR Images Selected       250
Successfully Decoded     231
Invalid                    4
Duplicates                15
Missing                    0
```

Progress:

```text
██████████████████░░ 90%
```

---

# 11. QR IMAGE ORDER MUST NOT MATTER

The receiver must NOT rely on filename order.

Example imported order:

```text
QR_000003
QR_000001
QR_000005
QR_000002
QR_000004
```

The protocol sequence numbers determine the correct order.

Internally:

```ts
frames.set(frameSequence, packet);
```

Then reconstruct based on sequence/chunk IDs.

---

# 12. DUPLICATE DETECTION

If an image is imported multiple times:

```text
QR_000003
QR_000003
QR_000003
```

the receiver must keep only one logical packet.

Display:

```text
Imported: 5
Unique: 3
Duplicates: 2
```

Do NOT treat duplicates as additional file data.

---

# 13. MISSING QR DETECTION

Example:

```text
001
002
003
005
006
```

Display:

```text
Missing Frames

004
```

Show:

```text
Received:
5 / 6

83.33%
```

Add:

```text
[ Import More QR Images ]
```

The receiver must allow the user to return later and add missing QR images.

Do not restart the entire reconstruction.

---

# 14. QR RELAY RESUME

If the receiver already has:

```text
85% of frames
```

and imports more images later, only newly discovered frames should be added.

Maintain transfer state in IndexedDB.

Example stores:

```text
transfers
chunks
frames
metadata
checksums
recovery
```

Do NOT delete the partial transfer until the user cancels it or it completes successfully.

---

# 15. QR IMAGE VALIDATION

Every imported image must be validated.

Validate:

```text
MAGIC
PROTOCOL VERSION
TRANSFER ID
PACKET TYPE
LENGTH
CHECKSUM
```

If invalid:

```text
Ignore image
```

Do NOT crash.

Do NOT add invalid data to the reconstructed file.

---

# 16. QR IMAGE QUALITY HANDLING

Make the receiver tolerant of:

```text
rotation
scaling
minor perspective
different image dimensions
reasonable compression
brightness differences
```

But do NOT assume arbitrary image manipulation is lossless.

Display a recommendation:

```text
For best reliability:
Send QR images as original files/documents
rather than compressed preview images.
```

This is especially important when using messaging applications that may resize/compress images.

---

# 17. QR RELAY TRANSFER COMPLETE

After all packets are decoded:

```text
Validate Frames
      ↓
Validate Checksums
      ↓
Reassemble Chunks
      ↓
Calculate SHA-256
      ↓
Compare Sender Hash
```

Only then:

```text
✓ TRANSFER VERIFIED

File:
movie.mp4

Size:
1.00 GB

SHA-256:
MATCH

Integrity:
100% VERIFIED
```

Never show successful transfer before final integrity verification.

---

# 18. COMMON TRANSFER DASHBOARD

Update the existing transfer dashboard so it works for ALL transports.

Show:

```text
File
Progress
Transferred
Speed
Estimated Remaining
Frames / Packets
Valid Packets
Duplicates
Recovered
Error Rate
Transport
Integrity
```

For Wi-Fi:

```text
Transport:
⚡ Wi-Fi Local
```

For Bluetooth:

```text
Transport:
🟦 Bluetooth
```

For live optical:

```text
Transport:
🔴 Live Optical • 2×2
```

For QR relay:

```text
Transport:
🖼 QR Image Relay
```

---

# 19. AUTOMATIC MODE

Add:

```text
⚙ Automatic
```

Decision logic:

```text
Start Transfer
      ↓
Check available transports
      ↓
Wi-Fi available?
      │
      ├── YES → Wi-Fi Fast
      │
      └── NO
             ↓
       Bluetooth available?
             │
             ├── YES → Bluetooth
             │
             └── NO
                    ↓
             Live Optical
```

However:

**Do NOT automatically select optical if the user explicitly selected another method.**

Manual selection always overrides automatic selection.

Also allow:

```text
Automatic
Fastest available
```

to be a separate choice.

---

# 20. EXPLICIT OPTICAL-ONLY TEST MODE

Add a clear button:

```text
🔴 Optical Only
```

When selected:

```text
Wi-Fi OFF / ignored
Bluetooth OFF / ignored
Mobile Data OFF / ignored
Internet OFF / ignored
Cable OFF
```

Use:

```text
Screen → Camera
```

only.

This mode is essential for demonstrating the original project concept.

---

# 21. TRANSFER METHOD CARD

On Home Page add:

```text
Transfer Method

⚡ Wi-Fi Fast
Fast local transfer

🟦 Bluetooth
Bluetooth transfer

🔴 Live Optical
No Wi-Fi • No Bluetooth

🖼 QR Image Relay
Download QR images and share anywhere

⚙ Automatic
Choose available method
```

Do not remove the existing Send File / Receive File workflow.

---

# 22. LARGE FILE RULE

Keep the original large-file memory-management architecture.

NEVER:

```text
1 GB File
+
1 GB Base64
+
1 GB QR string array
+
1 GB generated images
+
1 GB decoded copy
```

Instead:

```text
Read chunk
 ↓
Process
 ↓
Create packet
 ↓
Transmit / generate QR
 ↓
Release temporary representation
 ↓
Next chunk
```

Use Workers and IndexedDB wherever appropriate.

Do NOT pre-generate every QR image for a 1 GB file and hold them all in RAM.

---

# 23. PERFORMANCE MODE SELECTION

The app should recommend transports based on file size.

Do NOT hard-code unrealistic claims.

Example UI guidance:

```text
Small file
→ QR / QR Relay

Medium file
→ Wi-Fi / Bluetooth / Optical

Large file
→ Wi-Fi / Bluetooth / Fast Optical

1 GB+
→ Fastest available transport recommended
```

These are recommendations only.

Always display real measured throughput.

Never fake:

```text
5 minutes guaranteed
```

Instead:

```text
Target:
5–10 min

Current measured estimate:
08:42
```

---

# 24. INTEGRITY MUST BE COMMON TO ALL MODES

Regardless of transport:

```text
Wi-Fi
Bluetooth
Optical
QR Relay
```

the final result must pass:

```text
SHA-256(originalFile)
==
SHA-256(receivedFile)
```

Only after a match:

```text
TRANSFER VERIFIED
```

This requirement must remain identical to the existing QRBeam design.

---

# 25. SECURITY REQUIREMENTS

Keep existing security.

Do NOT remove:

```text
SHA-256
AES-256-GCM
Web Crypto
temporary data cleanup
no cloud file storage
no raw file logging
```

For QR Relay:

* do not put private encryption keys into plaintext QR payloads
* preserve existing encryption/session mechanism
* validate transfer ID
* validate protocol version
* validate checksums
* reject unexpected packets

---

# 26. NO BACKEND FILE STORAGE

Do NOT introduce:

```text
Firebase Storage
Supabase Storage
AWS S3
Cloudinary
Google Drive
Dropbox
backend file upload
```

for the actual transfer.

The actual file must remain on the sender/receiver devices for QRBeam transfer modes.

For QR Relay, the external messaging application only transports the exported QR images/package selected by the user.

---

# 27. PROJECT STRUCTURE UPDATE

Keep the existing project structure.

Add only the necessary modules.

Suggested extension:

```text
src/
│
├── services/
│   │
│   ├── transport/
│   │   ├── transport.ts
│   │   ├── transportManager.ts
│   │   ├── wifiTransport.ts
│   │   ├── bluetoothTransport.ts
│   │   ├── opticalTransport.ts
│   │   └── qrRelayTransport.ts
│   │
│   ├── qr-relay/
│   │   ├── qrPackage.ts
│   │   ├── qrImageGenerator.ts
│   │   ├── qrImageImporter.ts
│   │   ├── qrBatchDecoder.ts
│   │   ├── frameIndex.ts
│   │   └── relayRecovery.ts
│
├── pages/
│   ├── ...
│   ├── TransportSelectPage.tsx
│   └── QRRelayPage.tsx
│
├── components/
│   ├── ...
│   ├── TransportSelector.tsx
│   ├── QRImageImporter.tsx
│   ├── QRPackageExporter.tsx
│   ├── MissingFramesPanel.tsx
│   └── TransportStatus.tsx
```

Do NOT delete or replace existing modules unless absolutely required for integration.

---

# 28. TYPE DEFINITIONS

Add:

```ts
type TransferMode =
  | "wifi"
  | "bluetooth"
  | "optical"
  | "qr-relay"
  | "automatic";
```

Add:

```ts
interface TransportCapabilities {
  wifi: boolean;
  bluetooth: boolean;
  optical: boolean;
  qrRelay: boolean;
}
```

Add transport status:

```ts
type TransportStatus =
  | "available"
  | "unavailable"
  | "connecting"
  | "connected"
  | "transferring"
  | "completed"
  | "error";
```

---

# 29. TESTING

Do NOT test only the UI.

Create real tests for:

### Existing Optical Tests

```text
10 MB
50 MB
100 MB
250 MB
500 MB
1 GB
```

### Wi-Fi

```text
small file
100 MB
500 MB
1 GB
```

### Bluetooth

Use supported platform implementation and validate actual bytes.

### QR Relay

Test:

```text
1 MB
10 MB
50 MB
100 MB
```

Test:

```text
ordered images
unordered images
duplicate images
missing image
corrupted image
wrong transfer ID
wrong checksum
partial import
resume import
```

---

# 30. QR RELAY FAILURE TEST

Example:

```text
Frames:
001
002
003
004
005
```

Import:

```text
001
002
004
005
```

Expected:

```text
Missing:
003
```

Then import:

```text
003
```

Expected:

```text
All frames received
```

Then:

```text
SHA-256 verification
```

Expected:

```text
✓ VERIFIED
```

---

# 31. NO FALSE SUCCESS

Absolutely do NOT create:

```text
fake speed
fake progress
fake frame count
fake Bluetooth transfer
fake Wi-Fi transfer
fake QR decoding
fake SHA-256
fake receiver
fake completed file
```

Everything must represent actual operations.

The existing requirement is:

```text
transfer actual bytes
verify chunks
track missing frames
recover errors
verify final SHA-256
```

Keep this unchanged.

---

# 32. FINAL HOME SCREEN

Create a polished UI similar to:

```text
┌────────────────────────────────────────┐
│                 QRBeam                 │
│                                        │
│       High-Speed File Transfer         │
│                                        │
│          [ SEND FILE ]                 │
│          [ RECEIVE FILE ]              │
│                                        │
│ ─────────────────────────────────────  │
│                                        │
│ Transfer Method                        │
│                                        │
│ ⚡ Wi-Fi Fast                          │
│ 🟦 Bluetooth                           │
│ 🔴 Live Optical                        │
│ 🖼 QR Image Relay                      │
│ ⚙ Automatic                            │
│                                        │
│ Privacy                                │
│ Files stay on your devices             │
│                                        │
└────────────────────────────────────────┘
```

---

# 33. FINAL PRODUCT DESCRIPTION

Update the product description to:

> **QRBeam is a multi-transport file transfer system that supports high-speed Wi-Fi and Bluetooth transfer, live wireless-free optical screen-to-camera transfer, and QR Image Relay for store-and-forward sharing through messaging or other applications. All transfer modes use a common binary-safe protocol with chunk verification, recovery, and SHA-256 integrity validation to reconstruct the original file without re-encoding or quality loss.**

Do NOT remove the original wireless-free optical identity.

---

# 34. IMPLEMENTATION PRIORITY

Implement in this order:

```text
1. Preserve all existing functionality
          ↓
2. Create common transport abstraction
          ↓
3. Add Wi-Fi transport
          ↓
4. Add Bluetooth transport architecture
          ↓
5. Add QR Image Relay
          ↓
6. Add QR image batch import
          ↓
7. Add duplicate/missing frame recovery
          ↓
8. Add transport selector
          ↓
9. Add Automatic Mode
          ↓
10. Add tests
          ↓
11. Benchmark
          ↓
12. Polish UI
```

Do NOT rewrite the working optical system merely to add these features.

---

# 35. FINAL ACCEPTANCE CRITERIA

The updated QRBeam project is complete only when ALL of these are true:

### Existing Optical Transfer

```text
File
→ QR handshake
→ optical frames
→ camera
→ decode
→ chunks
→ recovery
→ SHA-256
→ original file
```

continues to work.

### Wi-Fi

```text
File
→ local Wi-Fi
→ receiver
→ SHA-256
→ verified file
```

works using actual local transfer.

### Bluetooth

```text
File
→ Bluetooth
→ receiver
→ SHA-256
→ verified file
```

works only on platforms where the required Bluetooth implementation is genuinely available.

### QR Image Relay

```text
File
→ QR sequence
→ Download QR package/images
→ WhatsApp/other application
→ Receiver imports images
→ batch decode
→ reorder
→ duplicate removal
→ missing-frame detection
→ recovery
→ reassembly
→ SHA-256
→ original file
```

works.

### Optical-only demonstration

With:

```text
Wi-Fi OFF
Bluetooth OFF
Mobile Data OFF
Internet OFF
```

the original:

```text
Screen → Camera
```

transfer still works.

---

# FINAL COMMAND

**Update the existing QRBeam project in place.**

**DO NOT START OVER.**

**DO NOT REMOVE EXISTING FEATURES.**

**DO NOT REPLACE THE EXISTING OPTICAL PROTOCOL.**

**DO NOT DELETE EXISTING PAGES OR COMPONENTS.**

**DO NOT BREAK EXISTING TRANSFER LOGIC.**

**ADD the new Wi-Fi, Bluetooth, QR Image Relay, transport selector, Automatic Mode, QR image export/import, batch decoding, missing-frame recovery, duplicate elimination, and common transport architecture on top of the existing implementation.**

After implementation:

1. Run the application.
2. Check every existing page.
3. Test existing optical transfer.
4. Test the new Wi-Fi mode.
5. Test Bluetooth where genuinely supported.
6. Test QR Image Relay with unordered QR images.
7. Test duplicates.
8. Test missing QR images.
9. Test corrupted QR packets.
10. Test final SHA-256 verification.
11. Test partial/resume QR imports.
12. Verify no fake progress or fake transfer statistics exist.
13. Verify no file is uploaded to a backend.
14. Verify large files are processed incrementally.
15. Verify the final received file is byte-identical when integrity verification passes.

**Preserve every existing capability and make the new functionality additive.**

</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-09-26T15:27:16+05:30.

The user's current state is as follows:
Active Document: c:\Users\Balaji\OneDrive\Desktop\update-QR beam\index.html (LANGUAGE_HTML)
Cursor is on line: 1
Other open documents:
- c:\Users\Balaji\OneDrive\Desktop\update-QR beam\index.html (LANGUAGE_HTML)
</ADDITIONAL_METADATA>
<USER_SETTINGS_CHANGE>
The user changed setting `Model Selection` from None to Claude Sonnet 4.6 (Thinking). No need to comment on this change if the user doesn't ask about it. If reporting what model you are, please use a human readable name instead of the exact string.
</USER_SETTINGS_CHANGE>