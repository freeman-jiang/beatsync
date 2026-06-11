// Shared test lifecycle, preloaded after happydom.ts (see bunfig.toml).
// Pattern from Bun's official Testing Library guide.
import { afterEach } from "bun:test";
import { cleanup } from "@testing-library/react";

// React 19 requires this for act()-wrapped updates outside a renderer
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});
