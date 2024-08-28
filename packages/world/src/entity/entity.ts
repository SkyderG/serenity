import {
	ActorData,
	ActorEventIds,
	ActorEventPacket,
	AddEntityPacket,
	AddItemActorPacket,
	Attribute,
	type AttributeName,
	ChunkCoords,
	ContainerName,
	type EffectType,
	MoveActorAbsolutePacket,
	RemoveEntityPacket,
	Rotation,
	SetActorMotionPacket,
	SetActorDataPacket,
	UpdateAttributesPacket,
	Vector3f,
	PropertySyncData,
	type DataItem,
	type ActorFlag,
	type ActorDamageCause,
	ActorDataId,
	PlayerListPacket,
	PlayerListAction,
	PlayerListRecord
} from "@serenityjs/protocol";
import { EntityIdentifier, EntityType } from "@serenityjs/entity";
import { CommandExecutionState, type CommandResult } from "@serenityjs/command";
import {
	CompoundTag,
	FloatTag,
	ListTag,
	LongTag,
	StringTag,
	Tag
} from "@serenityjs/nbt";

import { CardinalDirection, type EntityInteractType } from "../enums";
import {
	EntityAlwaysShowNametagComponent,
	EntityComponent,
	EntityEffectsComponent,
	EntityHealthComponent,
	EntityNametagComponent,
	EntityOnFireComponent,
	EntityVariantComponent
} from "../components";
import { ItemStack } from "../item";
import {
	EntityDespawnedSignal,
	EntityDieSignal,
	EntitySpawnedSignal,
	EntityTeleportSignal,
	PlayerInteractWithEntitySignal
} from "../events";
import { ScoreboardIdentity } from "../scoreboard";
import { Player, type PlayerOptions } from "../player";
import { Raycaster } from "../collisions";

import type { BlockHitResult } from "../types";
import type { Container } from "../container";
import type { Effect } from "../effect/effect";
import type { Chunk } from "../chunk";
import type { Dimension, World } from "../world";
import type { EntityComponents } from "../types/components";

/**
 * Represents an entity in a Dimension instance that can be interacted with. Entities can be spawned from either creating a new Entity instance, or using the ".spawnEntity" method of a Dimension instance.
 *
 * **Example Usage**
 * ```typescript
	import { EntityIdentifier } from "@serenityjs/entity";
	import { Vector3f } from "@serenityjs/protocol";
	import { Dimension } from "@serenityjs/world";

	// Declare the Dimension instance, this can be retrieved from the current World instance.
	const dimension: Dimension;

	// This is an example of creating a new entity instance
	const entity = new Entity(EntityIdentifier.Cow, dimension);

	// This is an example of spawning an entity using the ".spawnEntity" method of a Dimension instance
	const entity = dimension.spawnEntity(EntityIdentifier.Cow, new Vector3f(0, 0, 0));

	// Spawn the entity in the dimension
	entity.spawn();
 * ```
 */

class Entity {
	/**
	 * The running total of the entity runtime id.
	 */
	public static runtime = 1n;

	/**
	 * The type of entity.
	 */
	public readonly type: EntityType;

	/**
	 * The runtime id of the entity.
	 */
	public readonly runtime: bigint;

	/**
	 * The unique id of the entity.
	 */
	public readonly unique: bigint;

	/**
	 * The position of the entity.
	 */
	public readonly position = new Vector3f(0, 0, 0);

	/**
	 * The velocity of the entity.
	 */
	public readonly velocity = new Vector3f(0, 0, 0);

	/**
	 * The rotation of the entity.
	 */
	public readonly rotation = new Rotation(0, 0, 0);

	/**
	 * The tags of the entity.
	 */
	public readonly tags = new Array<string>();

	/**
	 * The components of the entity.
	 */
	public readonly components = new Map<string, EntityComponent>();

	/**
	 * The metadata of the entity.
	 */
	public readonly metadata = new Set<DataItem>();

	/**
	 * The flags of the entity.
	 */
	public readonly flags = new Map<ActorFlag, boolean>();

	/**
	 * The attributes of the entity.
	 */
	public readonly attributes = new Set<Attribute>();

	/**
	 * The scoreboard identity of the entity.
	 */
	public readonly scoreboardIdentity: ScoreboardIdentity;

	/**
	 * The dimension of the entity.
	 */
	public dimension: Dimension;

	/**
	 * The nbt data of the entity.
	 */
	public nbt = new CompoundTag();

	/**
	 * Whether or not the entity is on the ground.
	 */
	public onGround = false;

	/**
	 * Whether or not the entity is alive.
	 */
	public isAlive = true;

