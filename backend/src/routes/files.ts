import { Router } from "express";
import { randomUUID } from "crypto";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { authenticate, validate, schemas, standardRateLimit, logger } from "../middleware/index.js";
import { db, cards, cardContext } from "../db/index.js";
import { getClient } from "../db/index.js";
import { insertIntoFTS } from "../db/fts.js";

export const fileRoutes = Router();

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_MIME_TYPES = [
  // Images
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml", "image/heic",
  // Documents
  "application/pdf", "text/plain", "text/markdown", "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // Audio (parity with existing audio endpoint)
  "audio/webm", "audio/mp3", "audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg",
];

const IMAGE_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml", "image/heic",
]);

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif",
  "image/webp": "webp", "image/svg+xml": "svg", "image/heic": "heic",
  "application/pdf": "pdf", "text/plain": "txt", "text/markdown": "md",
  "text/csv": "csv", "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "audio/webm": "webm", "audio/mp3": "mp3", "audio/mpeg": "mp3",
  "audio/mp4": "m4a", "audio/wav": "wav", "audio/ogg": "ogg",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function processUpload(body: { fileData: string; mimeType: string; filename?: string }) {
  const { fileData, mimeType, filename } = body;
  const normalizedMime = mimeType.toLowerCase();

  if (!ALLOWED_MIME_TYPES.includes(normalizedMime)) {
    return { error: { status: 400, code: "INVALID_MIME_TYPE", message: `Unsupported file type: ${mimeType}` } };
  }

  const buffer = Buffer.from(fileData, "base64");

  if (buffer.length > MAX_FILE_SIZE) {
    return {
      error: {
        status: 413, code: "FILE_TOO_LARGE",
        message: `File exceeds maximum size of ${MAX_FILE_SIZE / (1024 * 1024)}MB. Received: ${(buffer.length / (1024 * 1024)).toFixed(2)}MB`,
      },
    };
  }

  const fileId = randomUUID();
  const ext = MIME_TO_EXT[normalizedMime] || "bin";
  const storedFilename = `${fileId}.${ext}`;

  const uploadsDir = "./uploads";
  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true });
  }

  writeFileSync(join(uploadsDir, storedFilename), buffer);

  const originalName = filename || `file.${ext}`;

  return {
    file: {
      id: fileId,
      url: `/uploads/${storedFilename}`,
      filename: storedFilename,
      originalName,
      mimeType: normalizedMime,
      size: buffer.length,
      isImage: IMAGE_TYPES.has(normalizedMime),
    },
  };
}

// Upload a file (general purpose)
fileRoutes.post("/upload", authenticate, standardRateLimit, validate({ body: schemas.uploadFile }), async (req, res) => {
  try {
    const result = processUpload(req.body);
    if (result.error) {
      return res.status(result.error.status).json({ error: { code: result.error.code, message: result.error.message } });
    }
    res.json(result.file);
  } catch (error) {
    logger.error("Error uploading file", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: "Failed to upload file" });
  }
});

// Upload a file directly to the Library of Context
fileRoutes.post("/upload-to-library", authenticate, standardRateLimit, validate({ body: schemas.uploadFile }), async (req, res) => {
  try {
    const result = processUpload(req.body);
    if (result.error) {
      return res.status(result.error.status).json({ error: { code: result.error.code, message: result.error.message } });
    }

    const file = result.file!;
    const userId = req.user!.id;
    const userName = req.user!.name || "Unknown";
    const now = new Date();
    const cardId = randomUUID();
    const contextId = randomUUID();

    // Create a card to own this context
    await db.insert(cards).values({
      id: cardId,
      content: `Uploaded file: ${file.originalName}`,
      sourceType: "self",
      visibility: "private",
      status: "active",
      fromUserId: userId,
      createdAt: now,
      updatedAt: now,
    });

    // Create card_context entry
    const rawText = `File: ${file.originalName}\nType: ${file.mimeType}\nSize: ${formatBytes(file.size)}`;
    await db.insert(cardContext).values({
      id: contextId,
      cardId,
      userId,
      userName,
      originalType: "document",
      originalRawText: rawText,
      originalFileUrl: file.url,
      originalFileName: file.originalName,
      originalFileMimeType: file.mimeType,
      originalFileSize: file.size,
      capturedAt: now,
      createdAt: now,
    });

    // Index in FTS5
    const client = getClient();
    await insertIntoFTS(client, {
      contextId,
      cardId,
      userId,
      userName,
      originalType: "document",
      capturedAt: now.getTime(),
      originalRawText: rawText,
    });

    res.json({
      file,
      card: { id: cardId },
      context: { id: contextId },
    });
  } catch (error) {
    logger.error("Error uploading file to library", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: "Failed to upload file to library" });
  }
});
