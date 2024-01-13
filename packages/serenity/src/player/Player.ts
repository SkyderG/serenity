import { AbilityLayerFlag, type Vec2f, type Vec3f } from '@serenityjs/bedrock-protocol';
import type { Serenity } from '../Serenity';
import type { Network, NetworkSession } from '../network';
import type { LoginTokenData } from '../types';
import { Abilities } from './abilities';
import { Skin } from './skin';

class Player {
	protected readonly serenity: Serenity;
	public readonly network: Network;
	public readonly session: NetworkSession;

	public readonly username: string;
	public readonly xuid: string;
	public readonly uuid: string;
	public readonly guid: bigint;
	public readonly skin: Skin;
	public readonly abilities: Abilities;

	public position: Vec3f = { x: 0, y: 0, z: 0 };
	public rotation: Vec2f = { x: 0, z: 0 };
	public headYaw: number = 0;
	public onGround: boolean = false;

	public constructor(session: NetworkSession, tokens: LoginTokenData) {
		this.serenity = session.serenity;
		this.network = session.network;
		this.session = session;

		this.username = tokens.identityData.displayName;
		this.xuid = tokens.identityData.XUID;
		this.uuid = tokens.identityData.identity;
		this.guid = session.guid;
		this.skin = new Skin(tokens.clientData);
		this.abilities = new Abilities(this);
	}

	/**
	 * Sets the player's ability to fly.
	 *
	 * @param mayFly Whether the player can fly or not.
	 */
	public setMayFly(mayFly: boolean): void {
		// Set the may fly ability.
		this.abilities.setAbility(AbilityLayerFlag.MayFly, mayFly);
	}
}

export { Player };