	public constructor(
		identifier: EntityIdentifier,
		dimension: Dimension,
		uniqueId?: bigint
	) {
		// Readonly properties
		this.type = EntityType.get(identifier) as EntityType;
		this.runtime = Entity.runtime++;
		this.unique = uniqueId ?? BigInt(Date.now() << 2) + this.runtime;

		// Mutable properties
		this.dimension = dimension;

		// Create the scoreboard identity
		this.scoreboardIdentity = new ScoreboardIdentity(this);

		// Check if the entity is a player
		if (this.type.identifier === EntityIdentifier.Player) return;

		// Register the type components to the entity.
		for (const component of EntityComponent.registry.get(identifier) ?? [])
			new component(this, component.identifier);
	}

	/**
	 * Syncs the entity and its properties to the dimension.
	 */
	public sync(): void {
		// Syncs the entity data
		this.updateActorData();

		// Syncs the entity attributes
		this.syncAttributes();
	}

	/**
	 * Checks if the entity is a player.
	 * @returns Whether or not the entity is a player.
	 */
	public isPlayer(): this is Player {
		return this.type.identifier === EntityIdentifier.Player;
	}

	/**
	 * Checks if the entity is an item.
	 * @returns Whether or not the entity is an item.
	 */
	public isItem(): boolean {
		return this.type.identifier === EntityIdentifier.Item;
	}

	/**
	 * Checks if the entity is an NPC.
	 * @returns Whether or not the entity is an NPC.
	 */
	public isNpc(): boolean {
		// Get the values of the metadata
		const values = [...this.metadata.values()];

		// Check if the entity has the Has
		return values.some((value) => value.identifier === ActorDataId.HasNpc);
	}

	/**
	 * Gets the current chunk the entity is in.
	 * @returns The chunk the entity is in.
	 */
	public getChunk(): Chunk {
		// Calculate the chunk position of the entity
		const cx = Math.round(this.position.x >> 4);
		const cz = Math.round(this.position.z >> 4);

		// Return the chunk the entity is in
		return this.dimension.getChunk(cx, cz);
	}

	/**
	 * Gets the chunk hashes around the entity.
	 * @param distance The distance to get the chunks.
	 * @returns The chunk hashes around the entity.
	 */
	public getChunks(distance?: number): Array<bigint> {
		// Calculate the chunk position of the entity
		const cx = this.position.x >> 4;
		const cz = this.position.z >> 4;

		// Calculate the distance or use the simulation distance of the dimension
		const dx = (distance ?? this.dimension.simulationDistance) >> 4;
		const dz = (distance ?? this.dimension.simulationDistance) >> 4;

		// Prepare an array to store the chunk hashes
		const hashes: Array<bigint> = [];

		// Get the chunk hashes to render.
		for (let x = -dx + cx; x <= dx + cx; x++) {
			for (let z = -dz + cz; z <= dz + cz; z++) {
				// Get the chunk
				const hash = ChunkCoords.hash({ x, z });

				// Add the hash to the array.
				hashes.push(hash);
			}
		}

		// Return the hashes
		return hashes;
	}

	/**
	 * Gets the world the entity is in.
	 * @returns The world the entity is in.
	 */
	public getWorld(): World {
		return this.dimension.world;
	}

	/**
	 * Executes a command on the entity.
	 * @param command The command to execute.
	 * @returns The result of the command.
	 */
	public executeCommand(command: string): CommandResult | undefined {
		// Check if the command doesnt start with /
		// If so, add it
		if (!command.startsWith("/")) command = `/${command}`;

		// Create a new command execute state
		const state = new CommandExecutionState(
			this.dimension.world.commands,
			command,
			this
		);

		// Try and execute the command
		try {
			// Return the result of the command
			return state.execute();
		} catch (reason) {
			// Check if the entity is a player
			if (this.isPlayer()) {
				this.dimension.world.logger.error(
					`Failed to execute command '${command}' for player '${this.username}':`,
					reason
				);
			} else {
				// Log the error to the console
				this.dimension.world.logger.error(
					`Failed to execute command '${command}' for ${this.type.identifier} entity '${this.unique}':`,
					reason
				);
			}
		}
	}

