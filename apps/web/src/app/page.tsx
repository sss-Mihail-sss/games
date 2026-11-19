import { manifest as bridge } from "@repo/game-bridge/manifest";

// Spike: proves that a server component can import workspace TS packages.
// M0-05 replaces this with the real catalog built from the games registry.
export default function CatalogPage() {
  return (
    <main>
      <h1>Игры</h1>
      <ul>
        <li>
          {bridge.title} ({bridge.kind})
        </li>
      </ul>
    </main>
  );
}
