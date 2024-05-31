// Abstract signals
export * from "./event-signal";

// Concrete signals
export * from "./player-joined";
export * from "./player-spawned";
export * from "./player-chat";
export * from "./player-place-block";

// Import signals
import { PlayerJoinedSignal } from "./player-joined";
import { PlayerSpawnedSignal } from "./player-spawned";
import { PlayerChatSignal } from "./player-chat";
import { PlayerPlaceBlockSignal } from "./player-place-block";
import { PlayerBreakBlockSignal } from "./player-break-block";

/**
 * Contains all the event signals.
 */
const EVENT_SIGNALS = [
	PlayerJoinedSignal,
	PlayerSpawnedSignal,
	PlayerChatSignal,
	PlayerPlaceBlockSignal,
	PlayerBreakBlockSignal
];

// Exports
export { EVENT_SIGNALS };
export * from "./priority";
export * from "./signals";