	/**
	 * Spawns the entity in the world.
	 * @param player The player to spawn the entity to.
	 */
	public spawn(player?: Player): void {
		// Create a new EntitySpawnedSignal
		const signal = new EntitySpawnedSignal(this, this.dimension, player);
		const value = signal.emit();

		// Check if the signal was cancelled
		if (!value) return;

		// Check if the entity is an item
		if (this.isItem()) {
			// Get the item component
			const itemComponent = this.getComponent("minecraft:item");

			// Create a new AddItemActorPacket
			const packet = new AddItemActorPacket();

			// Set the packet properties
			packet.uniqueId = this.unique;
			packet.runtimeId = this.runtime;
			packet.item = ItemStack.toNetworkStack(itemComponent.itemStack);
			packet.position = this.position;
			packet.velocity = this.velocity;
			packet.data = [];
			packet.fromFishing = false;

			// Send the packet to the player if it exists, otherwise broadcast it to the dimension
			player ? player.session.send(packet) : this.dimension.broadcast(packet);
		} else {
			// Create a new AddEntityPacket
			const packet = new AddEntityPacket();

			// Set the packet properties
			packet.uniqueEntityId = this.unique;
			packet.runtimeId = this.runtime;
			packet.identifier = this.type.identifier;
			packet.position = this.position;
			packet.velocity = this.velocity;
			packet.pitch = this.rotation.pitch;
			packet.yaw = this.rotation.yaw;
			packet.headYaw = this.rotation.headYaw;
			packet.bodyYaw = this.rotation.yaw;
			packet.attributes = [];
			packet.data = [...this.metadata];
			packet.properties = new PropertySyncData([], []);
			packet.links = [];

			// Send the packet to the player if it exists, otherwise broadcast it to the dimension
			player ? player.session.send(packet) : this.dimension.broadcast(packet);
		}

		// Add the entity to the dimension
		this.dimension.entities.set(this.unique, this);

		// Trigger the onSpawn method of all applicable components
		for (const component of this.getComponents()) component.onSpawn?.();
	}

	/**
	 * Despawns the entity from the world.
	 * @param player The player to despawn the entity from.
	 */
	public despawn(player?: Player): void {
		// Create a new EntityDespawnedSignal
		const signal = new EntityDespawnedSignal(this, this.dimension, player);
		const value = signal.emit();

		// Check if the signal was cancelled
		if (!value) return;

		// Set the alive property of the entity to false
		this.isAlive = false;

		// Create a new RemoveEntityPacket
		const packet = new RemoveEntityPacket();

		// Set the packet properties
		packet.uniqueEntityId = this.unique;

		// Remove the entity from the dimension, only if the player is not null
		if (!player) this.dimension.entities.delete(this.unique);

		// Send the packet to the player if it exists, otherwise broadcast it to the dimension
		player ? player.session.send(packet) : this.dimension.broadcast(packet);

		// Trigger the onDespawn method of all applicable components
		for (const component of this.getComponents()) component.onDespawn?.();

		// Check if the entity is a player
		if (this.isPlayer()) {
			// Create a new PlayerListPacket
			const packet = new PlayerListPacket();
			packet.action = PlayerListAction.Remove;
			packet.records = [new PlayerListRecord(this.uuid)];

			// Send the packet to the player if it exists, otherwise broadcast it to the dimension
			player ? player.session.send(packet) : this.dimension.broadcast(packet);
		}
	}

	/**
	 * Kills the entity, triggering the death animation.
	 */
	public kill(): void {
		// Set the alive property of the entity to false
		this.isAlive = false;
		const signal = new EntityDieSignal(this, this.dimension);
		const value = signal.emit();

		if (!value) return;

		// TODO: Implement experience drops

		if (this.hasComponent("minecraft:loot")) {
			// Get the loot component
			const loot = this.getComponent("minecraft:loot");

			// Generate and drop the entity loot
			loot.dropLoot();
		}

		// TODO: Check for keep inventory gamerule
		if (this.hasComponent("minecraft:inventory")) {
			// Get the inventory component
			const { container } = this.getComponent("minecraft:inventory");

			// Drop the items from the inventory
			for (const [slot, item] of container.storage.entries()) {
				// Check if the item is not valid
				if (!item) continue;

				// Spawn the item in the dimension
				this.dimension.spawnItem(item, this.position);

				// Remove the item from the container
				container.clearSlot(slot);
			}
		}

		// Check if the entity has the effects component
		if (this.hasComponent("minecraft:effects")) {
			// Get the component
			const effects = this.getComponent("minecraft:effects");

			// Remove every effect of the player
			for (const effectType of effects.effects.keys()) {
				effects.remove(effectType);
			}
		}

		// Check if the entity has a health component
		if (this.hasComponent("minecraft:health")) {
			// Get the health component
			const health = this.getComponent("minecraft:health");

			// Set the health to the minimum value
			health.resetToMinValue();
		}

		// Create a new ActorEventPacket
		const packet = new ActorEventPacket();

		// Set the properties of the packet
		packet.eventId = ActorEventIds.DEATH_ANIMATION;
		packet.actorRuntimeId = this.runtime;
		packet.eventData = 0;

		// Broadcast the packet to the dimension
		this.dimension.broadcast(packet);

		// Delete the entity from the dimension if it is not a player
		if (!this.isPlayer()) this.dimension.entities.delete(this.unique);

		// Trigger the onDespawn method of all applicable components
		for (const component of this.getComponents()) component.onDespawn?.();
	}

	/**
	 * Checks if the entity has a component.
	 * @param identifier The identifier of the component.
	 * @returns Whether or not the entity has the component.
	 */
	public hasComponent<T extends keyof EntityComponents>(
		identifier: T
	): boolean {
		return this.components.has(identifier);
	}

