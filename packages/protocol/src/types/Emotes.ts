import type { BinaryStream } from '@serenityjs/binarystream';
import { DataType } from '@serenityjs/raknet-protocol';

class Emotes extends DataType {
	public uuid: string;

	public constructor(uuid: string) {
		super();
    
		this.uuid = uuid;
	}

	public static override read(stream: BinaryStream): Emotes[] {
		const emotes: Emotes[] = [];

		const amount = stream.readVarInt();

		for (let i = 0; i < amount; i++) {
			const uuid = stream.readUuid();
      emotes.push(new Emotes(uuid));
		}
    
    return emotes;
	}

	public static override write(stream: BinaryStream, value: Emotes[]): void {
		stream.writeVarInt(value.length);

		for (const pack of value) {
			stream.writeUuid(pack.uuid);
		}
	}
}

export { Emotes };
