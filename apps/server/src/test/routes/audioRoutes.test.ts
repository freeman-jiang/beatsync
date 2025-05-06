import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { handleGetAudio } from "../../routes/audio";
import { setupTestAudioDir, cleanupTestAudioDir, createTestAudioFile, createTestServer } from "../utils/testHelpers";

describe("Audio Routes", () => {
  const server = createTestServer();

  beforeAll(() => {
    setupTestAudioDir();
  });

  afterAll(() => {
    cleanupTestAudioDir();
    server.stop();
  });

  test("GET request should return 405 Method Not Allowed", async () => {
    const request = new Request("http://localhost/audio", {
      method: "GET",
    });

    const response = await handleGetAudio(request, server);
    expect(response.status).toBe(405);
    const text = await response.text();
    expect(text).toBe("Method not allowed");
  });

  test("POST request without content-type should return 400", async () => {
    const request = new Request("http://localhost/audio", {
      method: "POST",
      body: JSON.stringify({ id: "test.mp3" }),
    });

    const response = await handleGetAudio(request, server);
    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).toBe("Content-Type must be application/json");
  });

  test("POST request with invalid body should return 400", async () => {
    const request = new Request("http://localhost/audio", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ invalid: "data" }),
    });

    const response = await handleGetAudio(request, server);
    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).toContain("Invalid request data");
  });

  test("POST request for non-existent file should return 404", async () => {
    const request = new Request("http://localhost/audio", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: "nonexistent.mp3" }),
    });

    const response = await handleGetAudio(request, server);
    expect(response.status).toBe(404);
    const text = await response.text();
    expect(text).toBe("Audio file not found");
  });

  test("POST request for existing file should return audio file", async () => {
    const testFileName = "test-audio.mp3";
    const testContent = "test audio content";
    createTestAudioFile(testFileName, testContent);

    const request = new Request("http://localhost/audio", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: testFileName }),
    });

    const response = await handleGetAudio(request, server);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(response.headers.get("Content-Length")).toBe(testContent.length.toString());
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");

    const responseContent = await response.text();
    expect(responseContent).toBe(testContent);
  });
}); 