	/**
	 * Gets a component from the entity.
	 * @param identifier The identifier of the component.
	 * @returns The component that was found.
	 */
	public getComponent<T extends keyof EntityComponents>(
		identifier: T
	): EntityComponents[T] {
		return this.components.get(identifier) as EntityComponents[T];
	}

	/**
	 * Gets all the components of the entity.
	 * @returns All the components of the entity.
	 */
	public getComponents(): Array<EntityComponent> {
		return [...this.components.values()];
	}

	/**
	 * Sets a component to the entity.
	 * @param component The component to set.
	 */
	public setComponent<T extends keyof EntityComponents>(
		component: EntityComponents[T]
	): void {
		this.components.set(component.identifier, component);
	}

	/**
	 * Removes a component from the entity.
	 * @param identifier The identifier of the component.
	 */
	public removeComponent<T extends keyof EntityComponents>(
		identifier: T
	): void {
		this.components.delete(identifier);
	}

	/**
	 * Checks if the entity contains a specified actor flag.
	 * @param flag The flag to check.
	 * @returns Whether or not the entity has the flag.
	 */
	public hasActorFlag(flag: ActorFlag): boolean {
		return this.flags.has(flag);
	}

	/**
	 * Gets the value of the actor flag.
	 * @param flag The flag to get.
	 * @returns The value of the flag.
	 */
	public getActorFlag(flag: ActorFlag): boolean {
		return this.flags.get(flag) ?? false;
	}

	/**
	 * Sets the actor flag of the entity.
	 * @param flag The flag to set.
	 * @param value The value to set.
	 */
	public setActorFlag(flag: ActorFlag, value: boolean): void {
		// Set the flag value
		this.flags.set(flag, value);

		// Update the actor flags
		this.updateActorData();
	}

	/**
	 * Updates the actor flags of the entity.
	 */
	public updateActorData(): void {
		// Create a new SetActorDataPacket
		const packet = new SetActorDataPacket();
		packet.runtimeEntityId = this.runtime;
		packet.tick = this.dimension.world.currentTick;
		packet.data = [...this.metadata];
		packet.properties = new PropertySyncData([], []);

		// Iterate over the flags set on the entity
		for (const [flag, enabled] of this.flags) packet.setFlag(flag, enabled);

		// Send the packet to the dimension
		this.dimension.broadcast(packet);
	}

	/**
	 * Set's if the entity is visible to other's
	 * @param visibility the value of the entity visibility
	 */
	public setVisibility(visibility: boolean): void {
		const isVisibleComponent = this.getComponent("minecraft:is_visible");
		if (isVisibleComponent.getCurrentValue() == !visibility) return;
		isVisibleComponent.setCurrentValue(!visibility, true);
	}

	/**
	 * Syncs the attributes of the entity.
	 */
	public syncAttributes(): void {
		// Create a new UpdateAttributesPacket
		const packet = new UpdateAttributesPacket();
		packet.runtimeActorId = this.runtime;
		packet.tick = this.dimension.world.currentTick;
		packet.attributes = [...this.attributes];

		// Broadcast the packet to the dimension
		this.dimension.broadcast(packet);
	}

	/**
	 * Checks if the entity has an attribute.
	 * @param name The name of the attribute.
	 * @returns Whether or not the entity has the attribute.
	 */
	public hasAttribute(name: AttributeName): boolean {
		return [...this.attributes.values()].some(
			(attribute) => attribute.name === name
		);
	}

	/**
	 * Gets an attribute from the entity.
	 * @param name The name of the attribute.
	 * @returns The attribute that was found.
	 */
	public getAttribute(name: AttributeName): Attribute | undefined {
		return [...this.attributes.values()].find(
			(attribute) => attribute.name === name
		);
	}

	/**
	 * Gets all the attributes of the entity.
	 * @returns All the attributes of the entity.
	 */
	public getAttributes(): Array<Attribute> {
		return [...this.attributes];
	}

	/**
	 * Adds an attribute to the entity.
	 * @param attribute The attribute to add.
	 * @param sync Whether to synchronize the attributes.
	 */
	public addAttribute(attribute: Attribute, sync = true): void {
		this.attributes.add(attribute);

		if (sync) this.syncAttributes();
	}

	/**
	 * Sets the attribute of the entity.
	 * @param name The name of the attribute.
	 * @param value The value to set.
	 * @param sync Whether to synchronize the attributes.
	 */
	public setAttribute(name: AttributeName, value: number, sync = true): void {
		const attribute = this.getAttribute(name);

		if (!attribute) return;

		attribute.current = value;

		if (sync) this.syncAttributes();
	}

