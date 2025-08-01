const fileInput = document.getElementById('file-input');
const fileUpload = document.getElementById('file-upload');
const fileName = document.getElementById('file-name');
const enterRoom = document.getElementById('enter-btn');
const roomId = document.getElementById('room-id');
const roomPwd = document.getElementById('room-pwd');
const roomSrv = document.getElementById('room-srv');
const userId = document.getElementById('user-id');
const userKey = document.getElementById('user-token');

let dp=null
let ws=null

let video_name=null
let video_size=null
let video_hash=null
let video_url=null
let room_id=null
let room_pwd=null
let room_srv=null
let user_id=null
let user_key=null
let danmaku_list=null

window.onload = function(){
    const urlParams = new URLSearchParams(window.location.search);
    const romId = urlParams.get('id');
    const romPwd = urlParams.get('pwd');
    const romSrv = urlParams.get('srv');
    const uId = urlParams.get('user');
    const uKey = urlParams.get('key')

    if (romId && roomId) roomId.value = romId;
    if (romPwd && roomPwd) roomPwd.value = romPwd;
    if (romSrv && roomSrv) roomSrv.value = romSrv;
    if (uKey && userKey) userKey.value = uKey;
    if (uId && userId){
        userId.value = uId;
    }else{
        userId.value = `用户${Math.floor(100000 + Math.random() * 900000).toString()}`
    }
}

function getFileHashBeforeSplit(file, chunkSize = 2 * 1024 * 1024, onProgress) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      const hasher = CryptoJS.algo.SHA256.create()
      let offset = 0

      // 错误处理
      reader.onerror = () => reject(new Error('文件读取失败'))

      // 分块处理
      reader.onload = (e) => {
        try {
          // 将 ArrayBuffer 转换为 CryptoJS 格式
          const wordArray = CryptoJS.lib.WordArray.create(
            new Uint8Array(e.target.result)
          )

          // 更新哈希计算
          hasher.update(wordArray)

          // 触发进度更新
          if (typeof onProgress === 'function') {
            onProgress(offset, file.size)
          }

          // 继续读取下一个分块
          offset += chunkSize
          if (offset < file.size) {
            readNextChunk()
          } else {
            // 最终计算哈希
            const finalHash = hasher.finalize()
            resolve(finalHash.toString(CryptoJS.enc.Hex))
          }
        } catch (err) {
          reject(err)
        }
      }

      // 读取下一个分块
      const readNextChunk = () => {
        const chunk = file.slice(offset, offset + chunkSize)
        reader.readAsArrayBuffer(chunk)
      }

      // 开始处理-调用readAsArrayBuffer 触发reader.onload
      readNextChunk()
    })
}

async function handleVideoFile(file) {
    if (!file.type.match('video.*')) {
        alert('请选择有效的视频文件！');
        return;
    }
    fileUpload.style.display='none'
    fileName.style.display='flex'
    const videoName = file.name;
    const videoSize = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
    const hashStr = await getFileHashBeforeSplit(file);

    video_name=videoName
    video_size=videoSize
    video_hash=hashStr
    video_url = URL.createObjectURL(file)
    fileName.innerHTML = `<p>文件名:${videoName}</p><p>文件大小:${videoSize}</p><p>SHA256:${hashStr}</p>`
}

const eventMark = {
    play: false,
    pause: false,
    ratechange: false,
    seeked: false,
    danmaku_send: false
}

/*
options: {
            url: this.options.api.address + 'v3/',
            data: danmakuData,
            success: callback,
            error: (msg) => {
                this.options.error(msg || this.options.tran('danmaku-failed'));
            },
        }
 */

function onDanmakuSend(options){
    ws.send(JSON.stringify({
        type:'ctl',
        action:'danmaku_send',
        ts:Date.now(),
        data:{
            author:options.data.author,
            text:options.data.text,
            color:options.data.color,
            type:options.data.type,
            time:options.data.time
        }
    }))
    options.success && options.success();
}

