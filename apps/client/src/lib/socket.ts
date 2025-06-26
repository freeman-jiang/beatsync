let socket = createSocket();

function createSocket(): WebSocket {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get("roomId") || "default-room";

  const url = `ws://localhost:8080/ws?roomId=${roomId}&username=${username}`;
  const ws = new WebSocket(url);

  ws.onopen = () => {
    console.log("✅ WebSocket connected");
  };

  ws.onclose = () => {
    console.warn("❌ WebSocket closed. Reconnecting in 2s...");
    setTimeout(() => {
      socket = createSocket(); // reconnect on close
    }, 2000);
  };

  ws.onerror = (e) => {
    console.error("❌ WebSocket error:", e);
  };

  return ws;
}

export { socket };
