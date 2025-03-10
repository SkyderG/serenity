import { DimensionType } from "@serenityjs/protocol";

import { WorldProperties } from "../types";

const DefaultWorldProperties: WorldProperties = {
  identifier: "default",
  seed: Math.floor(Math.random() * 2 ** 32),
  gamemode: "survival",
  difficulty: "normal",
  saveInterval: 5,
  dimensions: [
    {
      identifier: "overworld",
      type: DimensionType.Overworld,
      generator: "superflat",
      viewDistance: 20,
      simulationDistance: 10,
      spawnPosition: [0, 32767, 0]
    }
  ],
  gamerules: {
    showCoordinates: false,
    showDaysPlayed: false,
    doDayLightCycle: true,
    doImmediateRespawn: false,
    keepInventory: false,
    fallDamage: true,
    fireDamage: true,
    drowningDamage: true
  }
};

export { DefaultWorldProperties };
