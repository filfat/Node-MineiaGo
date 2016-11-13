// MineiaGo
// Copyright (C) 2016  Filiph Sandström

'use strict';

let chat    = require(global.sdk + '/controllers/chat'),
    command = require(global.sdk + '/controllers/command'),
    color   = require(global.sdk + '/util/color').color,
    server  = require(global.sdk + '/controllers/server'),
    Player  = require(global.sdk + '/models/player'),
    log     = require(global.sdk + '/util/log'),
    parser  = require(global.sdk + '/util/playerParser'),
    //World   = require(global.sdk + '/controller/world'),
    Vector3 = require('vec3'),
    PrisChunk = require('prismarine-chunk')('pe_0.14'),
    Chunk   = require('prismarine-chunk')('1.9'),
    Minecraft = require('minecraft-protocol');

let temp_chunk = null;

function genLoginWorld (chunkX, chunkZ) {
    let chunk = new PrisChunk();

    var x, y, z;
    for (x = 0; x < 16; x++) {
        for (z = 0; z < 16; z++) {
            //Bedrock layer
            chunk.setBlockType(new Vector3(x, 0, z), 7);

            //Air layer
            for (y = 0; y < 128; y++) {
                chunk.setSkyLight(new Vector3(x, y, z), 15);
                chunk.setBlockLight(new Vector3(x, y, z), 15);
            }
        }
    }

    return chunk;
}
function PCToPEchunk(chunk) {
    let pe_chunk = new PrisChunk();

    var x, y, z;
    for (y = 0; y < 128; y++) {
        for (x = 0; x < 16; x++) {
            for (z = 0; z < 16; z++) {
                pe_chunk.setBlock(new Vector3(x, y, z), chunk.getBlock(new Vector3((15 - x), y, z)));
                pe_chunk.setBlockType(new Vector3(x, y, z), chunk.getBlockType(new Vector3((15 - x), y, z)));

                pe_chunk.setBlockData(new Vector3(x, y, z), chunk.getBlockData(new Vector3((15 - x), y, z))); //TODO
                pe_chunk.setBiome(new Vector3(x, y, z), chunk.getBiome(new Vector3((15 - x), y, z)));
                pe_chunk.setBiomeColor(new Vector3(x, y, z), 141, 184, 113);

                pe_chunk.setSkyLight(new Vector3(x, y, z), chunk.getBlockLight(new Vector3(x, y, z)));
                pe_chunk.setBlockLight(new Vector3(x, y, z), chunk.getBlockLight(new Vector3(x, y, z)));
            }
        }
    }

    return pe_chunk;
}

module.exports.init = function () {
    global.server.pmc.on('connection', module.exports.onClientConnect);

    //TODO: Send chat command asking for Mojang account email and password
};

