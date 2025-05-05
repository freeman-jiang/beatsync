import type { Server } from "bun";
import { errorResponse, jsonResponse } from "../utils/responses";
import { SEARCH_SERVICE } from "../download/dab";

export const handleSearch = async (req: Request, server: Server) => {
  try {
    if (req.method !== "GET") {
      return errorResponse("Method not allowed", 405);
    }

    // Parse and validate the request query param
    const url = new URL(req.url);
    const query = url.searchParams.get("query");
    const offset = url.searchParams.get("offset");

    if (!query) {
      return errorResponse("Missing or empty 'query' parameter", 400);
    } else if (!offset || Number.isNaN(+offset) || !(Number(offset) >= 0)) {
      return errorResponse("Missing or faulty 'offset' parameter", 400);
    }

    // Run the search query
    const result = await SEARCH_SERVICE.search(query, Number(offset));

    return jsonResponse(result);
  } catch (error) {
    console.error("Error handling search:", error);
    return errorResponse("Failed to process upload", 500);
  }
};
