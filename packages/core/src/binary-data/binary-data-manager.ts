import { randomUUID } from 'node:crypto';
import type { IBinaryData } from '@n8n-clone/workflow';

export interface IBinaryDataMetadata {
  mimeType: string;
  fileName?: string;
  fileExtension?: string;
}

/**
 * Minimal in-memory binary data store, referenced by id from IBinaryData rather than
 * inlining buffers into item JSON (per the M1 architecture note). This is intentionally a
 * placeholder: real durability — persisting to disk or S3 so binary data survives a process
 * restart and doesn't blow up memory on large files — is execution-history territory that
 * lands in M9 alongside data pruning. The HTTP Request node's file download support needs
 * *somewhere* to put bytes now, and this is the simplest thing that could work for M5.
 */
export class BinaryDataManager {
  private readonly buffers = new Map<string, Buffer>();

  store(buffer: Buffer, metadata: IBinaryDataMetadata): IBinaryData {
    const id = randomUUID();
    this.buffers.set(id, buffer);
    return {
      id,
      mimeType: metadata.mimeType,
      fileName: metadata.fileName,
      fileExtension: metadata.fileExtension,
      fileSize: String(buffer.length),
    };
  }

  retrieve(id: string): Buffer {
    const buffer = this.buffers.get(id);
    if (!buffer) {
      throw new Error(`Binary data "${id}" not found`);
    }
    return buffer;
  }

  has(id: string): boolean {
    return this.buffers.has(id);
  }
}