module.exports.onClientConnect = function (client) {

    let player = new Player();
    player.client = client;

    player.client.on('game_login', (packet) => {
        if (packet.protocol != server.PROTOCOL) {
            if (packet.protocol > server.PROTOCOL)
                return player.client.writeMCPE('player_status', {
                    status: 2
                });
            else
                player.client.writeMCPE('player_status', {
                    status: 1
                });
        }

        parser(packet, (err, res) => {
            if (err)
                return log(err, 3);

            player.client.writeMCPE('player_status', {
                status: 0
            });

            if (res.username == null)
                return player.client.writeMCPE('disconnect', {
                    message: 'Username cannot be null'
                });
            

            //Create new player object
            player.uuid     = res.uuid;
            player.id       = res.id;
            player.username = res.username;
            player.formatedUsername = player.username;

            //Subscribe to global chat
            chat.subscribe('global.users', (message, sender) => {
                module.exports.sendChat(player, message, sender);
            });
            chat.subscribe('private.' + player.username, (message, sender) => {
                module.exports.sendChat(player, message, sender);
            });

            //Subscribe to onPlayerConnect and onPlayerDisconnect
            server.getEvents().on('onPlayerConnect', (pl) => {
                if (pl.uuid === player.uuid)
                    return;
                //TODO
            });
            server.getEvents().on('onPlayerDisconnect', (pl) => {
                if (pl.uuid === player.uuid)
                    return;
                //TODO
            });

            //Handle server stop
            server.getEvents().on('onServerStop', (message) => {
                player.client.writeMCPE('disconnect', {
                    message: message
                });
            });

            module.exports.addPlayer(player);

            player.client.writeMCPE('start_game', {
                entityId: [0, 0],
                runtimeEntityId: [0, 0],
                x: 0, y: 1 + 1.62, z: 0,
                unknownF1: 0,
                unknownF2: 0,

                seed: 1234,
                dimension: 0,
                generator: 1,
                gamemode: 1,
                difficulty: 0,
                
                spawnX: 1,
                spawnY: 105,
                spawnZ: 1,

                achievementsDisabled: false,
                dayCycleStopTime: -1,
                eduMode: false,

                rainLevel: 0,
                lightningLevel: 0,

                enableCommands: false,
                requireResourcePack: false,
                levelId: 'temp',
                worldName: 'temp'
            });

            player.client.writeMCPE('adventure_settings', {
                flags: 0x040,
                userPermission: 3,
            });


            if (player.m_email !== null)
                module.exports.connectToPC(player);
            else
                module.exports.sendChat(player, 'Please enter your Mojang email:');
        });
    });

    player.client.on('move_player', (packet) => {
        if (!player.pos.x)
            return;
        
        //console.log('PE: ' + packet.x + ',' + packet.z);
    
        //console.log(packet);

        //TODO: Update position function
        player.pos.x = packet.x;
        player.pos.y = packet.y;
        player.pos.z = packet.z;

        player.yaw = packet.yaw;
        player.headYaw = packet.headYaw;
        player.pitch = packet.pitch;

        player.client_pc.write('position_look', {
            x: player.pos.x,
            y: player.pos.y - 1.62,
            z: player.pos.z,

            yaw: player.yaw,
            pitch: player.pitch,
            flags: 0x00,
            teleportId: player.teleportId,
        });
    });
    player.client.on('remove_block', (packet) => {
        //FIXME: Remove block from world
        //FIXME: Notify clients
        //FIXME: Drop item in survival
        player.client.writeMCPE('block_dig', {
            status: 2,
            face: 1,
            x: packet.x,
            y: packet.y,
            z: packet.z,
            type: 0,
        });
    });
    player.client.on('use_item', (packet) => {
        //FIXME: Add block to world
        //FIXME: Notify clients
        //FIXME: Remove item in survival
        //FIXME: Doesn't place block
        console.log(packet);
        player.client.writeMCPE('update_block', {
            blocks: [{
                x: packet.blockcoordinates.x,
                y: packet.blockcoordinates.y + 1,
                z: packet.blockcoordinates.z,
                blockId: 4,
                blockData: 0,
                flags: 0
            }]
        });
    });
    player.client.on('request_chunk_radius', (packet) => {
        console.log(packet);
        //if (!player.connected_to_pc) {
            //sconsole.log(packet);

        //Generate login world
        player.client.writeMCPE('chunk_radius_update', {
            chunk_radius: 22
        });

        return;

        /*for (let x = -1; x <= 1; x++) {
            for (let z = -1; z <= 1; z++) {
                let chunk = genLoginWorld(x, z);
                player.client.writeBatch([{name: 'full_chunk_data', params: {
                    chunkX: x,
                    chunkZ: z,
                    order: 1,
                    chunkData: chunk.dump()
                }}]);
            }
        }*/

        player.client.writeMCPE('set_time', {
            time: 0,
            started: 1
        });
    });

    player.client.on('text', (packet) => {
        module.exports.onChat(player, packet.message);
    });
    player.client.on('error', (err) => {
        return log(err, -1);
    });
    player.client.on('end', (packet) => {
        module.exports.onClientDisconnect(player);
    });
};
module.exports.onClientDisconnect = function (player) {
    module.exports.removePlayer(player);
};