	/**
	 * Creates an attribute for the entity.
	 * @param name The name of the attribute.
	 * @param value The value to create.
	 * @param defaultValue The default value of the attribute.
	 * @param maxValue The maximum value of the attribute.
	 * @param minValue The minimum value of the attribute.
	 * @param sync Whether to synchronize the attributes.
	 * @returns The attribute that was created.
	 */
	public createAttribute(
		name: AttributeName,
		value: number,
		defaultValue: number,
		maxValue: number,
		minValue: number,
		sync = true
	): Attribute {
		const attribute = new Attribute(
			value,
			defaultValue,
			maxValue,
			minValue,
			[],
			name
		);

		this.addAttribute(attribute, sync);

		return attribute;
	}

	/**
	 * Removes an attribute from the entity.
	 * @param name The name of the attribute.
	 */
	public removeAttribute(name: AttributeName, sync = true): void {
		const attribute = this.getAttribute(name);

		if (!attribute) return;

		this.attributes.delete(attribute);

		if (sync) this.syncAttributes();
	}

	/**
	 * Computes the view direction vector based on the current pitch and yaw rotations.
	 *
	 * @returns A Vector3f representing the direction the view is pointing.
	 */
	public getViewDirection(): Vector3f {
		// Convert pitch and yaw angles from degrees to radians
		const pitchRadians = this.rotation.pitch * (Math.PI / 180);
		const yawRadians = -this.rotation.headYaw * (Math.PI / 180); // Invert yaw for correct orientation

		// Calculate the direction vector components
		return new Vector3f(
			Math.sin(yawRadians) * Math.cos(pitchRadians), // X component of the view vector
			-Math.sin(pitchRadians), // Y component of the view vector (negative for correct orientation)
			Math.cos(yawRadians) * Math.cos(pitchRadians) // Z component of the view vector
		);
	}

	/**
	 * Adds effect to the player
	 * @param effect The effect to add to the player
	 */
	public addEffect(effect: Effect): void {
		const effects = this.hasComponent("minecraft:effects")
			? this.getComponent("minecraft:effects")
			: new EntityEffectsComponent(this);
		effects.add(effect);
	}

	/**
	 * Computes the view direction vector based on the current pitch and yaw rotations.
	 *
	 * @param maxDistance - The maximum distance to raycast in the view direction.
	 * @returns A BlockHitResult representing the block hit by the raycast, or `undefined` if no block was hit.
	 */
	public getBlockFromViewDirection(
		maxDistance: number
	): BlockHitResult | undefined {
		const viewDirection = this.getViewDirection();
		const end = this.position.add(viewDirection.multiply(maxDistance)).floor();
		const hit = Raycaster.clip(this.dimension, this.position.floor(), end);

		if (!hit || !("blockPosition" in hit)) return undefined;
		return hit as BlockHitResult;
	}

	/**
	 * Removes effect to the player
	 * @param effectType The effect type to remove, if not provided clears all effects
	 * @returns boolean If the effect was removed
	 */
	public removeEffect(effectType: EffectType): boolean {
		const effects = this.hasComponent("minecraft:effects")
			? this.getComponent("minecraft:effects")
			: new EntityEffectsComponent(this);
		return effects.remove(effectType);
	}

	/**
	 * Querys if the player has an effect
	 * @param effectType The effect type to query
	 * @returns boolean If the effect was found
	 */
	public hasEffect(effectType: EffectType): boolean {
		const effects = this.hasComponent("minecraft:effects")
			? this.getComponent("minecraft:effects")
			: new EntityEffectsComponent(this);

		return effects.has(effectType);
	}

	/**
	 * Get's all the effects that the player has
	 * @returns EffectType[] The effect list of the player
	 */
	public getEffects(): Array<EffectType> {
		const effects = this.hasComponent("minecraft:effects")
			? this.getComponent("minecraft:effects")
			: new EntityEffectsComponent(this);
		return [...effects.effects.keys()];
	}

	/**
	 * Gets the health of the entity.
	 * @note This method is dependant on the entity having a `minecraft:health` component, if not will result in an `error`.
	 * @returns The health of the entity.
	 */
	public getHealth(): number {
		// Check if the entity has a health component
		if (!this.hasComponent("minecraft:health"))
			throw new Error("The entity does not have a health component.");

		// Get the health component
		const health = this.getComponent("minecraft:health");

		// Return the current health value
		return health.getCurrentValue();
	}

	/**
	 * Sets the health of the entity.
	 * @note This method is dependant on the entity having a `minecraft:health` component, if the component does not exist it will be created.
	 * @param health The health to set.
	 */
	public setHealth(health: number): void {
		// Check if the entity has a health component
		if (!this.hasComponent("minecraft:health")) new EntityHealthComponent(this);

		// Get the health component
		const healthComponent = this.getComponent("minecraft:health");

		// Set the health value
		healthComponent.setCurrentValue(health);
	}

