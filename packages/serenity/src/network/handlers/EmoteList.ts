import type { Packet } from '@serenityjs/bedrock-protocol';
import { DisconnectReason, EmoteList } from '@serenityjs/bedrock-protocol';
import type { NetworkSession } from '../Session.js';
import { NetworkHandler } from './NetworkHandler.js';

class EmoteListHandler extends NetworkHandler {
	/**
	 * The packet of the network handler.
	 */
	public static override packet: Packet = EmoteList.ID;

	public static override handle(packet: EmoteList, session: NetworkSession): void {
    const player = session.player;

		// Disconnect the player if they are null or undefined.
		if (!player) return session.disconnect('Failed to get player instance.', DisconnectReason.MissingClient);
  }
}

export { EmoteListHandler };