module.exports.addPlayer = function (player) {
    //FIXME: Check if player already is connected

    if (global.server.players.map(function (e) { return e.uuid; }).indexOf(player.uuid) > -1) {
        let username = player.username; player.username = null;
        return module.exports.disconnectPlayer(player, username + ' is already connected!');
    }

    global.server.players.push(player);
    server.getEvents().emit('onPlayerConnect', player);
};
module.exports.removePlayer = function (player) {
    if (!player || !player.username)
        return;

    for (var n = 0; n < global.server.players.length; n++) {
        if (global.server.players[n].username == player.username)
            global.server.players.splice(n, 1);
    }

    player.connected = false;
    server.getEvents().emit('onPlayerDisconnect', player);
};
module.exports.disconnectPlayer = function (player, message) {
    module.exports.removePlayer(player);
    return player.client.writeMCPE('disconnect', {
        message: message
    });
};

module.exports.onChat = function (player, message) {
    if (player.waiting_m_email) {

        module.exports.sendChat(player, 'Please enter your Mojang password:');
        player.waiting_m_email = false;
        return player.m_email = message;
    } else if (player.waiting_m_passw) {

        module.exports.sendChat(player, 'Connecting to PC server...');
        player.waiting_m_passw = false;
        player.m_password = message;

        return module.exports.connectToPC(player);
    }

    if (!player.client_pc)
        return; //TODO: error
    
    player.client_pc.write('chat', {message: message});
};
module.exports.sendChat = function (player, message, sender) {
    player.client.writeMCPE('text', {
        type: 1,
        name: '',
        message: message
    });
};

module.exports.getPlayer = function (username) {
    let index = global.server.players.map(function (e) { return e.username; }).indexOf(username);
    if (index > -1)
        return global.server.players[index];
    else
        return null;
};

