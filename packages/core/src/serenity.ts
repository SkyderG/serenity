import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  DisconnectReason,
  MINECRAFT_VERSION,
  PROTOCOL_VERSION
} from "@serenityjs/protocol";
import { Logger, LoggerColors } from "@serenityjs/logger";
import { Connection, RAKNET_TPS } from "@serenityjs/raknet";
import Emitter from "@serenityjs/emitter";

import { Network } from "./network";
import { Handlers } from "./handlers";
import {
  DefaultWorldProviderProperties,
  Dimension,
  SuperflatGenerator,
  type TerrainGenerator,
  TickSchedule,
  VoidGenerator,
  World,
  type WorldProvider
} from "./world";
import { Player } from "./entity";
import { ConsoleInterface, WorldEnum, CommandPalette } from "./commands";
import { PermissionGroup, PermissionMember } from "./permissions";
import { ServerEvent, ServerState } from "./enums";
import { ResourcePackManager } from "./resource-packs";
import { IPermissions } from "./types/permissions";

import type {
  ServerEvents,
  SerenityProperties,
  WorldEventSignals,
  WorldProperties,
  WorldProviderProperties,
  ServerProperties
} from "./types";

const DefaultSerenityProperties: SerenityProperties = {
  permissions: null,
  resourcePacks: "",
  movementValidation: true,
  movementRewindThreshold: 0.4,
  ticksPerSecond: 20,
  debugLogging: false
};

class Serenity extends Emitter<WorldEventSignals & ServerEvents> {
  /**
   * The properties that are being used for the server
   */
  public readonly properties: SerenityProperties = DefaultSerenityProperties;

  /**
   * The network handler for the server
   */
  public readonly network: Network;

  /**
   * The worlds that are currently loaded on the server
   */
  public readonly worlds = new Map<string, World>();

  /**
   * The registered providers and properties that are available to the server
   */
  public readonly providers = new Map<
    typeof WorldProvider,
    WorldProviderProperties
  >();

  /**
   * The registered terrain generators that are available to the server
   */
  public readonly generators = new Map<string, typeof TerrainGenerator>();

  /**
   * The logger instance for the server
   */
  public readonly logger = new Logger(
    "Serenity",
    LoggerColors.MaterialAmethyst
  );

  /**
   * The players that are currently connected to the server
   */
  public readonly players = new Map<Connection, Player>();

  /**
   * The console command interface for the server
   */
  public readonly console = new ConsoleInterface(this);

  /**
   * The permissions interface for the server.
   */
  public readonly permissions: IPermissions<PermissionGroup, PermissionMember>;

  /**
   * The resource pack manager for the server.
   */
  public readonly resourcePacks: ResourcePackManager;

  /**
   * The tick schedules that are currently active on the server.
   * These schedules will be executed when the server ticks.
   */
  public readonly schedules = new Set<TickSchedule>();

  /**
   * The global commands registry for the server.
   * The commands will register on every world that is created.
   */
  public readonly commandPalette = new CommandPalette();

  /**
   * The current state of the server, whether it is starting up, running, or shutting down
   */
  public state: ServerState = ServerState.StartingUp;

  /**
   * The ticks that have been recorded by the server
   */
  public ticks: Array<number> = [];

  /**
   * The current ticks per second of the server
   */
  public tps = 0;

  /**
   * The current tick of the server
   */
  public currentTick = 0n;

