import {
  Serenity,
  LevelDBProvider,
  WorldEvent,
  PlayerHungerTrait,
  EntityItemStackTrait
} from "@serenityjs/core";
import { Pipeline } from "@serenityjs/plugins";

// Create a new Serenity instance
const serenity = new Serenity({
  port: 19142,
  permissions: "./permissions.json",
  resourcePacks: "./resource_packs",
  debugLogging: true
});

// Create a new plugin pipeline
const pipeline = new Pipeline(serenity, { path: "./plugins" });

// Initialize the pipeline
void pipeline.initialize(() => {
  // Register the LevelDBProvider
  serenity.registerProvider(LevelDBProvider, { path: "./worlds" });

  // Start the server
  serenity.start();
});

serenity.on(WorldEvent.PlayerChat, ({ player }) => {
  const hunger = player.getTrait(PlayerHungerTrait);

  hunger.currentValue = 20;
  hunger.saturation = 20;
  hunger.exhaustion = 0;
});

serenity.on(WorldEvent.EntitySpawned, ({ entity }) => {
  if (!entity.isItem()) return;

  const { itemStack } = entity.getTrait(EntityItemStackTrait);

  entity.alwaysShowNameTag = true;
  entity.nameTag = `${itemStack.type.identifier} x${itemStack.amount}`;
});
