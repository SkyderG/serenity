import { VarLong } from '@serenityjs/binarystream';
import { Packet, Serialize } from '@serenityjs/raknet-protocol';
import { DataPacket } from '../DataPacket.js';
import { Packet as PacketId } from '../enums/index.js';
import { Emotes } from '../types/Emotes.js';

@Packet(PacketId.EmoteList)
class EmoteList extends DataPacket {
	@Serialize(VarLong) public runtimeId!: bigint;
	@Serialize(Emotes) public emoteIds!: Emotes[];
}

export { EmoteList };