  /**
   * Creates a new serenity server with the specified properties
   * @param properties The properties to use for the server
   */
  public constructor(properties?: Partial<ServerProperties>) {
    super();

    // Check if a properties path is provided
    if (properties?.path) {
      // Read the properties from the provided path
      const override = this.readProperties(properties.path);

      // Assign the properties to the server with the default properties
      properties = { ...properties, ...override };
    }

    // Assign the properties to the server with the default properties
    this.properties = { ...DefaultSerenityProperties, ...properties?.serenity };

    // Set the enabled value for debug logging
    Logger.DEBUG = this.properties.debugLogging;

    // Create a new network handler for the server
    this.network = new Network(
      this,
      properties?.network,
      properties?.raknet,
      Handlers
    );

    // Register the default terrain generators
    this.registerGenerator(VoidGenerator);
    this.registerGenerator(SuperflatGenerator);

    // Create the permissions map for the server
    if (typeof this.properties.permissions === "string") {
      // Read the permissions from the specified path
      const permissions = this.readPermissions(this.properties.permissions);

      // Instantiate the permissions groups
      const groups = permissions.groups.map((group) =>
        PermissionGroup.fromObject(group)
      );

      // Instantiate the permissions members
      const members = permissions.members.map((x) =>
        PermissionMember.fromObject(x)
      );

      // Set the permissions of the server
      this.permissions = { groups, members };
    } else if (this.properties.permissions !== null) {
      // Instantiate the permissions groups
      const groups = this.properties.permissions.groups.map((group) =>
        PermissionGroup.fromObject(group)
      );

      // Instantiate the permissions members
      const members = this.properties.permissions.members.map((x) =>
        PermissionMember.fromObject(x)
      );

      // Set the permissions of the server
      this.permissions = { groups, members };
    } else {
      // Set the permissions of the server
      this.permissions = { groups: [], members: [] };
    }

    // Check if the permissions are empty
    if (this.permissions.groups.length <= 0) {
      // Create a new permission group
      const group = new PermissionGroup("serenity");

      // Create the operator permission for the group
      group.createPermission("operator", ["stop", "save"]);

      // Add the group to the permissions
      this.permissions.groups.push(group);
    }

    // Create the resource pack manager
    this.resourcePacks =
      typeof this.properties.resourcePacks === "string"
        ? new ResourcePackManager({ path: this.properties.resourcePacks })
        : new ResourcePackManager(this.properties.resourcePacks);

    // Write the properties to the properties path
    if (properties?.path) this.writeProperties(properties.path);
    if (typeof this.properties.permissions === "string")
      this.writePermissions(this.properties.permissions);
  }

  /**
   * Starts the server and begins listening for incoming connections
   */
  public start(): void {
    // Start the raknet server
    this.network.raknet.start(false);

    // Initialize the last tick variable
    let lastTick = process.hrtime();

    // Create a ticking loop that will run every 50ms
    const tick = () => {
      // Check if the server is still alive
      if (this.state === ServerState.ShuttingDown && this.schedules.size <= 0) {
        // Stop the raknet server
        this.network.raknet.stop();

        // Log that the server has shutdown successfully
        this.logger.info(`Server has shutdown successfully.`);

        // Stop the ticking loop, and set the server state as stopped
        return void (this.state = ServerState.Stopped);
      }

      // Set the server state as running if it is not already
      if (this.state !== ServerState.Running) this.state = ServerState.Running;

      // Get the current time
      const [seconds, nanoseconds] = process.hrtime(lastTick);
      const delta = seconds + nanoseconds / 1e9;

      // Check if the server should tick
      if (delta < 0.01) return setTimeout(tick, 0);

      // Check if the server should tick the raknet connections
      if (delta >= 1 / RAKNET_TPS) {
        // Iterate over all the connections and tick the connection
        for (const connection of this.network.raknet.connections)
          connection.tick();
      }

      // Check if the server should tick
      if (delta >= 1 / this.properties.ticksPerSecond) {
        // Set the last tick to the current time
        lastTick = process.hrtime();

        // Calculate the delta time
        const deltaTick = delta * 1000;

        // Calculate the server tps
        this.ticks.push(Date.now());
        const threshold = Date.now() - 1000;
        this.ticks = this.ticks.filter((tick) => tick > threshold);
        this.tps = this.ticks.length;

        // Iterate over all the worlds and tick the world
        // Catching any errors that occur during the tick
        for (const [identifier, world] of this.worlds)
          try {
            world.onTick(Math.floor(deltaTick));
          } catch (reason) {
            // Log the error if the world failed to tick
            this.logger.error(`Failed to tick world: ${identifier}`, reason);
          }

        // Check if there are any schedules to execute
        if (this.schedules.size > 0) {
          // Iterate over the schedules
          for (const schedule of this.schedules) {
            // Check if the schedule is complete
            if (this.currentTick >= schedule.completeTick) {
              // Execute the schedule
              try {
                schedule.execute();
              } catch (reason) {
                // Log the error if the schedule failed to execute
                this.logger.error(
                  `Failed to execute schedule for at tick ${schedule.completeTick}`,
                  reason
                );
              }

              // Delete the schedule
              this.schedules.delete(schedule);
            }
          }
        }

        // Increment the current tick
        this.currentTick++;
      }

      // Schedule the next tick
      return queueMicrotask(tick);
    };

    // Start the ticking loop
    tick();

    // Emit the server startup event
    this.emit(ServerEvent.Start, 0 as never);

    // Log that the server is now running
    this.logger.info(
      `§7Server is now running at §u${this.network.raknet.address}§8:§u${this.network.raknet.port}§7.§r §8(v${MINECRAFT_VERSION}, proto-v${PROTOCOL_VERSION})§r`
    );
  }

