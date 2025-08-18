import { ClientDataType, GRID } from "@beatsync/shared";

/**
 * Positions clients in a circle around a center point
 * @param clients Map of clients to position
 */
export function positionClientsInCircle(clients: ClientDataType[]): void {
  const clientCount = clients.length;
  if (clientCount === 0) return;

  // Early return for single client case
  if (clientCount === 1) {
    // Center the single client explicitly
    const client = clients[0];
    client.position = {
      x: GRID.ORIGIN_X,
      y: GRID.ORIGIN_Y - 25,
    };
    return;
  }

  // Position multiple clients in a circle
  let index = 0;
  clients.forEach((client) => {
    // Calculate position on the circle
    const angle = (index / clientCount) * 2 * Math.PI - Math.PI / 2;
    client.position = {
      x: GRID.ORIGIN_X + GRID.CLIENT_RADIUS * Math.cos(angle),
      y: GRID.ORIGIN_Y + GRID.CLIENT_RADIUS * Math.sin(angle),
    };
    index++;
  });
}
