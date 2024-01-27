import { RequestChunkRadius, DisconnectReason, ChunkRadiusUpdate } from '@serenityjs/bedrock-protocol';
import type { NetworkSession } from '../Session';
import { NetworkHandler } from './NetworkHandler';

class RequestChunkRadiusHandler extends NetworkHandler {
	/**
	 * The packet of the network handler.
	 */
	public static override packet = RequestChunkRadius.ID;

	public static override async handle(packet: RequestChunkRadius, session: NetworkSession): Promise<void> {
		// Get the player from the session.
		// And check if the player is null or undefined.
		const player = session.getPlayerInstance();

		// Disconnect the player if they are null or undefined.
		if (!player) return session.disconnect('Failed to get player instance.', DisconnectReason.MissingClient);

		// TODO: Set up proper handling for this packet.

		const radius = new ChunkRadiusUpdate();
		radius.radius = 96;

		await session.send(radius);
	}
}

export { RequestChunkRadiusHandler };