  /**
   * Stops the server and closes all connections
   */
  public stop(): void {
    // Close the console interface
    this.console.interface.close();

    // Emit the server shutdown event
    this.emit(ServerEvent.Stop, 0 as never);

    // Set the server state as shutting
    this.state = ServerState.ShuttingDown;

    // Disconnect all players
    for (const player of this.players.values()) {
      // Write the player data to the world provider
      player.world.provider.writePlayer(
        player.getDataEntry(),
        player.dimension
      );

      // Disconnect the player from the server
      player.disconnect("Server closed.", DisconnectReason.Shutdown);
    }

    // Shutdown all world providers
    for (const world of this.worlds.values()) world.provider.onShutdown();

    // Write the permissions to the permissions path
    if (typeof this.properties.permissions === "string")
      this.writePermissions(this.properties.permissions);
  }

  /**
   * Sets the message of the day for the server
   * @param motd The message of the day to set
   */
  public setMotd(motd: string): void {
    this.network.raknet.message = motd;
  }

  /**
   * Registers a provider with the server
   * @param provider The provider to register
   * @param properties The properties to use for the provider
   * @returns Whether the provider was successfully registered or not
   */
  public registerProvider(
    provider: typeof WorldProvider,
    properties?: Partial<WorldProviderProperties>
  ): boolean {
    // Check if the provider is already registered
    if (this.providers.has(provider)) {
      // Log that the provider is already registered
      this.logger.error(`Provider already registered: ${provider.identifier}`);

      // Return false if the provider is already registered
      return false;
    }

    // Attempt to initialize the provider, catch any errors
    try {
      // Initialize the provider
      provider.initialize(this, {
        ...DefaultWorldProviderProperties,
        ...properties
      });

      // Add the provider to the registered providers
      this.providers.set(provider, {
        ...DefaultWorldProviderProperties,
        ...properties
      });

      // Log that the provider has been registered
      this.logger.debug(`Registered provider: ${provider.identifier}`);

      // Add the provider to the server
      return true;
    } catch (reason) {
      // Log the error
      this.logger.error(
        `Failed to register provider: ${provider.identifier}`,
        reason
      );

      // Return false if the provider failed to register
      return false;
    }
  }

  public registerGenerator(generator: typeof TerrainGenerator): boolean {
    // Check if the generator is already registered
    if (this.generators.has(generator.identifier)) {
      // Log that the generator is already registered
      this.logger.error(
        `Generator already registered: ${generator.identifier}`
      );

      // Return false if the generator is already registered
      return false;
    }

    // Add the generator to the registered generators
    this.generators.set(generator.identifier, generator);

    // Log that the generator has been registered
    this.logger.debug(`Registered generator: ${generator.identifier}`);

    // Return true if the generator was successfully registered
    return true;
  }

  public getGenerator(identifier: string): typeof TerrainGenerator | null {
    return this.generators.get(identifier) ?? null;
  }

  /**
   * Creates a new world using the specified provider
   * @param provider The provider to use for the world
   * @param properties The properties to use for the world
   * @returns The created world, if successful; otherwise, false
   */
  public createWorld(
    provider: typeof WorldProvider,
    properties?: Partial<WorldProperties>
  ): World | false {
    // Get the provider properties from the registered providers
    const providerProperties = this.providers.get(provider);

    // Check if the provider is registered
    if (!providerProperties) {
      // Log that the provider is not registered
      this.logger.error(
        `Failed to create world, as the given provider is not registered: ${provider.identifier}`
      );

      // Return false if the provider is not registered
      return false;
    }

    // Create a new world using the provider
    const world = provider.create(this, providerProperties, properties);

    // Register the world with the server
    this.registerWorld(world);

    // Return the created world
    return world;
  }

  public getWorld(): World;
  public getWorld(identifier: string): World | null;
  public getWorld(identifier?: string): World | null {
    // Check if the identifier is not provided
    if (!identifier) {
      // Get the first world from the worlds map
      return this.worlds.values().next().value ?? null;
    }

    // Get the world from the worlds map
    return this.worlds.get(identifier) ?? null;
  }

  /**
   * Gets all the worlds that are currently loaded on the server
   * @returns An array of worlds
   */
  public getWorlds(): Array<World> {
    return [...this.worlds.values()];
  }

  public registerWorld(world: World): boolean {
    // Check if the world is already registered
    if (this.worlds.has(world.identifier)) {
      // Log that the world is already registered
      this.logger.error(`World already registered: ${world.identifier}`);

      // Return false if the world is already registered
      return false;
    }

    // Add the world to the registered worlds
    this.worlds.set(world.identifier, world);

    // Log that the world has been registered
    this.logger.debug(`Registered world: ${world.identifier}`);

    // Call the onStartup method of the world provider
    world.provider.onStartup();

    // Add the world to the worlds enum
    WorldEnum.options.push(world.identifier);

    // Return true if the world was successfully registered
    return true;
  }

