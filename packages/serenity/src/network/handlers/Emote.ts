import type { Packet } from '@serenityjs/bedrock-protocol';
import { DisconnectReason, Emote } from '@serenityjs/bedrock-protocol';
import type { NetworkSession } from '../Session.js';
import { NetworkHandler } from './NetworkHandler.js';

class EmoteHandler extends NetworkHandler {
	/**
	 * The packet of the network handler.
	 */
	public static override packet: Packet = Emote.ID;

	public static override handle(packet: Emote, session: NetworkSession): void {
		const player = session.player;

		// Disconnect the player if they are null or undefined.
		if (!player) return session.disconnect('Failed to get player instance.', DisconnectReason.MissingClient);
	}
}

export { EmoteHandler };