function onDanmakuRead(options){
    options.success && options.success(danmaku_list)
}

function initPlayer(time,rate,running){
    //显示播放器窗口
    dp = new DPlayer({
        container: document.getElementById('video-container'),
        video: {
            url: video_url
        },
        danmaku: {
            id: video_hash,
            maximum: 1000,
            user: user_id,
            bottom: '15%',
            unlimited: true
        },
        apiBackend: {
            read: onDanmakuRead,
            send: onDanmakuSend
        },
        playbackSpeed: [0.5,1,1.5,2,3],
        screenshot: true
    })

    dp.on('pause',(e)=>{
        if(eventMark.pause){
            eventMark.pause=false
            return
        }
        ws.send(JSON.stringify({
            type:'ctl',
            action:'pause',
            time:dp.video.currentTime,
            ts:Date.now()
        }))
    })

    dp.on('play',(e)=>{
        if(eventMark.play){
            eventMark.play=false
            return
        }
        ws.send(JSON.stringify({
            type:'ctl',
            action:'play',
            time:dp.video.currentTime,
            ts:Date.now()
        }))
    })

    dp.on('ratechange',(e)=>{
        if(eventMark.ratechange){
            eventMark.ratechange=false
            return
        }
        ws.send(JSON.stringify({
            type:'ctl',
            action:'ratechange',
            time:dp.video.currentTime,
            rate:dp.video.playbackRate,
            ts:Date.now()
        }))
    })

    dp.on('seeked',(e)=>{
        if(eventMark.seeked){
            eventMark.seeked=false
            return
        }
        ws.send(JSON.stringify({
            type:'ctl',
            action:'seeked',
            time:dp.video.currentTime,
            ts:Date.now()
        }))
    })

    if(time!==undefined&&time!==0){
        eventMark.seeked=true
        dp.seek(time)
    }
    if(rate!==undefined&&rate!==1){
        eventMark.ratechange=true
        dp.speed(rate)
    }
    if(running!==undefined&&running){
        eventMark.play=true
        dp.play()
    }
}

function handleWsMessage(msg){
    let data = JSON.parse(msg.data)
    console.log(data)
    if(data.type === 'ctl') {
        if(data.action === 'play'){
            eventMark.play=true
            dp.play()
        }else if(data.action === 'pause'){
            eventMark.pause=true
            dp.pause()
        }else if(data.action === 'ratechange'){
            eventMark.ratechange=true
            dp.speed(data.rate)
        }else if(data.action === 'seeked'){
            eventMark.seeked=true
            dp.seek(data.time)
        }else if(data.action === 'danmaku_send'){
            //待完成：实时绘制弹幕，但不调用send
            dp.danmaku.dan.splice(dp.danmaku.danIndex, 0, data.data);
            dp.danmaku.danIndex++;
            const danmaku = {
                text: dp.danmaku.htmlEncode(data.data.text),
                color: data.data.color,
                type: data.data.type,
                border: `2px solid ${dp.danmaku.options.borderColor}`,
            };
            dp.danmaku.draw(danmaku);
        }
    }else if(data.type === "status") {
        if(data.code === 0){
            // 从响应中读取数据
            danmaku_list = data.danmakus
            // 启动
            initPlayer(data.time,data.rate,data.running)
        }else if(data.code === 4){
            danmaku_list = []
            initPlayer()
        }else {
            alert(data.msg)
        }
    }
}

function enterTheRoom(id,pwd,hash,ws_url) {
    if(ws!==null){
        ws.close()
    }
    //向websocket服务器校验id,pwd,hash能否对的上
    ws = new WebSocket(ws_url)
    ws.onerror = ()=>{
        alert(`连接至服务器${ws_url}失败`)
    }
    ws.onopen = ()=>{
        ws.send(JSON.stringify({
            type:'auth',
            room_id:id,
            room_pwd:pwd,
            hash:hash,
            user:user_id,
            key:user_key
        }))
    }
    ws.onmessage = handleWsMessage;
}