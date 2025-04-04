import { DataType } from "@serenityjs/raknet";

import type { BinaryStream } from "@serenityjs/binarystream";

class PackLinks extends DataType {
  public id: string;
  public url: string;

  public constructor(id: string, url: string) {
    super();
    this.id = id;
    this.url = url;
  }

  public static override read(stream: BinaryStream): Array<PackLinks> {
    // Prepare an array to store the packs.
    const packs: Array<PackLinks> = [];

    // Read the number of packs.
    const amount = stream.readVarInt();

    // We then loop through the amount of packs.
    // Reading the individual fields in the stream.
    for (let index = 0; index < amount; index++) {
      // Read all the fields for the pack.
      const id = stream.readVarString();
      const url = stream.readVarString();

      // Push the pack to the array.
      packs.push(new PackLinks(id, url));
    }

    // Return the packs.
    return packs;
  }

  public static override write(
    stream: BinaryStream,
    value: Array<PackLinks>
  ): void {
    // Write the number of packs given in the array.
    stream.writeVarInt(value.length);

    // Loop through the packs.
    for (const pack of value) {
      // Write the fields for the pack.
      stream.writeVarString(pack.id);
      stream.writeVarString(pack.url);
    }
  }
}

export { PackLinks };