	/**
	 * Applies damage to the entity.
	 * @note This method is dependant on the entity having a `minecraft:health` component, if not will result in an `error`.
	 * @param damage The amount of damage to apply to the entity.
	 */
	public applyDamage(damage: number, damageCause?: ActorDamageCause): void {
		// Check if the entity has a health component
		if (!this.hasComponent("minecraft:health"))
			throw new Error("The entity does not have a health component.");

		// Get the health component
		const health = this.getComponent("minecraft:health");

		// Apply the damage to the entity
		health.applyDamage(damage, damageCause);
	}

	/**
	 * Geta the nametag of the entity.
	 * @note This method is dependant on the entity having a `minecraft:nametag` component, if not will result in an `error`.
	 * @returns The nametag of the entity.
	 */
	public getNametag(): string {
		// Check if the entity has a nametag component
		if (!this.hasComponent("minecraft:nametag"))
			throw new Error("The entity does not have a nametag component.");

		// Get the nametag component
		const nametag = this.getComponent("minecraft:nametag");

		// Return the current nametag value
		return nametag.getCurrentValue();
	}

	/**
	 * Sets the nametag of the entity.
	 * @note This method is dependant on the entity having a `minecraft:nametag` component, if the component does not exist it will be created.
	 * @param nametag The nametag to set.
	 */
	public setNametag(nametag: string, alwaysVisible = false): void {
		// Check if the entity has a nametag component
		if (!this.hasComponent("minecraft:nametag"))
			new EntityNametagComponent(this);

		// Check if the entity should always show the nametag
		if (alwaysVisible && !this.hasComponent("minecraft:always_show_nametag"))
			new EntityAlwaysShowNametagComponent(this);

		// Check if the entity should not always show the nametag
		if (!alwaysVisible && this.hasComponent("minecraft:always_show_nametag")) {
			// Get the always show nametag component
			const component = this.getComponent("minecraft:always_show_nametag");

			// Set the current value to false
			component.setCurrentValue(0);

			// Remove the component
			this.removeComponent("minecraft:always_show_nametag");
		}

		// Get the nametag component
		const nametagComponent = this.getComponent("minecraft:nametag");

		// Set the nametag value
		nametagComponent.setCurrentValue(nametag);
	}

	/**
	 * Sets the entity on fire.
	 * @note This method is dependant on the entity having a `minecraft:on_fire` component, if the component does not exist it will be created.
	 */
	public setOnFire(ticks?: number): void {
		// Check if the entity has an on fire component
		if (this.hasComponent("minecraft:on_fire")) {
			// Get the on fire component
			const component = this.getComponent("minecraft:on_fire");

			// Set the remaining ticks
			component.onFireRemainingTicks = ticks ?? 300;

			// Set the entity on fire
			component.setCurrentValue(true);
		} else {
			// Create a new on fire component
			const component = new EntityOnFireComponent(this);

			// Set the remaining ticks
			component.onFireRemainingTicks = ticks ?? 300;

			// Set the entity on fire
			component.setCurrentValue(true);
		}
	}

	/**
	 * Extinguishes the entity from fire.
	 * @note This method is dependant on the entity having a `minecraft:on_fire` component, if the component does not exist it will result in an `error`.
	 */
	public extinguishFire(): void {
		// Check if the entity has an on fire
		if (!this.hasComponent("minecraft:on_fire"))
			throw new Error("The entity does not have an on fire component.");

		// Get the on fire component
		const component = this.getComponent("minecraft:on_fire");

		// Set the entity on fire
		component.setCurrentValue(false);

		// Remove the component as the entity is no longer on fire
		// This will reduce unnecessary ticking
		this.removeComponent("minecraft:on_fire");
	}

	/**
	 * Gets the variant of the entity.
	 * @note This method is dependant on the entity having a `minecraft:variant` component, if not will result in an `error`.
	 * @returns The variant of the entity.
	 */
	public getVariant(): number {
		// Check if the entity has a variant component
		if (!this.hasComponent("minecraft:variant"))
			throw new Error("The entity does not have a variant component.");

		// Get the variant component
		const variant = this.getComponent("minecraft:variant");

		// Return the current variant value
		return variant.getCurrentValue();
	}

	/**
	 * Sets the variant of the entity.
	 * @note This method is dependant on the entity having a `minecraft:variant` component, if the component does not exist it will be created.
	 * @param variant The variant to set.
	 */
	public setVariant(variant: number): void {
		// Check if the entity has a variant component
		if (!this.hasComponent("minecraft:variant"))
			new EntityVariantComponent(this);

		// Get the variant component
		const variantComponent = this.getComponent("minecraft:variant");

		// Set the variant value
		variantComponent.setCurrentValue(variant);
	}

