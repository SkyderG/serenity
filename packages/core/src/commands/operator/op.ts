import { TargetEnum } from "../enums";

import type { World } from "../../world";
import type { Entity } from "../../entity";

const register = (world: World) => {
  world.commandPalette.register(
    "op",
    "Set the operator status of a player",
    (registry) => {
      // Set the permissions of the command
      registry.permissions = ["serenity.operator"];

      registry.overload(
        {
          target: TargetEnum
        },
        (context) => {
          // Get the targets from the context
          const targets = context.target.result as Array<Entity>;

          // Check if there are any targets
          if (targets.length === 0)
            throw new Error("No targets matched the selector.");

          // Prepare the return message
          const message = [];

          // Loop through all the targets
          for (const target of targets) {
            // Check if the target is a player
            if (!target.isPlayer()) {
              // Append the message
              message.push(
                `§cEntity §4${target.uniqueId}§c is not a player.§r`
              );

              // Skip to the next target
              continue;
            }

            // Check if the target is already a server operator
            if (target.isOp) {
              // Append the message
              message.push(
                `§cPlayer §4${target.username}§c is already a server operator or has a higher permission level.§r`
              );

              // Skip to the next target
              continue;
            }

            // Set the operator status of the player
            target.isOp = true;

            // Append the message
            message.push(
              `§aSuccessfully made §2${target.username}§a a server operator.§r`
            );
          }

          // Return the message
          return { message: message.join("\n") };
        }
      );
    },
    () => {}
  );
};

export default register;
