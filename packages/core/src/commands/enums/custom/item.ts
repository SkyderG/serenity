import { ItemType } from "../../../item";

import { CustomEnum } from ".";

const identifiers = ItemType.getAll().map((item) =>
  item.identifier.startsWith("minecraft:")
    ? item.identifier.slice(10)
    : item.identifier
);

class ItemEnum extends CustomEnum {
  public static readonly identifier = "items";
  public static readonly options = identifiers;
}

export { ItemEnum };