	/**
	 * Gets the cardinal direction of the entity.
	 * @returns The cardinal direction of the entity.
	 */
	public getCardinalDirection(): CardinalDirection {
		// Calculate the cardinal direction of the entity
		// Entity yaw is -180 to 180

		// Calculate the rotation of the entity
		const rotation = (Math.floor(this.rotation.yaw) + 360) % 360;

		// Calculate the cardinal direction
		if (rotation >= 315 || rotation < 45) return CardinalDirection.South;
		if (rotation >= 45 && rotation < 135) return CardinalDirection.West;
		if (rotation >= 135 && rotation < 225) return CardinalDirection.North;
		if (rotation >= 225 && rotation < 315) return CardinalDirection.East;

		return CardinalDirection.South;
	}

	/**
	 * Sets the position of the entity.
	 * @param vector The position to set.
	 */
	public setMotion(vector?: Vector3f): void {
		// Update the velocity of the entity
		this.velocity.x = vector?.x ?? this.velocity.x;
		this.velocity.y = vector?.y ?? this.velocity.y;
		this.velocity.z = vector?.z ?? this.velocity.z;

		this.position.x += this.velocity.x;
		this.position.y += this.velocity.y;
		this.position.z += this.velocity.z;

		// Set the onGround property of the entity
		this.onGround = false;

		// Create a new SetActorMotionPacket
		const packet = new SetActorMotionPacket();

		// Set the properties of the packet
		packet.runtimeId = this.runtime;
		packet.motion = this.velocity;
		packet.tick = this.dimension.world.currentTick;

		// Broadcast the packet to the dimension
		this.dimension.broadcast(packet);
	}

	/**
	 * Adds motion to the entity.
	 * @param vector The motion to add.
	 */
	public addMotion(vector: Vector3f): void {
		// Update the velocity of the entity
		this.velocity.x += vector.x;
		this.velocity.y += vector.y;
		this.velocity.z += vector.z;

		// Set the motion of the entity
		this.setMotion();
	}

	/**
	 * Clears the motion of the entity.
	 */
	public clearMotion(): void {
		this.velocity.x = 0;
		this.velocity.y = 0;
		this.velocity.z = 0;

		// Set the motion of the entity
		this.setMotion();
	}

	/**
	 * Applies an impulse to the entity.
	 * @param vector The impulse to apply.
	 */
	public applyImpulse(vector: Vector3f): void {
		// Update the velocity of the entity
		this.velocity.x += vector.x;
		this.velocity.y += vector.y;
		this.velocity.z += vector.z;

		// Set the motion of the entity
		this.setMotion();
	}

	/**
	 * Teleports the entity to a position.
	 * @param position The position to teleport to.
	 * @param dimension The dimension to teleport to.
	 */
	public teleport(position: Vector3f, dimension?: Dimension): void {
		// Create a new EntityTeleportSignal
		const signal = new EntityTeleportSignal(this, position, dimension);
		const value = signal.emit();

		// Check if the signal was cancelled
		if (!value) return;

		// Set the position of the entity
		this.position.x = position.x;
		this.position.y = position.y;
		this.position.z = position.z;

		// Check if a dimension was provided
		if (dimension) {
			// Despawn the entity from the current dimension
			this.despawn();

			// Set the dimension of the entity
			this.dimension = dimension;

			// Spawn the entity in the new dimension
			this.spawn();
		} else {
			// Create a new MoveActorAbsolutePacket
			const packet = new MoveActorAbsolutePacket();

			// Set the properties of the packet
			packet.runtimeId = this.runtime;
			packet.flags = 1;
			packet.position = position;
			packet.rotation = this.rotation;

			// Broadcast the packet to the dimension
			this.dimension.broadcast(packet);
		}
	}

	/**
	 * Get a container from the entity.
	 * @param name The name of the container.
	 */
	public getContainer(name: ContainerName): Container | null {
		// Switch name of the container
		switch (name) {
			default: {
				// Return null if the container name is not valid
				return null;
			}

			case ContainerName.Armor: {
				// Check if the entity has an inventory component
				if (!this.hasComponent("minecraft:inventory"))
					throw new Error("The entity does not have an inventory component.");

				// Get the inventory component
				const inventory = this.getComponent("minecraft:inventory");

				// Return the armor container
				return inventory.container;
			}

			case ContainerName.Hotbar:
			case ContainerName.Inventory:
			case ContainerName.HotbarAndInventory: {
				// Check if the entity has an inventory component
				if (!this.hasComponent("minecraft:inventory"))
					throw new Error("The entity does not have an inventory component.");

				// Get the inventory component
				const inventory = this.getComponent("minecraft:inventory");

				// Return the inventory container
				return inventory.container;
			}
		}
	}

