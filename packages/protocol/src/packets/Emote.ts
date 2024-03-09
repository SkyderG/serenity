import { VarString, VarLong, Byte } from '@serenityjs/binarystream';
import { Packet, Serialize } from '@serenityjs/raknet-protocol';
import { DataPacket } from '../DataPacket.js';
import { EmoteType } from '../enums/EmoteType.js';
import { Packet as PacketId } from '../enums/index.js';

@Packet(PacketId.Emote)
class Emote extends DataPacket {
	@Serialize(VarLong) public entityRuntimeId!: bigint;
	@Serialize(VarString) public emoteId!: string;
	@Serialize(VarString) public xboxUserId!: string;
	@Serialize(VarString) public platformChatId!: string;
	@Serialize(Byte) public flags!: EmoteType;
}

export { Emote };
