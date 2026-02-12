import { Router } from "express";
import { randomUUID } from "crypto";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { authenticate, validate, schemas, aiRateLimit, logger } from "../middleware/index.js";

export const audioRoutes = Router();

// Audio validation constants
const MAX_AUDIO_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_AUDIO_MIME_TYPES = [
  "audio/webm",
  "audio/mp3",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/ogg",
  "audio/flac",
  "audio/x-m4a",
  "audio/aac",
];

// Upload audio file (stores locally for now, would use S3/CloudFlare R2 in production)
audioRoutes.post("/upload", authenticate, aiRateLimit, validate({ body: schemas.uploadAudio }), async (req, res) => {
  try {
    const { audioData, mimeType } = req.body;

    // Validate MIME type
    if (mimeType && !ALLOWED_AUDIO_MIME_TYPES.includes(mimeType.toLowerCase())) {
      return res.status(400).json({
        error: {
          code: "INVALID_MIME_TYPE",
          message: `Unsupported audio format: ${mimeType}. Allowed: ${ALLOWED_AUDIO_MIME_TYPES.join(", ")}`,
        },
      });
    }

    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audioData, "base64");

    // Validate file size (10MB limit)
    if (audioBuffer.length > MAX_AUDIO_SIZE) {
      return res.status(413).json({
        error: {
          code: "FILE_TOO_LARGE",
          message: `Audio file exceeds maximum size of ${MAX_AUDIO_SIZE / (1024 * 1024)}MB. Received: ${(audioBuffer.length / (1024 * 1024)).toFixed(2)}MB`,
        },
      });
    }

    // Generate unique filename
    const fileId = randomUUID();
    const extension = mimeType?.includes("webm") ? "webm" : "mp3";
    const filename = `${fileId}.${extension}`;

    // In production, upload to S3/R2
    // For now, store locally
    const uploadsDir = "./uploads";
    if (!existsSync(uploadsDir)) {
      mkdirSync(uploadsDir, { recursive: true });
    }

    const filepath = join(uploadsDir, filename);
    writeFileSync(filepath, audioBuffer);

    // Return URL (would be CDN URL in production)
    const url = `/uploads/${filename}`;

    res.json({
      id: fileId,
      url,
      filename,
      size: audioBuffer.length,
    });
  } catch (error) {
    logger.error("Error uploading audio", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: "Failed to upload audio" });
  }
});
