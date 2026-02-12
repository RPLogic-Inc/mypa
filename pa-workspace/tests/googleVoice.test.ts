import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  readPaInbox: vi.fn(),
  sendFromPa: vi.fn(),
}));

vi.mock("../src/middleware/logging.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../src/services/googleGmail.js", () => ({
  readPaInbox: mocks.readPaInbox,
  sendFromPa: mocks.sendFromPa,
}));

import { detectVoiceNumber, readVoiceSms, sendVoiceSms } from "../src/services/googleVoice.js";

const baseCreds = {
  serviceAccountJson: '{"client_email":"sa@test.com","private_key":"key"}',
  paEmail: "alice-pa@pa.test.com",
};

describe("Google Voice Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("detectVoiceNumber", () => {
    it("detects phone number from Voice notification email", async () => {
      mocks.readPaInbox.mockResolvedValue([{
        id: "msg-1",
        subject: "New text message from: +1 (555) 123-4567",
        body: "New text message from: +1 (555) 123-4567\nHey, are you there?",
        date: "2026-02-06T10:00:00Z",
      }]);

      const result = await detectVoiceNumber(baseCreds);

      expect(result).toBe("+15551234567");
      expect(mocks.readPaInbox).toHaveBeenCalledWith(expect.objectContaining({
        paEmail: "alice-pa@pa.test.com",
        query: expect.stringContaining("voice-noreply@google.com"),
        maxResults: 1,
      }));
    });

    it("detects number with different formatting", async () => {
      mocks.readPaInbox.mockResolvedValue([{
        id: "msg-2",
        subject: "New voicemail",
        body: "Voicemail from 555-987-6543\nDuration: 30 seconds",
        date: "2026-02-06T11:00:00Z",
      }]);

      const result = await detectVoiceNumber(baseCreds);

      expect(result).toBe("5559876543");
    });

    it("returns null when no Voice messages found", async () => {
      mocks.readPaInbox.mockResolvedValue([]);

      const result = await detectVoiceNumber(baseCreds);

      expect(result).toBeNull();
    });

    it("returns null when message has no recognizable number", async () => {
      mocks.readPaInbox.mockResolvedValue([{
        id: "msg-3",
        subject: "Voice setup",
        body: "Welcome to Google Voice! Your account is ready.",
        date: "2026-02-06T12:00:00Z",
      }]);

      const result = await detectVoiceNumber(baseCreds);

      expect(result).toBeNull();
    });

    it("returns null on Gmail API error", async () => {
      mocks.readPaInbox.mockRejectedValue(new Error("Gmail API error"));

      const result = await detectVoiceNumber(baseCreds);

      expect(result).toBeNull();
    });
  });

  describe("readVoiceSms", () => {
    it("reads and parses SMS messages", async () => {
      mocks.readPaInbox.mockResolvedValue([
        {
          id: "sms-1",
          subject: "New text message from +15559999999",
          body: "New text message\nHey, are you available for lunch?",
          date: "2026-02-06T10:00:00Z",
        },
        {
          id: "vm-1",
          subject: "New voicemail from +15558888888",
          body: "New voicemail\nHi, please call me back about the project update.",
          date: "2026-02-06T09:00:00Z",
        },
      ]);

      const result = await readVoiceSms({ ...baseCreds, maxResults: 10 });

      expect(result).toHaveLength(2);

      // SMS
      expect(result[0].gmailMessageId).toBe("sms-1");
      expect(result[0].isVoicemail).toBe(false);
      expect(result[0].body).toContain("Hey, are you available for lunch?");

      // Voicemail
      expect(result[1].gmailMessageId).toBe("vm-1");
      expect(result[1].isVoicemail).toBe(true);
      expect(result[1].body).toContain("please call me back");
    });

    it("extracts sender phone from 'from:' pattern in body", async () => {
      mocks.readPaInbox.mockResolvedValue([{
        id: "sms-2",
        subject: "New text message",
        body: "from: +1 (555) 444-3333\nHello there!",
        date: "2026-02-06T10:00:00Z",
      }]);

      const result = await readVoiceSms(baseCreds);

      expect(result[0].from).toBe("+15554443333");
    });

    it("returns empty array on Gmail error", async () => {
      mocks.readPaInbox.mockRejectedValue(new Error("API error"));

      const result = await readVoiceSms(baseCreds);

      expect(result).toHaveLength(0);
    });

    it("uses correct Gmail query for Voice messages", async () => {
      mocks.readPaInbox.mockResolvedValue([]);

      await readVoiceSms(baseCreds);

      expect(mocks.readPaInbox).toHaveBeenCalledWith(expect.objectContaining({
        query: expect.stringContaining("voice-noreply@google.com"),
      }));
    });
  });

  describe("sendVoiceSms", () => {
    it("sends SMS via Gmail to txt.voice.google.com", async () => {
      mocks.sendFromPa.mockResolvedValue({ messageId: "sent-sms-1" });

      const result = await sendVoiceSms({
        ...baseCreds,
        voiceNumber: "+15551234567",
        toNumber: "+15559999999",
        body: "Your meeting is in 15 minutes.",
      });

      expect(result).toEqual({ messageId: "sent-sms-1" });
      expect(mocks.sendFromPa).toHaveBeenCalledWith(expect.objectContaining({
        to: "+15559999999@txt.voice.google.com",
        body: "Your meeting is in 15 minutes.",
        subject: "",
      }));
    });

    it("normalizes phone number before sending", async () => {
      mocks.sendFromPa.mockResolvedValue({ messageId: "sent-sms-2" });

      await sendVoiceSms({
        ...baseCreds,
        voiceNumber: "+15551234567",
        toNumber: "+1 (555) 888-7777",
        body: "Test",
      });

      expect(mocks.sendFromPa).toHaveBeenCalledWith(expect.objectContaining({
        to: "+15558887777@txt.voice.google.com",
      }));
    });

    it("returns null when PA has no voice number", async () => {
      const result = await sendVoiceSms({
        ...baseCreds,
        toNumber: "+15559999999",
        body: "Test",
        // no voiceNumber
      });

      expect(result).toBeNull();
      expect(mocks.sendFromPa).not.toHaveBeenCalled();
    });

    it("returns null for short/invalid phone numbers", async () => {
      const result = await sendVoiceSms({
        ...baseCreds,
        voiceNumber: "+15551234567",
        toNumber: "123",
        body: "Test",
      });

      expect(result).toBeNull();
      expect(mocks.sendFromPa).not.toHaveBeenCalled();
    });

    it("returns null on Gmail send error", async () => {
      mocks.sendFromPa.mockRejectedValue(new Error("Send failed"));

      const result = await sendVoiceSms({
        ...baseCreds,
        voiceNumber: "+15551234567",
        toNumber: "+15559999999",
        body: "Test",
      });

      expect(result).toBeNull();
    });
  });
});
