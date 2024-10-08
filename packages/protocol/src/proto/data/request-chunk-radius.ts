import { Uint8, ZigZag } from "@serenityjs/binarystream";
import { Proto, Serialize } from "@serenityjs/raknet";

import { Packet } from "../../enums";

import { DataPacket } from "./data-packet";

@Proto(Packet.RequestChunkRadius)
class RequestChunkRadiusPacket extends DataPacket {
  @Serialize(ZigZag) public radius!: number;
  @Serialize(Uint8) public maxRadius!: number;
}

export { RequestChunkRadiusPacket };