module.exports.connectToPC = function (player) {
    try {
        player.client_pc = Minecraft.createClient({
            host: global.config.mcpcIp,
            port: 25565, //TODO
            username: player.m_email,
            //password: player.m_password,
            version: '1.10'
        });

        player.client_pc.on('connect', function(packet) {
            console.log('Connected');
            module.exports.sendChat(player, 'Connected!!');

            player.client_pc.on('login', (packet) => {
                player.gameMode = packet.gameMode;
                player.dimension = packet.dimension;
                player.pc_id = packet.entityId;
                //server.maxPlayers = packet.maxPlayers;

                player.client_pc.on('position', (packet) => {
                    player.teleportId = packet.teleportId;

                    player.client_pc.write('teleport_confirm', {
                        teleportId: player.teleportId,
                    });

                    player.pos.x = packet.x;
                    player.pos.y = packet.y;
                    player.pos.z = packet.z;
                    player.yaw = packet.yaw;

                    player.client.writeMCPE('respawn', {
                        x: packet.x,
                        y: packet.y + 1.62,
                        z: packet.z
                    });

                    player.client.writeMCPE('player_status', {
                        status: 3
                    });
                });

                player.client_pc.on('kick_disconnect', function(packet) {
                    module.exports.sendChat(player, 'Disconnected (' + packet.reason + ')!!');
                });

                player.client_pc.on('disconnect', function() {
                    console.log('Disconnected');
                    module.exports.sendChat(player, 'Disconnected!!');
                });

                player.client_pc.on('chat', function(packet) {
                    let message = JSON.parse(packet.message);

                    switch (message.translate) {
                        case 'chat.type.announcement': {

                            let msg = '§5[' + message.with[0].text + '] ';
                            for (var n = 0; n < message.with[1].extra.length; n++) {
                                msg += message.with[1].extra[n].text;
                            }

                            chat.broadcast('private.' + player.username, msg, null);
                            break;
                        }

                        case 'chat.type.text': {
                            let msg = '<' + message.with[0].text + '> ';
                            for (var n = 1; n < message.with.length; n++) {
                                msg += message.with[n];
                            }

                            chat.broadcast('private.' + player.username, msg, null);
                            break;
                        }

                        default:
                            chat.broadcast('private.' + player.username, JSON.stringify(message), null);
                            console.log(message);
                            break;
                    };
                });

                player.client_pc.on('game_state_change', (packet) => {
                    //TODO
                    console.log(packet);
                });
                player.client_pc.on('player_info', (packet) => {
                    //console.log(packet);

                    if (packet.data[0].name == player.username)
                        return;
                    
                    //Add Players
                    /*let defaultMetadata = [
                        {
                            type: 0,
                            key: 0,
                            value: 0
                        },
                        {
                            type: 1,
                            key: 1,
                            value: 200 + 100
                        },
                        {
                            type: 4,
                            key: 2,
                            value: packet.name
                        },
                        {
                            type: 0,
                            key: 3,
                            value: 1
                        },
                        {
                            type: 0,
                            key: 4,
                            value: 0
                        },
                        {
                            type: 0,
                            key: 15,
                            value: 0
                        },
                        {
                            type: 6,
                            key: 17,
                            value: {
                            x: 0,
                            y: 0,
                            z: 0
                            }
                        }
                    ];
                    player.client.writeMCPE('add_player', {
                        uuid: packet.uuid,
                        username: packet.name,
                        entity_id: [0,1],
                        x: 0,
                        y: 0,
                        z: 0,
                        speedX: 0,
                        speedY: 0,
                        speedZ: 0,
                        yaw: 0,
                        headYaw: 0,
                        pitch: 0,
                        item: { block_id: 0 },
                        metadata: defaultMetadata,
                    });*/
                });

                player.client_pc.on('block_change', (packet) => {
                    console.log(packet);

                    if (packet.type == 0)
                        return player.client.writeMCPE('update_block', {
                            blocks: [
                                {
                                    x: packet.location.x,
                                    y: packet.location.y,
                                    z: packet.location.z,
                                    blockId: 0,
                                    blockData: 0,
                                    flags: 0
                                }
                            ]
                        });

                    player.client.writeMCPE('update_block', {
                        blocks: [
                            {
                                x: packet.location.x,
                                y: packet.location.y,
                                z: packet.location.z,
                                blockId: packet.type,
                                blockData: 0xb,
                                flags: (0 & 0x8)
                            }
                        ]
                    });
                });

                player.client_pc.on('map_chunk', (packet) => {
                    try {
                        if (!player.world)
                            player.world = {};

                        let chunk = new Chunk();
                        chunk.load(packet.chunkData, packet.bitMap);
                        if (player.world[packet.x.toString()] && player.world[packet.x.toString()][packet.z.toString()])
                            console.log(player.world[packet.x.toString()][packet.z.toString()]);

                        let pe_chunk = PCToPEchunk(chunk);

                        player.world[packet.x.toString()] = {};
                        player.world[packet.x.toString()][packet.z.toString()] = {
                            chunk: chunk,
                        };


                        player.client.writeBatch([{name: 'full_chunk_data', params: {
                            chunkX: packet.x,
                            chunkZ: packet.z,
                            order: 1,
                            chunkData: pe_chunk.dump()
                        }}]);

                        //console.log(packet);
                        //console.log(player.world);
                    } catch (err) {
                        console.log(err);
                    };
                });


                player.client_pc.on('update_time', (packet) => {
                    player.client.writeMCPE('set_time', {
                        time: packet.time[1],
                        started: 1,
                    });
                });

                player.client_pc.on('keep_alive', (packet) => {
                    player.client_pc.write('keep_alive', packet);
                });
            });
        });
        player.client_pc.on('end', function() {
            console.log("Connection lost");
            process.exit();
        });

        player.client_pc.on('error', function(err) {
            console.log("Error occured");
            console.log(err);
        });

    } catch (err) {
        console.log(err);
    }
};