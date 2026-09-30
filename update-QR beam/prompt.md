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
4. QR Image Relay / Store-and-Forwa
<truncated 22283 bytes>
 Data OFF
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