	/**
	 * Causes a player to interact with the entity.
	 * @param player The player to interact with the entity.
	 * @param type The type of interaction.
	 * @returns Whether or not the interaction was successful.
	 */
	public interact(player: Player, type: EntityInteractType): boolean {
		// Get the inventory of the player
		const inventory = player.getComponent("minecraft:inventory");

		// Get the item stack in the player's hand
		const itemStack = inventory.getHeldItem();

		// Create a new PlayerInteractWithEntitySignal
		const signal = new PlayerInteractWithEntitySignal(
			player,
			this,
			itemStack,
			type
		);

		// Emit the signal
		const value = signal.emit();

		// Check if the signal was cancelled
		if (!value)
			// Return false as the interaction was cancelled
			return false;

		// Trigger the onInteract method of the entity components
		for (const component of this.getComponents()) {
			component.onInteract?.(player, type);
		}

		// Return true as the interaction was successful
		return true;
	}

	/**
	 * Creates actor data from a given entity.
	 * @param entity The entity to generate the actor data from.
	 * @returns The generated actor data.
	 */
	public static toActorData(entity: Entity): ActorData {
		const identifier = entity.type.identifier;
		const position = entity.position;
		const rotation = entity.rotation;

		const extras = Buffer.from("Hello World!");

		const data = new ActorData(identifier, position, rotation, extras);

		return data;
	}

	public static serialize(entity: Entity): CompoundTag {
		// Create a new root compound tag
		const root = new CompoundTag("", {
			UniqueID: new LongTag("UniqueID", entity.unique),
			Identifier: new StringTag("Identifier", entity.type.identifier),
			Tags: new ListTag<StringTag>(
				"Tags",
				entity.tags.map((tag) => new StringTag("", tag)),
				Tag.String
			)
		});

		// Create a position list tag.
		const position = root.createListTag("Pos", Tag.Float);

		// Push the position values to the list.
		position.push(
			new FloatTag("", entity.position.x),
			new FloatTag("", entity.position.y),
			new FloatTag("", entity.position.z)
		);

		// Create a rotation list tag.
		const rotation = root.createListTag("Rotation", Tag.Float);

		// Push the rotation values to the list.
		rotation.push(
			new FloatTag("", entity.rotation.yaw),
			new FloatTag("", entity.rotation.pitch),
			new FloatTag("", entity.rotation.headYaw)
		);

		// Create a components list tag.
		const components = root.createListTag("SerenityComponents", Tag.Compound);

		// Add the components to the root tag.
		root.addTag(components);

		// Iterate over the components and serialize them.
		for (const component of entity.getComponents()) {
			// Get the component type.
			const type = EntityComponent.components.get(component.identifier);
			if (!type) continue;

			// Create a data compound tag for the data to be written to.
			// And serialize the component.
			const data = new CompoundTag("data");
			type.serialize(data, component);

			// Create the component tag.
			const componentTag = new CompoundTag().addTag(
				new StringTag("identifier", component.identifier),
				data
			);

			// Add the component to the list.
			components.push(componentTag);
		}

		// Return the root compound tag
		return root;
	}

	public static deserialize(
		tag: CompoundTag,
		dimension: Dimension,
		options?: PlayerOptions
	): Entity {
		// Get the unique id of the entity.
		const unique = tag.getTag("UniqueID")?.value as bigint;

		// Get the identifier of the entity.
		const identifier = tag.getTag("Identifier")?.value as EntityIdentifier;

		// Get the position of the entity.
		const position = tag.getTag("Pos")?.value as Array<FloatTag>;

		// Get the rotation of the entity.
		const rotation = tag.getTag("Rotation")?.value as Array<FloatTag>;

		// Get the tags of the entity.
		const tags = tag.getTag<ListTag<StringTag>>("Tags")?.value ?? [];

		// Create a new entity.
		const entity = options
			? new Player(dimension, options)
			: new Entity(identifier, dimension, unique);

		// Set the position of the entity.
		entity.position.x = position[0]?.value ?? 0;
		entity.position.y = position[1]?.value ?? 0;
		entity.position.z = position[2]?.value ?? 0;

		// Set the rotation of the entity.
		entity.rotation.yaw = rotation[0]?.value ?? 0;
		entity.rotation.pitch = rotation[1]?.value ?? 0;
		entity.rotation.headYaw = rotation[2]?.value ?? 0;

		// Iterate over the tags and add them to the entity.
		for (const tag of tags) entity.tags.push(tag.value);

		// Get the components of the entity.
		const components = tag.getTag("SerenityComponents")
			?.value as Array<CompoundTag>;

		// Iterate over the components and deserialize them.
		for (const componentTag of components) {
			// Get the identifier of the component.
			const identifier = componentTag.getTag("identifier")?.value as string;

			// Get the component type.
			const type = EntityComponent.components.get(identifier);
			if (!type) continue;

			// Get the data of the component.
			const data = componentTag.getTag("data") as CompoundTag;
			if (!data) continue;

			// Deserialize the component.
			type.deserialize(data, entity);
		}

		// Return the entity.
		return entity;
	}
}

export { Entity };
