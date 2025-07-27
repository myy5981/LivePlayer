import asyncio
import websockets
import json
import hashlib

rooms = dict()

# 验证客户端身份
def authenticate(auth_data):
    # 检查必需字段
    required_fields = ["type", "room_id", "room_pwd", "hash"]
    if not all(field in auth_data for field in required_fields):
        return False, "Bad Request"

    # 验证消息类型
    if auth_data["type"] != "auth":
        return False, "Bad Request"

    if auth_data["room_id"] not in rooms:
        rooms[auth_data["room_id"]] = {
            "room_id": auth_data["room_id"],
            "room_pwd": auth_data["room_pwd"],
            "hash": auth_data["hash"],
            "members": []
        }
        return True, f"OK创建新房间(id={auth_data['room_id']})"
    else:
        if auth_data["room_pwd"] != rooms[auth_data["room_id"]]["room_pwd"]:
            return False, "密码错误"
        elif auth_data["hash"] != rooms[auth_data["room_id"]]["hash"]:
            return True, "警告：你与房间已有成员的视频不一致，可能导致同步进度异常"
        else:
            return True, "OK成功进入房间"


# WebSocket连接处理
async def handle_connection(websocket):
    flag = False
    try:
        # 第一步：接收并验证身份验证消息
        auth_message = await websocket.recv()
        try:
            auth_data = json.loads(auth_message)
        except json.JSONDecodeError:
            await websocket.send("""{"type":"status","msg":"Bad Request"}""")
            await websocket.close(reason="Bad Request")
            return

        # 进行身份验证
        auth_result, message = authenticate(auth_data)
        if not auth_result:
            await websocket.send("{\"type\":\"status\",\"msg\":\""+message+"\"}")
            await websocket.close(reason=message)
            return
        await websocket.send("{\"type\":\"status\",\"msg\":\""+message+"\"}")
        rooms[auth_data["room_id"]]["members"].append(websocket)
        flag = True
        print(f"""新用户连接至房间（id={auth_data["room_id"]}）""")

        while True:
            msg = await websocket.recv()
            data = json.loads(msg)
            if data["type"] == "ctl":
                for member in rooms[auth_data["room_id"]]["members"]:
                    if member != websocket:
                        await member.send(msg)
            print(data)
    except json.JSONDecodeError:
        await websocket.send("""{"type":"status","msg":"Bad Request"}""")
        await websocket.close(reason="Bad Request")
    except websockets.exceptions.ConnectionClosed:
        print("Client disconnected")
    except Exception as e:
        print(f"Unexpected error: {e}")
    finally:
        if flag:
            rooms[auth_data["room_id"]]["members"].remove(websocket)
            if len(rooms[auth_data["room_id"]]["members"])==0:
                rooms.pop(auth_data["room_id"])
        print("Connection closed")


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