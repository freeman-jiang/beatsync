import { Server, ServerWebSocket } from "bun";
import { handleWebSocketUpgrade } from "../../routes/websocket";
import { handleOpen, handleMessage, handleClose } from "../../routes/websocketHandlers";
import { WSData } from "../../utils/websocket";

export interface TestWSMessage {
  type: string;
  [key: string]: any;
}

export class TestWebSocketClient {
  private ws: WebSocket;
  private messageQueue: TestWSMessage[] = [];
  private messageHandlers: ((msg: TestWSMessage) => void)[] = [];
  private clientId: string | null = null;

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.ws.onmessage = this.handleMessage.bind(this);
  }

  private handleMessage(event: MessageEvent) {
    try {
      const message = JSON.parse(event.data.toString()) as TestWSMessage;
      
      // Store client ID when received
      if (message.type === "SET_CLIENT_ID") {
        this.clientId = message.clientId;
      }
      
      this.messageQueue.push(message);
      this.messageHandlers.forEach(handler => handler(message));
    } catch (error) {
      console.error("Error parsing message:", error);
    }
  }

  async waitForMessage(predicate?: (msg: TestWSMessage) => boolean, timeoutMs: number = 0): Promise<TestWSMessage> {
    // First check the queue for existing messages
    const existingMessage = predicate 
      ? this.messageQueue.find(predicate)
      : this.messageQueue[0];
    
    if (existingMessage) {
      this.messageQueue = this.messageQueue.filter(msg => msg !== existingMessage);
      return existingMessage;
    }

    // If no matching message found, wait for the next one with optional timeout
    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout | undefined;

      const handler = (message: TestWSMessage) => {
        if (!predicate || predicate(message)) {
          // Clear timeout if it was set
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          // Remove the handler
          this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
          // Remove the message from queue
          this.messageQueue = this.messageQueue.filter(msg => msg !== message);
          resolve(message);
        }
      };

      // Set timeout if specified
      if (timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          // Remove the handler on timeout
          this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
          reject(new Error(`Timeout waiting for message after ${timeoutMs}ms`));
        }, timeoutMs);
      }

      this.messageHandlers.push(handler);
    });
  }

  async waitForClientId(timeoutMs: number = 0): Promise<string> {
    if (this.clientId) {
      return this.clientId;
    }

    const message = await this.waitForMessage(msg => msg.type === "SET_CLIENT_ID", timeoutMs);
    return message.clientId;
  }

  async waitForRoomEvent(timeoutMs: number = 0): Promise<TestWSMessage> {
    return this.waitForMessage(msg => msg.type === "ROOM_EVENT", timeoutMs);
  }

  send(message: TestWSMessage) {
    this.ws.send(JSON.stringify(message));
  }

  close() {
    this.ws.close();
  }

  getClientId(): string | null {
    return this.clientId;
  }

  addMessageHandler(handler: (msg: TestWSMessage) => void) {
    this.messageHandlers.push(handler);
  }

  removeMessageHandler(handler: (msg: TestWSMessage) => void) {
    this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
  }
}

export const createTestWSServer = () => {
  const server = Bun.serve({
    port: 0, // Random available port
    fetch(req, server) {
      return handleWebSocketUpgrade(req, server);
    },
    websocket: {
      open(ws: ServerWebSocket<WSData>) {
        handleOpen(ws, server);
      },
      message(ws: ServerWebSocket<WSData>, message) {
        handleMessage(ws, message, server);
      },
      close(ws: ServerWebSocket<WSData>) {
        handleClose(ws, server);
      },
    },
  });
  return server;
};

export const createTestWSClient = async (server: Server, params: Partial<WSData>): Promise<TestWebSocketClient> => {
  const { port } = server;
  const searchParams = new URLSearchParams({
    roomId: params.roomId || "",
    username: params.username || "",
  });

  const ws = new WebSocket(
    `ws://localhost:${port}/?${searchParams.toString()}`
  );

  // Wait for connection
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = (error) => reject(error);
  });

  const client = new TestWebSocketClient(ws);
  
  // Wait for initial setup messages
  await client.waitForClientId();
  await client.waitForRoomEvent();

  return client;
};

// For backward compatibility
export const waitForMessage = async (ws: WebSocket, predicate?: (msg: any) => boolean) => {
  const client = new TestWebSocketClient(ws);
  return client.waitForMessage(predicate);
};

export const sendWSMessage = (ws: WebSocket, message: TestWSMessage) => {
  ws.send(JSON.stringify(message));
}; 