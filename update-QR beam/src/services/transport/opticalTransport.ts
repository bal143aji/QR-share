/**
 * Optical Transport Adapter
 *
 * This is a thin adapter that wraps the existing optical SenderEngine
 * behind the TransferTransport interface. It preserves all existing
 * optical transfer logic completely unchanged.
 *
 * The existing SenderEngine, FramePipeline, calibration, FEC, etc.
 * are NOT modified — this adapter simply provides the interface bridge.
 */

import type { TransferTransport, TransportCapabilities } from '../../types/transport';

/**
 * OpticalTransport — wraps existing optical transfer behind the transport interface.
 * All actual optical logic remains in senderEngine.ts and receiverPipeline.ts.
 */
export class OpticalTransport implements TransferTransport {
  // Optical transport operates via canvas display + camera capture
  // The existing SenderEngine handles all sending
  // The existing FramePipeline handles all receiving
  // This adapter exists for interface conformance only

  async initialize(): Promise<void> {
    // Optical transport is always available — nothing to initialize
    // The SenderEngine and ReceiverClient are initialized by their respective pages
  }

  async send(_packet: Uint8Array): Promise<void> {
    // Optical sending is handled by SenderEngine via canvas rendering
    // This method is not called directly in optical mode
    throw new Error(
      'Optical send is handled by SenderEngine. Use the existing optical sender workflow.'
    );
  }

  async receive(): Promise<Uint8Array> {
    // Optical receiving is handled by FramePipeline via camera
    // This method is not called directly in optical mode
    throw new Error(
      'Optical receive is handled by FramePipeline. Use the existing optical receiver workflow.'
    );
  }

  async close(): Promise<void> {
    // Teardown handled by SenderEngine.stop() and ReceiverClient.dispose()
  }

  getCapabilities(): TransportCapabilities {
    return {
      wifi: false,
      bluetooth: false,
      optical: true,
      qrRelay: true,
    };
  }
}
