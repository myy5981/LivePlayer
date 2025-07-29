import asyncio
import time

import websockets
import json

rooms = dict()

STATUS_CREATE = 4
STATUS_ENTER = 0
STATUS_WARNING = 1
STATUS_FAILURE = 2

# 验证客户端身份
def authenticate(auth_data):
    # 检查必需字段
    required_fields = ["type", "room_id", "room_pwd", "hash", "user", "key"]
    if not all(field in auth_data for field in required_fields):
        return STATUS_FAILURE, "Bad Request"

    # 验证消息类型
    if auth_data["type"] != "auth":
        return STATUS_FAILURE, "Bad Request"

    if auth_data["room_id"] not in rooms:
        rooms[auth_data["room_id"]] = {
            "room_id": auth_data["room_id"],
            "room_pwd": auth_data["room_pwd"],
            "hash": auth_data["hash"],
            "members": [],
            "danmakus": [],
            "history": [],
            "running": False,
            "rate": 1
        }
        return STATUS_CREATE, f"创建新房间(id={auth_data['room_id']})"
    else:
        if auth_data["room_pwd"] != rooms[auth_data["room_id"]]["room_pwd"]:
            return STATUS_FAILURE, "密码错误"
        elif auth_data["hash"] != rooms[auth_data["room_id"]]["hash"]:
            return STATUS_WARNING, "警告：你与房间已有成员的视频不一致，可能导致同步进度异常"
        else:
            return STATUS_ENTER, "成功进入房间"


# WebSocket连接处理
def getTime(history,running,rate):
    if len(history) == 0:
        return 0
    t = history[-1]["data"]["time"]
    ts = history[-1]["data"]["ts"]
    current = int(time.time()*1000)
    if(running):
        return t+(current-ts)/1000*rate
    else:
        return t


async def handle_connection(websocket):
    flag = False
    room = None
    auth_data = None
    user = None
    try:
        # 第一步：接收并验证身份验证消息
        auth_message = await websocket.recv()
        try:
            auth_data = json.loads(auth_message)
        except json.JSONDecodeError:
            await websocket.send("""{"type":"status","code":2,"msg":"Bad Request"}""")
            await websocket.close(reason="Bad Request")
            return

        # 进行身份验证
        auth_result, message = authenticate(auth_data)
        if auth_result == STATUS_FAILURE:
            await websocket.send("{\"type\":\"status\",\"code\":2,\"msg\":\""+message+"\"}")
            await websocket.close(reason=message)
            return
        room = rooms[auth_data["room_id"]]
        user = auth_data["user"]
        if auth_result == STATUS_ENTER:
            resp = {
                "type": "status",
                "code": auth_result,
                "msg": message,
                "time": getTime(room["history"],room["running"],room["rate"]),
                "rate": room["rate"],
                "running": room["running"],
                "danmakus": room["danmakus"],
            }
            await websocket.send(json.dumps(resp))
        else:
            await websocket.send("{\"type\":\"status\",\"code\":"+str(auth_result)+",\"msg\":\""+message+"\"}")
        room["members"].append(websocket)
        flag = True
        print(f"""新用户{user}连接至房间（id={auth_data["room_id"]}）""")

        while True:
            msg = await websocket.recv()
            data = json.loads(msg)
            if data["type"] == "ctl":
                #记录
                if data["action"] == "danmaku_send":
                    room["danmakus"].append(data["data"])
                else:
                    room["history"].append({'user':user, 'data':data})
                    if data["action"] == "pause":
                        room["running"] = False
                    elif data["action"] == "play":
                        room["running"] = True
                    elif data["action"] == "ratechange":
                        room["rate"] = data["rate"]
                #转发
                for member in room["members"]:
                    if member != websocket:
                        await member.send(msg)
            print(user+':',end='')
            print(data)
    except json.JSONDecodeError:
        await websocket.send("""{"type":"status","msg":"Bad Request"}""")
        await websocket.close(reason="Bad Request")
    except websockets.exceptions.ConnectionClosed:
        print("Client disconnected")
    except Exception as e:
        print(f"Unexpected error: {e}")
    finally:
        if flag and room is not None and auth_data is not None:
            room["members"].remove(websocket)
            print(f'remove user {user}')
            if len(room["members"])==0:
                print(f'remove room {room["room_id"]}')
                rooms.pop(room["room_id"])


# 启动服务器
async def main():
    server = await websockets.serve(
        handle_connection,
        "0.0.0.0",  # 监听地址
        5000,  # 监听端口
        ping_interval=20,  # 保持连接活跃
        ping_timeout=20
    )
    print("WebSocket server started on ws://0.0.0.0:5000")
    await server.wait_closed()

if __name__ == "__main__":
    asyncio.run(main())