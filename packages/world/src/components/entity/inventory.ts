import { ContainerId } from "@serenityjs/protocol";

import { EntityContainer } from "../../container";
import { Entity } from "../../entity";

import { EntityComponent } from "./entity-component";

class EntityInvetoryComponent extends EntityComponent {
	public readonly identifier = "minecraft:inventory";

	public readonly container: EntityContainer;

	public readonly containerId: ContainerId;

	public readonly inventorySize: number;

	public selectedSlot: number = 0;

	public constructor(entity: Entity) {
		super(entity);
		this.containerId = ContainerId.Inventory;
		this.inventorySize = 36;
		this.container = new EntityContainer(
			entity,
			this.containerId,
			this.inventorySize
		);
	}
}

export { EntityInvetoryComponent };