  /**
   * Gets a dimension from a world by its identifier
   * @param world The world to get the dimension from
   * @param identifier The identifier of the dimension
   * @returns The dimension, if found; otherwise, null
   */
  public getDimension(world: World, identifier: string): Dimension | null {
    return world.dimensions.get(identifier) ?? null;
  }

  /**
   * Gets all the dimensions that are currently loaded in a world
   * @param world The world to get the dimensions from
   * @returns An array of dimensions
   */
  public getDimensions(world: World): Array<Dimension> {
    return [...world.dimensions.values()];
  }

  /**
   * Gets a player by their raknet connection
   * @param connection The connection to get the player from
   * @returns The player, if found; otherwise, null
   */
  public getPlayerByConnection(connection: Connection): Player | null {
    return this.players.get(connection) ?? null;
  }

  /**
   * Gets a player by their xuid
   * @param xuid The xuid to get the player from
   * @returns The player, if found; otherwise, null
   */
  public getPlayerByXuid(xuid: string): Player | null {
    return (
      [...this.players.values()].find((player) => player.xuid === xuid) ?? null
    );
  }

  /**
   * Gets a player by their username
   * @param username The username to get the player from
   * @returns The player, if found; otherwise, null
   */
  public getPlayerByUsername(username: string): Player | null {
    return (
      [...this.players.values()].find(
        (player) => player.username === username
      ) ?? null
    );
  }

  /**
   * Gets a player by their uuid
   * @param uuid The uuid to get the player from
   * @returns The player, if found; otherwise, null
   */
  public getPlayerByUuid(uuid: string): Player | null {
    return (
      [...this.players.values()].find((player) => player.uuid === uuid) ?? null
    );
  }

  /**
   * Gets all the players that are currently connected to the server
   * @returns An array of players
   */
  public getPlayers(): Array<Player> {
    return [...this.players.values()];
  }

  /**
   * Gets the permission member for the specified player; creates a new member if one does not exist
   * @param player The player to get the member permission for.
   * @returns The member permission for the player.
   */
  public getPermissionMember(player: Player | string): PermissionMember {
    // Get the uuid of the player
    const uuid = typeof player === "string" ? player : player.uuid;

    // Attempt to find the member in the permissions
    const member = this.permissions.members.find((x) => x.uuid === uuid);

    // Check if the member was found
    if (member) return member;

    // Create a new permission member
    const newMember = new PermissionMember(uuid);

    // Add the member to the permissions
    this.permissions.members.push(newMember);

    // Write the permissions to the permissions path
    if (typeof this.properties.permissions === "string")
      this.writePermissions(this.properties.permissions);

    // Return the new member
    return newMember;
  }

  /**
   * Reads the server properties from the specified path
   * @param path The path to read the server properties from
   * @returns The server properties that were read
   */
  public readProperties(path: string): Partial<ServerProperties> {
    try {
      // Read the server properties from the file
      const buffer = readFileSync(resolve(path));

      // Parse the buffer as JSON
      return JSON.parse(buffer.toString());
    } catch {
      return {};
    }
  }

  /**
   * Writes the server properties to the specified path
   * @param path The path to write the server properties to
   * @returns Whether the properties were successfully written or not
   */
  public writeProperties(path: string) {
    try {
      // Create a partial properties object
      const properties: Partial<ServerProperties> = {
        serenity: this.properties,
        network: this.network.properties,
        raknet: this.network.raknet.properties
      };

      // Write the properties to the file
      writeFileSync(resolve(path), JSON.stringify(properties, null, 2));
    } catch {
      return false;
    }
  }

  public readPermissions(path: string): IPermissions {
    try {
      // Read the permissions from the file
      const buffer = readFileSync(resolve(path));

      // Parse the buffer as JSON
      return JSON.parse(buffer.toString());
    } catch {
      // Return an empty permissions object if the file could not be read
      return { groups: [], members: [] };
    }
  }

  public writePermissions(path: string) {
    try {
      // Convert the groups to a json representation
      const groups = this.permissions.groups.map((group) =>
        PermissionGroup.toObject(group)
      );

      // Convert the members to a json representation
      const members = this.permissions.members.map((member) =>
        PermissionMember.toObject(member)
      );

      // Write the permissions to the file
      writeFileSync(
        resolve(path),
        JSON.stringify({ groups, members }, null, 2)
      );
    } catch {
      return false;
    }
  }
}

export { Serenity };
